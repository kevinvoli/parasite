import mysql from "mysql2/promise";
import path from "path";
import { ParsedEntity, EntityProperty } from "../types.js";
import { camelCase, kebabCase, toPascalCase } from "../utils/string-formatters.js";
import { DatabaseScanner } from "./db-scanner.js";

function mapMySQLTypeToTS(mysqlType: string): string {
  const type = mysqlType.toLowerCase();
  if (type.includes("int") || type.includes("decimal") || type.includes("float") || type.includes("double")) return "number";
  if (type.includes("char") || type.includes("text") || type.includes("enum")) return "string";
  if (type.includes("date") || type.includes("time")) return "Date";
  if (type.includes("bool") || type === "tinyint(1)") return "boolean";
  return "any";
}

export class MySqlScanner implements DatabaseScanner {
  async introspect(dbUrl: string, outputDir: string = "parasite-app"): Promise<ParsedEntity[]> {
    const connection = await mysql.createConnection(dbUrl);
    const [tables] = await connection.query<any>("SHOW TABLES");
    if (!tables || tables.length === 0) {
      await connection.end();
      throw new Error("❌ Aucune table trouvée dans la base de données.");
    }

    const tableKey = Object.keys(tables[0])[0];
    const tableNames: string[] = tables.map((row: any) => row[tableKey]);
    const allEntities: Record<string, ParsedEntity> = {};
    const srcDir = path.join(path.resolve(outputDir), "src");

    for (const tableName of tableNames) {
      const [columns] = await connection.query<any>(`SHOW COLUMNS FROM \`${tableName}\``);
      const [foreignKeys] = await connection.query<any>(
        `SELECT COLUMN_NAME, REFERENCED_TABLE_NAME
         FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE
         WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME = ?
         AND REFERENCED_TABLE_NAME IS NOT NULL`,
        [tableName]
      );

      const className = toPascalCase(tableName);
      const properties: EntityProperty[] = [];

      for (const col of columns) {
        const type = mapMySQLTypeToTS(col.Type);
        const isPrimary = col.Key === "PRI";
        const isOptional = col.Null === "YES";

        const fk = foreignKeys.find((fk: any) => fk.COLUMN_NAME === col.Field);
        if (fk) {
          const relatedEntity = toPascalCase(fk.REFERENCED_TABLE_NAME);
          const relationName = camelCase(fk.REFERENCED_TABLE_NAME).replace(/s$/, "");

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
            joinColumnName: col.Field,
          });
        } else {
          properties.push({
            name: camelCase(col.Field),
            type,
            dtoType: type === "Date" ? "string" : type,
            isPrimary,
            isOptional,
            isRelation: false,
            isJoinColumn: false,
            joinColumnName: col.Field,
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

    await connection.end();
    return Object.values(allEntities);
  }
}
