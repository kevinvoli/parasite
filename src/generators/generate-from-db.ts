import { execSync } from "child_process";
import fs from "fs-extra";
import path from "path";
import mysql from "mysql2/promise";
import chalk from "chalk";

import { generateCrudResources } from "./crud-generator.js";
import { ParsedEntity, EntityProperty } from "../scanner/entity-scanner.js";

function camelCase(str: string): string {
  return str.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
}

function kebabCase(str: string): string {
  return str.replace(/[A-Z]/g, (match, offset) => (offset ? "-" : "") + match.toLowerCase());
}

function toPascalCase(str: string): string {
  return str
    .replace(/_./g, (s) => s.charAt(1).toUpperCase())
    .replace(/^./, (s) => s.toUpperCase());
}

function mapMySQLTypeToTS(mysqlType: string): string {
  const type = mysqlType.toLowerCase();
  if (type.includes("int") || type.includes("decimal") || type.includes("float") || type.includes("double")) return "number";
  if (type.includes("char") || type.includes("text") || type.includes("enum")) return "string";
  if (type.includes("date") || type.includes("time")) return "Date";
  if (type.includes("bool") || type === "tinyint(1)") return "boolean";
  return "any";
}

function isNestInstalled(): boolean {
  try {
    execSync("nest --version", { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

export async function generateFromDatabase(dbUrl: string, outputDir: string = "parasite-app") {
  console.log(chalk.green(">> Connexion à la base de donnée..."));
  const projectPath = path.resolve(outputDir);
  const srcDir = path.join(projectPath, "src");

  if (!fs.existsSync(projectPath)) {
    if (!isNestInstalled()) {
      console.error(chalk.red("❌ Le CLI NestJS n'est pas installé. Veuillez exécuter : npm i -g @nestjs/cli"));
      process.exit(1);
    }
    console.log(chalk.blue(`📦 Création du projet NestJS dans ${outputDir}...`));
    execSync(`nest new ${outputDir} --skip-install`, { stdio: "inherit" });
  } else {
    console.log(chalk.yellow(`⚠️ Le dossier ${outputDir} existe déjà.`));
  }

  const connection = await mysql.createConnection(dbUrl);
  const [tables] = await connection.query<any>("SHOW TABLES");
  if (!tables || tables.length === 0) throw new Error("❌ Aucune table trouvée dans la base de données.");

  const tableKey = Object.keys(tables[0])[0];
  const tableNames: string[] = tables.map((row: any) => row[tableKey]);
  const inverseRelations = new Map<string, EntityProperty[]>();

   const allEntities: Record<string, ParsedEntity> = {};

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
        // Relation ManyToOne
        const relatedEntity = toPascalCase(fk.REFERENCED_TABLE_NAME);
        const relationName = camelCase(fk.REFERENCED_TABLE_NAME);
        
        properties.push({
          name: camelCase(col.Field),
          type,
          dtoType: type === "Date" ? "string" : type,
          isPrimary,
          isOptional,
          isRelation: true,
          relatedEntity,
          relationType: "ManyToOne",
          relationFieldName: relationName,
          inverseSide: camelCase(tableName),
          joinColumnName: col.Field,
        });
      } else {
        // Champ normal
        properties.push({
          name: camelCase(col.Field),
          type,
          dtoType: type === "Date" ? "string" : type,
          isPrimary,
          isOptional,
          isRelation: false,
           isJoinColumn: true,
           joinColumnName: col.Field,
        });
      }
    }

    allEntities[tableName] = {
      name: className,
      filePath: path.join(srcDir, tableName, `${kebabCase(className)}.entity.ts`),
      properties,
    };
  }

  // Deuxième passe: ajouter les relations inverses OneToMany
  for (const tableName of tableNames) {
    const entity = allEntities[tableName];
    
    // Trouver toutes les relations ManyToOne qui pointent vers cette table
    for (const otherTableName of tableNames) {
      if (otherTableName === tableName) continue;
      
      const otherEntity = allEntities[otherTableName];
      for (const prop of otherEntity.properties) {
        if (prop.isRelation && 
            prop.relationType === "ManyToOne" && 
            prop.relatedEntity === entity.name) {
          
          // Créer la relation inverse OneToMany
          const inverseProp: EntityProperty = {
            name: camelCase(otherTableName) , // Pluralisation
            type: `${otherEntity.name}[]`,
            isPrimary: false,
            isOptional: true,
            isRelation: true,
            relationType: "OneToMany",
            relatedEntity: otherEntity.name,
            relationFieldName: camelCase(otherTableName) ,
            inverseSide: entity.name,
            joinColumnName: prop.joinColumnName,
            dtoType: "number",
          };

          entity.properties.push(inverseProp);
        }
      }
    }
  }

  // Génération finale des fichiers
  for (const tableName of tableNames) {
    const entity = allEntities[tableName];
    const baseDir = path.join(srcDir, tableName);
    
    await generateCrudResources(
      {
        ...entity,
        relations: entity.properties.filter(p => p.isRelation).map(p => p.name),
        hasRelations: entity.properties.some(p => p.isRelation),
        optionalProperties: entity.properties.filter(p => p.isOptional),
        dateProperties: entity.properties.filter(p => p.type === "Date"),
      },
      baseDir
    );
  }

  await connection.end();
  console.log(chalk.green("\n✅ Génération terminée avec succès !"));
}