#!/usr/bin/env node

import { Command } from "commander";
import chalk from "chalk";
import { scanEntities } from "../scanner/entity-scanner.js";
import { generateCrudResources } from "../generators/crud-generator.js";
import { generateMissingCrudElements } from "../generators/intelligent-generator.js";
import { addModuleToAppModule } from "../utils/app-module-updater.js";
import path from "path";


const program = new Command();

program
  .name("parasite")
  .description("Mini framework NestJS pour générer des CRUDs à partir des entités TypeORM")
  .version("0.1.0");

program
  .command("generate")
  .description("Génère les modules, services, contrôleurs et DTOs depuis les entités")
  .option("-p, --project <path>", "Chemin vers le projet NestJS")
  .option("-e, --entities <path>", "Chemin vers le dossier contenant les entités")
  .action(async (options) => {
    console.log(chalk.green(">> Génération des CRUDs en cours..."));
    console.log("Options : ", options);
    // Appeler du générateur

    const entities = await scanEntities(options.entities);

    console.log(chalk.cyan(`Entitiés Détectées : ${entities.length}`));
    for (const entity of entities) {
      console.log(chalk.green(`\n>> Génération des fichiers CRUD pour ${entity.name}`));
      await generateMissingCrudElements(entity, options.project);

      for (const prop of entity.properties) {
        console.log(
          ` - ${prop.name}: ${prop.type} ${prop.isPrimary ? " [PRIMARY]" : ""} ${prop.isRelation ? `[${prop.relationType} →  ${prop.relatedEntity}]` : ""
          }`
        );
      }

      await addModuleToAppModule(
        path.join(options.project, "src", "app.module.ts"),
        `${entity.name}Module`,
        `./${entity.name.toLowerCase()}/${entity.name.toLowerCase()}.module`
      );

    }
  });

program 
  .command("db")
  .description("Génére un projet (")


program.parse();