import { execSync } from "child_process";
import fs from "fs-extra";
import path from "path";
import chalk from "chalk";
import { generateCrudResources } from "./crud-generator.js";
import { DatabaseScanner } from "./db-scanner.js";
import { MySqlScanner } from "./mysql-scanner.js";
import { PostgresScanner } from "./postgres-scanner.js";
import { kebabCase } from "../utils/string-formatters.js";

function isNestInstalled(): boolean {
  try {
    execSync("nest --version", { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

function getDbScanner(dbUrl: string): DatabaseScanner {
  if (dbUrl.startsWith("mysql://")) {
    return new MySqlScanner();
  }
  if (dbUrl.startsWith("postgres://") || dbUrl.startsWith("postgresql://")) {
    return new PostgresScanner();
  }
  throw new Error(`Unsupported database type for URL: ${dbUrl}. Only mysql:// and postgres:// are supported.`);
}

export async function generateFromDatabase(dbUrl: string, outputDir: string) {
  const projectPath = path.resolve(outputDir);
  const srcDir = path.join(projectPath, "src");

  // 1. Create NestJS project if it doesn't exist
  if (!fs.existsSync(projectPath)) {
    if (!isNestInstalled()) {
      console.error(chalk.red("❌ Le CLI NestJS n'est pas installé. Veuillez exécuter : npm i -g @nestjs/cli"));
      process.exit(1);
    }
    console.log(chalk.blue(`📦 Création du projet NestJS dans ${outputDir}...`));
    execSync(`nest new ${outputDir} --skip-install`, { stdio: "inherit" });
  } else {
    console.log(chalk.yellow(`⚠️ Le dossier ${outputDir} existe déjà. Utilisation du projet existant.`));
  }

  try {
    // 2. Introspect the database schema
    console.log(chalk.blue("🔎 Introspection de la base de données..."));
    const scanner = getDbScanner(dbUrl);
    const entities = await scanner.introspect(dbUrl, outputDir);

    if (entities.length === 0) {
        console.log(chalk.yellow("Aucune table n'a été trouvée dans la base de données."));
        return;
    }
    console.log(chalk.cyan(`🗂️  ${entities.length} tables trouvées. Début de la génération du CRUD...`));

    // 3. Generate CRUD files for each entity
    for (const entity of entities) {
      const baseDir = path.join(srcDir, kebabCase(entity.name));
      console.log(chalk.green(`\n>> Génération des fichiers CRUD pour ${entity.name}`));

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

    console.log(chalk.green("\n✅ Génération terminée avec succès !"));
  } catch (error: any) {
      console.error(chalk.red(`\n❌ Une erreur est survenue: ${error.message}`));
      process.exit(1);
  }
}