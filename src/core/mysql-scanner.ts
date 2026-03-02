import { createConnection } from "mysql2/promise";
import path from "path";
import { ParsedEntity, EntityProperty } from "../types.js";
import { camelCase, kebabCase, toPascalCase } from "../utils/string-formatters.js";
import { DatabaseScanner } from "./db-scanner.js";

export function mapMySQLTypeToTS(mysqlType: string): string {
  const type = mysqlType.toLowerCase();
  // The specific 'tinyint(1)' check must come before the general 'int' check.
  if (type.includes("bool") || type === "tinyint(1)") return "boolean";
  if (type.includes("int") || type.includes("decimal") || type.includes("float") || type.includes("double")) return "number";
  if (type.includes("char") || type.includes("text") || type.includes("enum")) return "string";
  if (type.includes("date") || type.includes("time")) return "Date";
  return "any";
}

export class MySqlScanner implements DatabaseScanner {
  async introspect(dbUrl: string, outputDir: string = "parasite-app"): Promise<ParsedEntity[]> {
    const connection = await createConnection(dbUrl);
    const [tables] = await connection.query<any>("SHOW TABLES");
    if (!tables || tables.length === 0) {
      await connection.end();
      throw new Error("❌ Aucune table trouvée dans la base de données.");
    }

    const tableKey = Object.keys(tables[0])[0];
    const tableNames: string[] = tables.map((row: any) => row[tableKey]);
    const allEntities: Record<string, ParsedEntity> = {};
    const srcDir = path.join(path.resolve(outputDir), "src");

    // First pass: Populate allEntities with direct properties and ManyToOne/OneToOne relations
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

      const [uniqueColumnsResult] = await connection.query<any>(
        `SELECT COLUMN_NAME
         FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS AS tc
         JOIN INFORMATION_SCHEMA.KEY_COLUMN_USAGE AS kcu 
           ON tc.CONSTRAINT_SCHEMA = kcu.CONSTRAINT_SCHEMA 
          AND tc.CONSTRAINT_NAME = kcu.CONSTRAINT_NAME
         WHERE tc.CONSTRAINT_SCHEMA = DATABASE()
           AND tc.TABLE_NAME = ?
           AND tc.CONSTRAINT_TYPE = 'UNIQUE'`, // Only 'UNIQUE' constraints, not 'PRIMARY KEY'
        [tableName]
      );
      const uniqueColumnNames: string[] = uniqueColumnsResult.map((row: any) => row.COLUMN_NAME);

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
          const isUniqueFk = uniqueColumnNames.includes(col.Field);
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
            relationType: relationType,
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
        originalTableName: tableName,
        filePath: path.join(srcDir, kebabCase(className), `${kebabCase(className)}.entity.ts`),
        properties,
      };
    } // End of first for loop (initial allEntities population)

    // Second pass: Identify and process ManyToMany relationships via join tables
    const joinTablesToExclude: string[] = [];
    for (const tableName of tableNames) {
      const entity = allEntities[tableName]; // This entity represents the potential join table
      if (!entity) continue;

      const pkProperties = entity.properties.filter(p => p.isPrimary);
      const fkProperties = entity.properties.filter(p => p.isRelation && (p.relationType === "ManyToOne" || p.relationType === "OneToOne"));
      
      // Heuristic for a ManyToMany join table:
      // 1. Has exactly two foreign key properties (ManyToOne/OneToOne)
      // 2. Both these FK properties are also primary keys.
      // 3. The table has ONLY these two columns (no other non-PK/non-FK columns).
      // 4. The foreign keys refer to DIFFERENT entities.
      if (
        fkProperties.length === 2 &&
        pkProperties.length === 2 &&
        pkProperties.every(pk => fkProperties.some(fk => fk.joinColumnName === pk.joinColumnName)) && // Compare joinColumnName
        entity.properties.length === 2 && // Only 2 columns total (the FKs which are also PKs)
        fkProperties[0].relatedEntity !== fkProperties[1].relatedEntity
      ) {
        joinTablesToExclude.push(entity.originalTableName); // Mark join table for exclusion

        // Find the actual entities based on their PascalCase names
        const entityA = Object.values(allEntities).find(e => e.name === fkProperties[0].relatedEntity);
        const entityB = Object.values(allEntities).find(e => e.name === fkProperties[1].relatedEntity);
        
        if (entityA && entityB) {
          // Add ManyToMany property to Entity A (e.g., User has many Roles) - owning side (@JoinTable)
          entityA.properties.push({
            name: camelCase(entityB.originalTableName),
            type: `${entityB.name}[]`, // Array of related entities
            isPrimary: false,
            isOptional: true,
            isRelation: true,
            isOwningRelation: true,
            relationType: "ManyToMany",
            relatedEntity: entityB.name,
            relationFieldName: camelCase(entityB.originalTableName),
            inverseSide: camelCase(entityA.originalTableName),
            joinColumnName: fkProperties[0].joinColumnName, // FK from join table to entityA
            inverseJoinColumnName: fkProperties[1].joinColumnName, // FK from join table to entityB
            joinTableName: tableName,
            dtoType: "number[]", // DTO represents array of IDs
          });

          // Add ManyToMany property to Entity B (e.g., Role has many Users) - inverse side
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
            joinColumnName: fkProperties[1].joinColumnName, // FK from join table to entityB
            inverseJoinColumnName: fkProperties[0].joinColumnName, // FK from join table to entityA
            joinTableName: tableName,
            dtoType: "number[]", // DTO represents array of IDs
          });
        }
      }
    }
    // End of join table identification loop

    // Third pass: Generate inverse relations (OneToMany/OneToOne/ManyToMany)
    // This loop processes `allEntities` *after* ManyToMany relations have been potentially added
    for (const tableName of tableNames) {
      const entity = allEntities[tableName];
      if (!entity) continue; // safety check

      // Skip processing entities that are join tables themselves in the inverse relation pass
      if (joinTablesToExclude.includes(entity.originalTableName)) continue;

      for (const otherTableName of tableNames) {
        if (otherTableName === tableName) continue;
        const otherEntity = allEntities[otherTableName];
        if (!otherEntity) continue; // safety check

        // If the other entity is a join table, skip processing its relations for inverse generation
        if (joinTablesToExclude.includes(otherEntity.originalTableName)) continue;

        for (const prop of otherEntity.properties) {
          if (prop.isRelation && prop.relatedEntity === entity.name) {

            // Prevent adding OneToMany if a ManyToMany already covers this linkage
            const alreadyHasManyToMany = entity.properties.some(
                p => p.isRelation && p.relationType === "ManyToMany" && p.relatedEntity === otherEntity.name
            );
            if (alreadyHasManyToMany) {
                continue;
            }
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

    await connection.end();
    const filteredEntities = Object.values(allEntities).filter(
      (ent) => !joinTablesToExclude.includes(ent.originalTableName)
    );
    return filteredEntities;
  }
}
