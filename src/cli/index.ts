#!/usr/bin/env node

import { Command } from "commander";
import chalk from "chalk";
import inquirer from "inquirer";
import { scanEntities } from "../core/entity-scanner.js";
import { generateMissingCrudElements } from "../core/intelligent-generator.js";
import { addModuleToAppModule } from "../utils/app-module-updater.js";
import path from "path";
import fs from "fs-extra";
import { generateFromDatabase } from "../core/generate-from-db.js";
import { loadConfig } from "../utils/config-loader.js";
import { logger } from "../utils/logger.js";

async function promptForDbUrl(): Promise<string> {
  const { dbType } = await inquirer.prompt<{ dbType: string }>([
    {
      type: "list",
      name: "dbType",
      message: "Type de base de données :",
      choices: ["mysql", "postgres", "sqlite"],
    },
  ]);

  if (dbType === "sqlite") {
    const { filePath } = await inquirer.prompt<{ filePath: string }>([
      {
        type: "input",
        name: "filePath",
        message: "Chemin vers le fichier SQLite :",
        validate: (v: string) => v.trim().length > 0 || "Le chemin est requis",
      },
    ]);
    return `sqlite://${filePath}`;
  }

  const answers = await inquirer.prompt<{
    host: string; port: number; username: string; password: string; database: string;
  }>([
    { type: "input",    name: "host",     message: "Hôte :",                   default: "localhost" },
    { type: "number",   name: "port",     message: "Port :",                   default: dbType === "mysql" ? 3306 : 5432 },
    { type: "input",    name: "username", message: "Utilisateur :",            default: "root" },
    { type: "password", name: "password", message: "Mot de passe :",          mask: "*" },
    { type: "input",    name: "database", message: "Nom de la base de données :", validate: (v: string) => v.trim().length > 0 || "Le nom est requis" },
  ]);

  return `${dbType}://${answers.username}:${encodeURIComponent(answers.password)}@${answers.host}:${answers.port}/${answers.database}`;
}


const program = new Command();

program
  .name("parasite")
  .description("Mini framework NestJS pour générer des CRUDs à partir des entités TypeORM")
  .version("0.1.0")
  .option("--verbose", "Mode verbeux (affiche les détails)")
  .option("--quiet", "Mode silencieux (affiche seulement les erreurs)")
  .hook("preAction", (thisCommand) => {
    const opts = thisCommand.opts();
    if (opts.quiet) logger.setLevel("error");
    else if (opts.verbose) logger.setLevel("debug");
  });

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
  .command("clean")
  .description("Supprime les fichiers générés (dist, parasite.conf.json)")
  .action(async () => {
    const distPath = path.resolve(process.cwd(), "dist");
    const configFilePath = path.resolve(process.cwd(), "parasite.conf.json");

    console.log(chalk.blue("Nettoyage des fichiers générés..."));

    try {
      await fs.remove(distPath);
      console.log(chalk.green("✅ Dossier `dist` supprimé."));
    } catch (error) {
      console.error(chalk.red("❌ Erreur lors de la suppression du dossier `dist` :"), error);
    }

    try {
      if (fs.existsSync(configFilePath)) {
        await fs.remove(configFilePath);
        console.log(chalk.green("✅ Fichier `parasite.conf.json` supprimé."));
      }
    } catch (error) {
      console.error(chalk.red("❌ Erreur lors de la suppression de `parasite.conf.json` :"), error);
    }

    console.log(chalk.green("\nNettoyage terminé !"));
  });

program
  .command("generate")
  .description("Génère les modules, services, contrôleurs et DTOs depuis les entités")
  .option("-p, --project <path>", "Chemin vers le projet NestJS")
  .option("-e, --entities <path>", "Chemin vers le dossier contenant les entités (optionnel)")
  .option("--dry-run", "Aperçu des fichiers sans écriture", false)
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

    console.log(chalk.cyan(`Entités Détectées : ${entities.length}`));
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
  .option("--dry-run", "Aperçu des fichiers sans écriture", false)
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
      console.log(chalk.blue("ℹ️  Aucune URL fournie. Lancement du mode interactif..."));
      dbUrl = await promptForDbUrl();
    }

    console.log(chalk.green(">> Connexion à la base de données..."));
    await generateFromDatabase(dbUrl, options.output, {
      overwriteExisting: config.overwriteExisting,
      templatesDir: config.templatesDir,
      dryRun: options.dryRun,
      swagger: config.swagger,
    });
  });



program
  .command("diff")
  .description("Compare le schéma de la base de données avec les entités du projet")
  .option("-d, --db-url <url>", "URL de la base de données")
  .option("-p, --project <path>", "Chemin vers le projet NestJS")
  .option("-e, --entities <path>", "Chemin vers le dossier des entités")
  .action(async (options) => {
    const config = await loadConfig();

    let dbUrl = options.dbUrl;
    if (!dbUrl && config.db) {
      const { type, username, password, host, port, database } = config.db;
      if (type && username && password && host && port && database) {
        dbUrl = `${type}://${username}:${password}@${host}:${port}/${database}`;
      }
    }
    if (!dbUrl) {
      console.log(chalk.blue("ℹ️  Aucune URL fournie. Lancement du mode interactif..."));
      dbUrl = await promptForDbUrl();
    }

    const projectRoot = options.project || config.projectRoot;
    const entitiesPath = options.entities || config.entitiesPath ||
      (projectRoot ? path.join(projectRoot, "src", "entities") : null);

    console.log(chalk.cyan("\n🔍 Comparaison schéma DB ↔ entités projet...\n"));

    const { getDbScanner } = await import("../core/generate-from-db.js");
    const scanner = getDbScanner(dbUrl);
    const dbEntities = await scanner.introspect(dbUrl, projectRoot ?? "./parasite-app");

    const dbMap = new Map(dbEntities.map(e => [e.name.toLowerCase(), e]));

    let projectMap = new Map<string, any>();
    if (entitiesPath && fs.existsSync(entitiesPath)) {
      const { scanEntities: scan } = await import("../core/entity-scanner.js");
      const projectEntities = await scan(entitiesPath);
      projectMap = new Map(projectEntities.map(e => [e.name.toLowerCase(), e]));
    } else {
      console.log(chalk.yellow("⚠️  Aucun dossier d'entités trouvé. Seul le schéma DB sera affiché.\n"));
    }

    let hasChanges = false;

    for (const [key, dbEnt] of dbMap) {
      const projEnt = projectMap.get(key);
      if (!projEnt) {
        hasChanges = true;
        console.log(chalk.green(`📝 Nouvelle entité DB : ${dbEnt.name}`));
        for (const p of dbEnt.properties) {
          const label = p.isPrimary ? "[PK]" : p.isRelation ? `[${p.relationType} → ${p.relatedEntity}]` : "";
          console.log(chalk.green(`   + ${p.name}: ${p.type} ${label}`));
        }
      } else {
        const projPropMap = new Map<string, any>(projEnt.properties.map((p: any) => [p.name as string, p]));
        const dbPropMap = new Map(dbEnt.properties.map(p => [p.name, p]));
        const diffs: string[] = [];

        for (const [pName, dbProp] of dbPropMap) {
          const projProp = projPropMap.get(pName) as any;
          if (!projProp) {
            diffs.push(chalk.green(`   + ${pName}: ${dbProp.type} [nouvelle colonne DB]`));
          } else if (projProp.type !== dbProp.type) {
            diffs.push(chalk.yellow(`   ~ ${pName}: ${projProp.type} → ${dbProp.type} [type modifié]`));
          }
        }
        for (const [pName] of projPropMap) {
          if (!dbPropMap.has(pName)) {
            diffs.push(chalk.red(`   - ${pName} [absent de la DB]`));
          }
        }
        if (diffs.length > 0) {
          hasChanges = true;
          console.log(chalk.yellow(`⚠️  Modifiée : ${dbEnt.name}`));
          diffs.forEach(d => console.log(d));
        } else {
          console.log(chalk.green(`✅ Identique : ${dbEnt.name}`));
        }
      }
    }

    for (const [key, projEnt] of projectMap) {
      if (!dbMap.has(key)) {
        hasChanges = true;
        console.log(chalk.red(`🗑  Absente de la DB : ${projEnt.name}`));
      }
    }

    if (!hasChanges) {
      console.log(chalk.green("\n✅ Le schéma DB est synchronisé avec les entités du projet !"));
    } else {
      console.log(chalk.yellow("\n⚠️  Des différences ont été détectées."));
    }
  });

program
  .command("add <entityName>")
  .description("Génère un CRUD pour une nouvelle entité via un assistant interactif")
  .option("-p, --project <path>", "Chemin vers le projet NestJS")
  .option("--dry-run", "Aperçu des fichiers sans écriture", false)
  .action(async (entityName: string, options) => {
    const config = await loadConfig();
    const projectRoot = options.project || config.projectRoot;
    if (!projectRoot) {
      console.error(chalk.red("❌ Le chemin vers le projet NestJS doit être fourni via --project ou dans parasite.conf.json"));
      return;
    }

    console.log(chalk.cyan(`\n>> Création de l'entité ${entityName}`));
    console.log(chalk.blue("Ajoutez des propriétés (laissez le nom vide pour terminer).\n"));

    const properties: any[] = [];
    // Always add an auto-increment PK
    properties.push({ name: "id", type: "number", dtoType: "number", isPrimary: true, isOptional: false, isRelation: false });

    while (true) {
      const { propName } = await inquirer.prompt<{ propName: string }>([
        { type: "input", name: "propName", message: "Nom de la propriété (vide pour terminer) :" },
      ]);

      if (!propName.trim()) break;

      const { propType, isOptional } = await inquirer.prompt<{ propType: string; isOptional: boolean }>([
        {
          type: "list",
          name: "propType",
          message: `Type de "${propName}" :`,
          choices: ["string", "number", "boolean", "Date"],
        },
        {
          type: "confirm",
          name: "isOptional",
          message: `"${propName}" est-il optionnel ?`,
          default: false,
        },
      ]);

      properties.push({
        name: propName,
        type: propType,
        dtoType: propType === "Date" ? "string" : propType,
        isPrimary: false,
        isOptional,
        isRelation: false,
      });
    }

    const { generateCrudResources } = await import("../core/crud-generator.js");
    const { kebabCase: kc } = await import("../utils/string-formatters.js");
    const entityKebab = kc(entityName);
    const outputBase = path.join(projectRoot, "src", entityKebab);

    const entity = {
      name: entityName,
      originalTableName: entityKebab,
      filePath: path.join(projectRoot, "src", entityKebab, "entities", `${entityKebab}.entity.ts`),
      properties,
      relations: [],
      hasRelations: false,
      swagger: config.swagger,
      overwriteExisting: config.overwriteExisting,
    };

    console.log(chalk.green(`\n>> Génération des fichiers CRUD pour ${entityName}...`));
    await generateCrudResources(entity, outputBase, undefined, config.templatesDir, options.dryRun);

    if (!options.dryRun) {
      await addModuleToAppModule(
        path.join(projectRoot, "src", "app.module.ts"),
        `${entityName}Module`,
        `./${entityKebab}/${entityKebab}.module`
      );
    }
    console.log(chalk.green("\n✅ Entité créée avec succès !"));
  });

program.parse();