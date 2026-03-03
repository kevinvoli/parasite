import sqlite3 from "sqlite3";
import path from "path";
import { ParsedEntity, EntityProperty } from "../types.js";
import { camelCase, kebabCase, toPascalCase, toSingular } from "../utils/string-formatters.js";
import { DatabaseScanner } from "./db-scanner.js";

export function mapSQLiteTypeToTS(sqliteType: string): string {
  const type = sqliteType.toLowerCase().trim();
  if (type.includes("int")) return "number";
  if (type.includes("real") || type.includes("float") || type.includes("double") ||
      type.includes("numeric") || type.includes("decimal")) return "number";
  if (type.includes("text") || type.includes("char") || type.includes("clob")) return "string";
  if (type.includes("bool")) return "boolean";
  if (type.includes("date") || type.includes("time")) return "Date";
  return "any"; // BLOB and unrecognized types
}

function openDatabase(filePath: string): Promise<sqlite3.Database> {
  return new Promise((resolve, reject) => {
    const db = new sqlite3.Database(filePath, sqlite3.OPEN_READONLY, (err) => {
      if (err) reject(err);
      else resolve(db);
    });
  });
}

function queryAll<T>(db: sqlite3.Database, sql: string): Promise<T[]> {
  return new Promise((resolve, reject) => {
    db.all(sql, [], (err: Error | null, rows: unknown) => {
      if (err) reject(err);
      else resolve(rows as T[]);
    });
  });
}

function closeDatabase(db: sqlite3.Database): Promise<void> {
  return new Promise((resolve, reject) => {
    db.close((err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

export class SQLiteScanner implements DatabaseScanner {
  async introspect(dbUrl: string, outputDir: string = "parasite-app"): Promise<ParsedEntity[]> {
    const filePath = dbUrl.replace(/^sqlite:\/\//, "");
    const db = await openDatabase(filePath);
    const srcDir = path.join(path.resolve(outputDir), "src");

    try {
      const tables = await queryAll<{ name: string }>(db,
        `SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name`
      );
      const tableNames = tables.map(t => t.name);

      if (tableNames.length === 0) {
        throw new Error("❌ Aucune table trouvée dans la base de données.");
      }

      const allEntities: Record<string, ParsedEntity> = {};

      // First pass: columns, FK constraints, and UNIQUE indexes per table
      for (const tableName of tableNames) {
        const columns = await queryAll<{
          cid: number; name: string; type: string; notnull: number; dflt_value: any; pk: number;
        }>(db, `PRAGMA table_info(${JSON.stringify(tableName)})`);

        const foreignKeys = await queryAll<{
          id: number; seq: number; table: string; from: string; to: string;
        }>(db, `PRAGMA foreign_key_list(${JSON.stringify(tableName)})`);

        // Detect single-column UNIQUE indexes for OneToOne detection
        const indexes = await queryAll<{
          seq: number; name: string; unique: number; origin: string; partial: number;
        }>(db, `PRAGMA index_list(${JSON.stringify(tableName)})`);

        const uniqueColumnNames = new Set<string>();
        for (const idx of indexes) {
          if (idx.unique !== 1) continue;
          const indexCols = await queryAll<{ seqno: number; cid: number; name: string }>(
            db, `PRAGMA index_info(${JSON.stringify(idx.name)})`
          );
          if (indexCols.length === 1) {
            uniqueColumnNames.add(indexCols[0].name);
          }
        }

        const className = toPascalCase(tableName);
        const properties: EntityProperty[] = [];
        const pkColumns = new Set(columns.filter(c => c.pk > 0).map(c => c.name));

        for (const col of columns) {
          const isPrimary = pkColumns.has(col.name);
          const isOptional = col.notnull === 0 && !isPrimary;
          const type = mapSQLiteTypeToTS(col.type);

          const fk = foreignKeys.find(fk => fk.from === col.name);
          if (fk) {
            const relatedEntity = toPascalCase(fk.table);
            const relationName = toSingular(camelCase(fk.table));
            const isUniqueFk = uniqueColumnNames.has(col.name);
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
              joinColumnName: col.name,
            });
          } else {
            const isUuid = col.type.toLowerCase().includes("uuid");

            properties.push({
              name: camelCase(col.name),
              type,
              dtoType: type === "Date" ? "string" : type,
              isPrimary,
              isOptional,
              isRelation: false,
              isJoinColumn: false,
              joinColumnName: col.name,
              isUuid,
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

      // Second pass: detect ManyToMany join tables
      const joinTablesToExclude: string[] = [];
      for (const tableName of tableNames) {
        const entity = allEntities[tableName];
        if (!entity) continue;

        const pkProperties = entity.properties.filter(p => p.isPrimary);
        const fkProperties = entity.properties.filter(
          p => p.isRelation && (p.relationType === "ManyToOne" || p.relationType === "OneToOne")
        );

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

      // Third pass: add inverse relations (OneToMany, inverse OneToOne, inverse ManyToMany)
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
            if (!prop.isRelation || prop.relatedEntity !== entity.name) continue;

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
              inversePropName = toSingular(camelCase(otherTableName));
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

            entity.properties.push({
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
            });
          }
        }
      }

      return Object.values(allEntities).filter(ent => !joinTablesToExclude.includes(ent.originalTableName));
    } finally {
      await closeDatabase(db);
    }
  }
}
