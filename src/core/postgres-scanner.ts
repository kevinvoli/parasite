import pg from "pg";
import path from "path";
import { ParsedEntity, EntityProperty } from "../types.js";
import { camelCase, kebabCase, toPascalCase } from "../utils/string-formatters.js";
import { DatabaseScanner } from "./db-scanner.js";

const { Client } = pg;

function mapPostgresTypeToTS(pgType: string): string {
  const type = pgType.toLowerCase();
  if (["integer", "bigint", "smallint", "numeric", "decimal", "real", "double precision", "money"].includes(type)) return "number";
  if (["character varying", "varchar", "character", "char", "text", "uuid"].includes(type)) return "string";
  if (["date", "timestamp with time zone", "timestamp without time zone", "time with time zone", "time without time zone"].includes(type)) return "Date";
  if (["boolean"].includes(type)) return "boolean";
  return "any";
}

export class PostgresScanner implements DatabaseScanner {
  async introspect(dbUrl: string, outputDir: string = "parasite-app"): Promise<ParsedEntity[]> {
    const client = new Client({ connectionString: dbUrl });
    await client.connect();

    try {
      const tablesRes = await client.query(`
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
        AND table_name != 'spatial_ref_sys';
      `);
      const tableNames = tablesRes.rows.map(row => row.table_name);

      if (tableNames.length === 0) {
        throw new Error("❌ Aucune table trouvée dans la base de données.");
      }

      const allEntities: Record<string, ParsedEntity> = {};
      const srcDir = path.join(path.resolve(outputDir), "src");

      // First pass: populate entities with direct properties, ManyToOne and OneToOne
      for (const tableName of tableNames) {
        const columnsRes = await client.query(`
          SELECT column_name, udt_name, is_nullable
          FROM information_schema.columns
          WHERE table_name = $1 AND table_schema = 'public'`, [tableName]);

        // Get ALL primary key columns (supports composite PKs)
        const pkRes = await client.query(`
          SELECT kcu.column_name
          FROM information_schema.key_column_usage AS kcu
          JOIN information_schema.table_constraints AS tc ON kcu.constraint_name = tc.constraint_name
          WHERE tc.constraint_type = 'PRIMARY KEY' AND kcu.table_name = $1 AND kcu.table_schema = 'public'`, [tableName]);
        const primaryKeys = new Set<string>(pkRes.rows.map(row => row.column_name));

        const fkRes = await client.query(`
          SELECT
              kcu.column_name,
              ccu.table_name AS foreign_table_name
          FROM information_schema.table_constraints AS tc
          JOIN information_schema.key_column_usage AS kcu ON tc.constraint_name = kcu.constraint_name
          JOIN information_schema.constraint_column_usage AS ccu ON ccu.constraint_name = tc.constraint_name
          WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_name = $1 AND tc.table_schema = 'public'`, [tableName]);

        // Detect UNIQUE constraint columns for OneToOne detection
        const uniqueRes = await client.query(`
          SELECT kcu.column_name
          FROM information_schema.table_constraints AS tc
          JOIN information_schema.key_column_usage AS kcu ON tc.constraint_name = kcu.constraint_name
          WHERE tc.constraint_type = 'UNIQUE' AND tc.table_name = $1 AND tc.table_schema = 'public'`, [tableName]);
        const uniqueColumnNames = new Set<string>(uniqueRes.rows.map(row => row.column_name));

        const className = toPascalCase(tableName);
        const properties: EntityProperty[] = [];

        for (const col of columnsRes.rows) {
          const type = mapPostgresTypeToTS(col.udt_name);
          const isPrimary = primaryKeys.has(col.column_name);
          const isOptional = col.is_nullable === "YES";

          const fk = fkRes.rows.find(fk => fk.column_name === col.column_name);
          if (fk) {
            const relatedEntity = toPascalCase(fk.foreign_table_name);
            const relationName = camelCase(fk.foreign_table_name).replace(/s$/, "");
            const isUniqueFk = uniqueColumnNames.has(col.column_name);
            const relationType = isUniqueFk ? "OneToOne" : "ManyToOne";
            properties.push({
              name: relationName,
              type: relatedEntity,
              dtoType: "number",
              isPrimary,
              isOptional,
              isRelation: true,
              isJoinColumn: false,
              isOwningRelation: true,
              relatedEntity,
              relationType,
              relationFieldName: relationName,
              inverseSide: camelCase(tableName),
              joinColumnName: col.column_name,
            });
          } else {
            properties.push({
              name: camelCase(col.column_name),
              type,
              dtoType: type === "Date" ? "string" : type,
              isPrimary,
              isOptional,
              isRelation: false,
              isJoinColumn: false,
              joinColumnName: col.column_name,
            });
          }
        }
        allEntities[tableName] = {
          name: className,
          originalTableName: tableName,
          filePath: path.join(srcDir, kebabCase(className), `${kebabCase(className)}.entity.ts`),
          properties,
        };
      }

      // Second pass: detect ManyToMany via join table heuristics
      const joinTablesToExclude: string[] = [];
      for (const tableName of tableNames) {
        const entity = allEntities[tableName];
        if (!entity) continue;

        const pkProperties = entity.properties.filter(p => p.isPrimary);
        const fkProperties = entity.properties.filter(p => p.isRelation && (p.relationType === "ManyToOne" || p.relationType === "OneToOne"));

        // Heuristic: a join table has exactly 2 properties, both FK and PK, pointing to different entities
        if (
          fkProperties.length === 2 &&
          pkProperties.length === 2 &&
          pkProperties.every(pk => fkProperties.some(fk => fk.joinColumnName === pk.joinColumnName)) &&
          entity.properties.length === 2 &&
          fkProperties[0].relatedEntity !== fkProperties[1].relatedEntity
        ) {
          joinTablesToExclude.push(entity.originalTableName);

          const entityA = Object.values(allEntities).find(e => e.name === fkProperties[0].relatedEntity);
          const entityB = Object.values(allEntities).find(e => e.name === fkProperties[1].relatedEntity);

          if (entityA && entityB) {
            // Owning side (entityA) has @JoinTable
            entityA.properties.push({
              name: camelCase(entityB.originalTableName),
              type: `${entityB.name}[]`,
              isPrimary: false,
              isOptional: true,
              isRelation: true,
              isOwningRelation: true,
              relationType: "ManyToMany",
              relatedEntity: entityB.name,
              relationFieldName: camelCase(entityB.originalTableName),
              inverseSide: camelCase(entityA.originalTableName),
              joinColumnName: fkProperties[0].joinColumnName,
              inverseJoinColumnName: fkProperties[1].joinColumnName,
              joinTableName: tableName,
              dtoType: "number[]",
            });

            // Inverse side (entityB) — no @JoinTable
            entityB.properties.push({
              name: camelCase(entityA.originalTableName),
              type: `${entityA.name}[]`,
              isPrimary: false,
              isOptional: true,
              isRelation: true,
              isOwningRelation: false,
              relationType: "ManyToMany",
              relatedEntity: entityA.name,
              relationFieldName: camelCase(entityA.originalTableName),
              inverseSide: camelCase(entityB.originalTableName),
              joinColumnName: fkProperties[1].joinColumnName,
              inverseJoinColumnName: fkProperties[0].joinColumnName,
              joinTableName: tableName,
              dtoType: "number[]",
            });
          }
        }
      }

      // Third pass: generate inverse relations (OneToMany, inverse OneToOne, inverse ManyToMany)
      for (const tableName of tableNames) {
        const entity = allEntities[tableName];
        if (!entity) continue;
        if (joinTablesToExclude.includes(entity.originalTableName)) continue;

        for (const otherTableName of tableNames) {
          if (otherTableName === tableName) continue;
          const otherEntity = allEntities[otherTableName];
          if (!otherEntity) continue;
          if (joinTablesToExclude.includes(otherEntity.originalTableName)) continue;

          for (const prop of otherEntity.properties) {
            if (prop.isRelation && prop.relatedEntity === entity.name) {
              const alreadyHasManyToMany = entity.properties.some(
                p => p.isRelation && p.relationType === "ManyToMany" && p.relatedEntity === otherEntity.name
              );
              if (alreadyHasManyToMany) continue;

              let inverseRelationType: "OneToOne" | "ManyToOne" | "OneToMany" | "ManyToMany";
              let inversePropName: string;
              let inversePropType: string;
              let inverseIsOptional: boolean;

              if (prop.relationType === "OneToOne") {
                inverseRelationType = "OneToOne";
                inversePropName = camelCase(otherTableName).replace(/s$/, "");
                inversePropType = otherEntity.name;
                inverseIsOptional = prop.isOptional;
              } else if (prop.relationType === "ManyToOne") {
                inverseRelationType = "OneToMany";
                inversePropName = camelCase(otherTableName);
                inversePropType = `${otherEntity.name}[]`;
                inverseIsOptional = true;
              } else if (prop.relationType === "ManyToMany") {
                inverseRelationType = "ManyToMany";
                inversePropName = camelCase(otherTableName);
                inversePropType = `${otherEntity.name}[]`;
                inverseIsOptional = true;
              } else {
                continue;
              }

              const inverseProp: EntityProperty = {
                name: inversePropName,
                type: inversePropType,
                isPrimary: false,
                isOptional: inverseIsOptional,
                isRelation: true,
                relationType: inverseRelationType,
                relatedEntity: otherEntity.name,
                relationFieldName: camelCase(otherTableName),
                inverseSide: entity.name,
                joinColumnName: prop.joinColumnName,
                inverseJoinColumnName: prop.inverseJoinColumnName,
                joinTableName: prop.joinTableName,
                dtoType: inverseRelationType === "OneToOne" ? "number" : "number[]",
              };
              entity.properties.push(inverseProp);
            }
          }
        }
      }

      return Object.values(allEntities).filter(ent => !joinTablesToExclude.includes(ent.originalTableName));
    } finally {
      await client.end();
    }
  }
}
