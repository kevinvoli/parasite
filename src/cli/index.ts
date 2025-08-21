#!/usr/bin/env node

import { Command } from "commander";
import chalk from "chalk";
import { scanEntities } from "../core/entity-scanner.js";
import { generateMissingCrudElements } from "../core/intelligent-generator.js";
import { addModuleToAppModule } from "../utils/app-module-updater.js";
import path from "path";
import fs from "fs-extra";
import { generateFromDatabase } from "../core/generate-from-db.js";
import { loadConfig } from "../utils/config-loader.js";


const program = new Command();

program
  .name("parasite")
  .description("Mini framework NestJS pour générer des CRUDs à partir des entités TypeORM")
  .version("0.1.0");

program
  .command("init")
  .description("Crée un fichier de configuration parasite.conf.json")
  .action(async () => {
    const configFilePath = path.resolve(process.cwd(), "parasite.conf.json");
    const defaultConfig = {
      projectRoot: "./src",
      db: {
        type: "postgres",
        host: "localhost",
        port: 5432,
        username: "root",
        password: "root",
        database: "mydb",
      },
      templatesDir: "./src/templates",
      namingConvention: "camelCase",
      overwriteExisting: false,
    };

    if (fs.existsSync(configFilePath)) {
      console.log(chalk.yellow("⚠️ Le fichier parasite.conf.json existe déjà."));
      return;
    }

    try {
      await fs.writeJson(configFilePath, defaultConfig, { spaces: 2 });
      console.log(chalk.green("✅ Fichier de configuration `parasite.conf.json` créé avec succès !"));
    } catch (error) {
      console.error(chalk.red("❌ Erreur lors de la création du fichier de configuration :"), error);
    }
  });

program
  .command("generate")
  .description("Génère les modules, services, contrôleurs et DTOs depuis les entités")
  .option("-p, --project <path>", "Chemin vers le projet NestJS")
  .option("-e, --entities <path>", "Chemin vers le dossier contenant les entités (optionnel)")
  .action(async (options) => {
    console.log(chalk.green(">> Lancement du générateur de CRUD..."));
    const config = await loadConfig();

    const projectRoot = options.project || config.projectRoot;
    if (!projectRoot) {
      console.error(chalk.red("❌ Le chemin vers le projet NestJS doit être fourni via l'option --project ou dans parasite.conf.json"));
      return;
    }

    const entitiesPath = options.entities || config.entitiesPath || path.join(projectRoot, "src", "entities");

    if (!fs.existsSync(entitiesPath)) {
        console.error(chalk.red(`❌ Le dossier d'entités n'a pas été trouvé à l'emplacement : ${entitiesPath}`));
        console.log(chalk.blue("Veuillez spécifier le bon chemin avec l'option --entities ou dans le fichier de configuration."));
        return;
    }

    const entities = await scanEntities(entitiesPath);

    if (entities.length === 0) {
        console.log(chalk.yellow("Aucune entité trouvée. Assurez-vous que vos entités TypeORM sont bien présentes et décorées avec @Entity()."));
        return;
    }

    console.log(chalk.cyan(`Entitiés Détectées : ${entities.length}`));
    for (const entity of entities) {
      console.log(chalk.green(`\n>> Génération des fichiers CRUD pour ${entity.name}`));
      await generateMissingCrudElements(entity, projectRoot);

      for (const prop of entity.properties) {
        console.log(
          ` - ${prop.name}: ${prop.type} ${prop.isPrimary ? " [PRIMARY]" : ""} ${prop.isRelation ? `[${prop.relationType} →  ${prop.relatedEntity}]` : ""}`
        );
      }

      await addModuleToAppModule(
        path.join(projectRoot, "src", "app.module.ts"),
        `${entity.name}Module`,
        `./${entity.name.toLowerCase()}/${entity.name.toLowerCase()}.module`
      );
    }
     console.log(chalk.green("\n✅ Génération des CRUDs terminée !"));
  });

program
  .command("db")
  .description("Génère un projet (ou le complète) à partir d'une base de données")
  .option("-d, --db-url <url>", "URL de la base de données (ex: postgres://user:pass@host:5432/db)")
  .option("-o, --output <dir>", "Répertoire de sortie", "./parasite-app")
  .action(async (options) => {
    const config = await loadConfig();

    let dbUrl = options.dbUrl;
    if (!dbUrl && config.db) {
      const { type, username, password, host, port, database } = config.db;
      if (type && username && password && host && port && database) {
        dbUrl = `${type}://${username}:${password}@${host}:${port}/${database}`;
        console.log(chalk.blue("Utilisation de la configuration de la base de données depuis `parasite.conf.json`"));
      }
    }

    if (!dbUrl) {
      console.error(chalk.red("❌ L'URL de la base de données doit être fournie via --db-url ou dans parasite.conf.json"));
      return;
    }

    console.log(chalk.green(">> Connexion à la base de données..."));
    await generateFromDatabase(dbUrl, options.output);
  });



program.parse();