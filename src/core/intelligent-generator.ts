import path from "path";
import fs from "fs-extra";
import { ParsedEntity } from "./entity-scanner.js";
import { generateCrudResources } from "./crud-generator.js";
import { kebabCase } from "../utils/string-formatters.js";

function fileExists(filePath: string): boolean {
  return fs.existsSync(filePath);
}

export async function generateMissingCrudElements(entity: ParsedEntity, projectRoot: string) {
  const entityFilePath = entity.filePath;
  const entityDir = path.dirname(entityFilePath);
  const baseDir = path.resolve(entityDir, "..");

  const entityName = entity.name;
  const entityFile = kebabCase(entityName);

  const expectedPaths = {
    controller: path.join(baseDir, `${entityFile}.controller.ts`),
    service: path.join(baseDir, `${entityFile}.service.ts`),
    module: path.join(baseDir, `${entityFile}.module.ts`),
    dtoCreate: path.join(baseDir, "dto", `create-${entityFile}.dto.ts`),
    dtoUpdate: path.join(baseDir, "dto", `update-${entityFile}.dto.ts`),
     entitys: path.join(baseDir, "entities", `${entityFile}.entity.ts`)
  };

  const filesToGenerate: string[] = [];
  if (!fileExists(expectedPaths.controller)) filesToGenerate.push("controller");
  if (!fileExists(expectedPaths.service)) filesToGenerate.push("service");
  if (!fileExists(expectedPaths.module)) filesToGenerate.push("module");
  if (!fileExists(expectedPaths.dtoCreate)) filesToGenerate.push("create-dto");
  if (!fileExists(expectedPaths.dtoUpdate)) filesToGenerate.push("update-dto");
  if (!fileExists(expectedPaths.entitys)) filesToGenerate.push("entity");

  if (filesToGenerate.length === 0) {
    console.log(`✅ Tous les fichiers CRUD pour ${entityName} existent déjà.`);
    return;
  }
  console.log(`⚠️  Fichiers manquants pour ${entityName} :`, filesToGenerate.join(", "));
  const relations = entity.properties
    .filter((p) => p.isRelation)
    .map((p) => p.name);

  const hasRelations = relations.length > 0;

  // facultatif : tu peux aussi extraire les noms des propriétés optionnelles ou typées date
  const dateProperties = entity.properties.filter((p) => p.type === "Date");
  const optionalProperties = entity.properties.filter((p) => p.isOptional);

  await generateCrudResources(
  {
    ...entity,
    relations,
    hasRelations,
    dateProperties,
    optionalProperties,
  },
  baseDir,
  filesToGenerate
);

}

