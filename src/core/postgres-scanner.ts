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

      for (const tableName of tableNames) {
        const columnsRes = await client.query(`
          SELECT column_name, udt_name, is_nullable
          FROM information_schema.columns
          WHERE table_name = $1 AND table_schema = 'public'`, [tableName]);

        const pkRes = await client.query(`
          SELECT kcu.column_name
          FROM information_schema.key_column_usage AS kcu
          JOIN information_schema.table_constraints AS tc ON kcu.constraint_name = tc.constraint_name
          WHERE tc.constraint_type = 'PRIMARY KEY' AND kcu.table_name = $1 AND kcu.table_schema = 'public'`, [tableName]);
        const primaryKey = pkRes.rows[0]?.column_name;

        const fkRes = await client.query(`
          SELECT
              kcu.column_name,
              ccu.table_name AS foreign_table_name
          FROM information_schema.table_constraints AS tc
          JOIN information_schema.key_column_usage AS kcu ON tc.constraint_name = kcu.constraint_name
          JOIN information_schema.constraint_column_usage AS ccu ON ccu.constraint_name = tc.constraint_name
          WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_name = $1 AND tc.table_schema = 'public'`, [tableName]);

        const className = toPascalCase(tableName);
        const properties: EntityProperty[] = [];

        for (const col of columnsRes.rows) {
          const type = mapPostgresTypeToTS(col.udt_name);
          const isPrimary = col.column_name === primaryKey;
          const isOptional = col.is_nullable === "YES";

          const fk = fkRes.rows.find(fk => fk.column_name === col.column_name);
          if (fk) {
            const relatedEntity = toPascalCase(fk.foreign_table_name);
            const relationName = camelCase(fk.foreign_table_name).replace(/s$/, "");
            properties.push({
              name: relationName,
              type: relatedEntity,
              dtoType: "number",
              isPrimary: false,
              isOptional,
              isRelation: true,
              isJoinColumn: false,
              relatedEntity,
              relationType: "ManyToOne",
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
          filePath: path.join(srcDir, kebabCase(className), `${kebabCase(className)}.entity.ts`),
          properties,
        };
      }

      for (const tableName of tableNames) {
        const entity = allEntities[tableName];
        for (const otherTableName of tableNames) {
          if (otherTableName === tableName) continue;
          const otherEntity = allEntities[otherTableName];
          for (const prop of otherEntity.properties) {
            if (prop.isRelation && prop.relationType === "ManyToOne" && prop.relatedEntity === entity.name) {
              const inverseProp: EntityProperty = {
                name: camelCase(otherTableName) + "s",
                type: `${otherEntity.name}[]`,
                isPrimary: false,
                isOptional: true,
                isRelation: true,
                relationType: "OneToMany",
                relatedEntity: otherEntity.name,
                relationFieldName: camelCase(otherTableName),
                inverseSide: entity.name,
                joinColumnName: prop.joinColumnName,
                dtoType: "number[]",
              };
              entity.properties.push(inverseProp);
            }
          }
        }
      }

      return Object.values(allEntities);
    } finally {
      await client.end();
    }
  }
}
