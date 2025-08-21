import fs from "fs-extra";
import path from "path";
import Handlebars from "../handlebars/handlebars-helpers.js";
import { kebabCase } from "../utils/string-formatters.js";
import { EntityProperty, ParsedEntity } from "./entity-scanner.js";


interface EnrichedEntity extends ParsedEntity {
  relations: string[];
  hasRelations: boolean;
  dateProperties?: EntityProperty[];
  optionalProperties?: EntityProperty[];
}


function compileTemplate(templateName: string, data: any): string {
  const templatePath = path.resolve("src/templates/crud", `${templateName}.hbs`);
  const templateSource = fs.readFileSync(templatePath, "utf8");
  const template = Handlebars.compile(templateSource);
  return template(data);
}

export async function generateCrudResources(
  entity: EnrichedEntity,
  outputBase: string,
  filesToGenerate: string[] = ["controller", "service", "module", "create-dto", "update-dto", "entity"]) {

  const entityName = entity.name;
  const entityFile = kebabCase(entityName);
  const entityVar = entityName.charAt(0).toLowerCase() + entityName.slice(1);
  const route = entityFile;

  const outputDir = path.join(outputBase);
  const dtoDir = path.join(outputDir, "dto");
  const entitiesDir = path.join(outputDir, "entities");

  await fs.ensureDir(dtoDir);
  await fs.ensureDir(entitiesDir);



  const typeormImports = new Set<string>(["Entity", "PrimaryGeneratedColumn"]);


  for (const prop of entity.properties) {
    if (prop.type === "Date") {
      typeormImports.add("CreateDateColumn");
      typeormImports.add("UpdateDateColumn");
      typeormImports.add("DeleteDateColumn");
    }

    if (prop.isRelation) {
      if (prop.relationType === "ManyToOne") {
        typeormImports.add("ManyToOne");
        typeormImports.add("JoinColumn");
      }
      if (prop.relationType === "OneToMany") {
        typeormImports.add("OneToMany");
      }
    }

    // Par défaut, tous les champs non-relation ont un @Column
    if (!prop.isRelation && !prop.isPrimary) {
      typeormImports.add("Column");
    }
  }




  const context = {
    entityName,
    entityFile,
    entityVar,
    route,
     typeormImports: Array.from(typeormImports),
    properties: entity.properties,
    relations: entity.relations,
    hasRelations: entity.hasRelations,
    dateProperties: entity.dateProperties,
    optionalProperties: entity.optionalProperties,
  };
  const allFiles = [
    { name: `${entityFile}.controller.ts`, template: "controller" },
    { name: `${entityFile}.service.ts`, template: "service" },
    { name: `${entityFile}.module.ts`, template: "module" },
    { name: `dto/create-${entityFile}.dto.ts`, template: "create-dto" },
    { name: `dto/update-${entityFile}.dto.ts`, template: "update-dto" },
    { name: `entities/${entityFile}.entity.ts`, template: "entity" },
  ]

  const files = allFiles.filter(f => filesToGenerate.includes(f.template))

  for (const file of files) {
    const content = compileTemplate(file.template, context)
    const targetPath = path.join(outputDir, file.name);
    await fs.writeFile(targetPath, content, "utf-8");
    console.log(`✅ Créé : ${targetPath}`);
  }
}