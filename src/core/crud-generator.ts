import fs from "fs-extra";
import path, { dirname } from "path";
import { fileURLToPath } from "url";
import Handlebars from "../handlebars/handlebars-helpers.js";
import { kebabCase } from "../utils/string-formatters.js";
import { EntityProperty, ParsedEntity } from "../types.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

interface EnrichedEntity extends ParsedEntity {
  relations: string[];
  hasRelations: boolean;
  dateProperties?: EntityProperty[];
  optionalProperties?: EntityProperty[];
  overwriteExisting?: boolean;
  swagger?: boolean;
}

async function writeFileWithBackup(filePath: string, content: string, overwrite?: boolean): Promise<void> {
  if (overwrite && fs.existsSync(filePath)) {
    const backupPath = `${filePath}.bak`;
    await fs.copy(filePath, backupPath);
    console.log(`📦 Backup : ${backupPath}`);
  }
  await fs.writeFile(filePath, content, "utf-8");
  console.log(`✅ Créé : ${filePath}`);
}


const DEFAULT_TEMPLATES_DIR = path.join(__dirname, "../../src/templates/crud");

function resolveTemplatesDir(customDir?: string): string {
  if (customDir) {
    const resolved = path.resolve(customDir);
    if (fs.existsSync(resolved)) return resolved;
    console.warn(`⚠️  templatesDir "${customDir}" introuvable — utilisation des templates par défaut.`);
  }
  return DEFAULT_TEMPLATES_DIR;
}

function compileTemplate(templateName: string, data: any, templatesDir: string = DEFAULT_TEMPLATES_DIR): string {
  const templatePath = path.join(templatesDir, `${templateName}.hbs`);
  if (!fs.existsSync(templatePath)) {
    // Fall back to default templates if the custom template doesn't exist
    const fallback = path.join(DEFAULT_TEMPLATES_DIR, `${templateName}.hbs`);
    if (!fs.existsSync(fallback)) throw new Error(`Template introuvable: ${templatePath}`);
    console.warn(`⚠️  Template "${templateName}.hbs" absent du dossier custom — utilisation du template par défaut.`);
    const templateSource = fs.readFileSync(fallback, "utf8");
    return Handlebars.compile(templateSource)(data);
  }
  const templateSource = fs.readFileSync(templatePath, "utf8");
  return Handlebars.compile(templateSource)(data);
}

export async function generateCrudResources(
  entity: EnrichedEntity,
  outputBase: string,
  filesToGenerate: string[] = ["controller", "service", "module", "create-dto", "update-dto", "entity", "pagination-dto"],
  customTemplatesDir?: string,
  dryRun = false) {

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
      if (prop.relationType === "OneToOne") {
        typeormImports.add("OneToOne");
        if (prop.isOwningRelation) {
          typeormImports.add("JoinColumn");
        }
      }
      if (prop.relationType === "ManyToMany") {
        typeormImports.add("ManyToMany");
        if (prop.isOwningRelation) {
          typeormImports.add("JoinTable");
        }
      }
    }

    // Par défaut, tous les champs non-relation ont un @Column
    if (!prop.isRelation && !prop.isPrimary) {
      typeormImports.add("Column");
    }
  }




  // Unique related entities for TypeOrmModule.forFeature and imports in module.hbs
  const relatedEntitiesMap = new Map<string, { name: string; file: string }>();
  for (const prop of entity.properties) {
    if (prop.isRelation && prop.relatedEntity) {
      relatedEntitiesMap.set(prop.relatedEntity, {
        name: prop.relatedEntity,
        file: kebabCase(prop.relatedEntity),
      });
    }
  }
  const relatedEntities = Array.from(relatedEntitiesMap.values());

  // ENUM types to declare before the class
  const enumTypes: Array<{ enumName: string; values: Array<{ key: string; value: string }> }> = [];
  for (const prop of entity.properties) {
    if (prop.isEnum && prop.enumValues?.length) {
      const enumName = prop.name.charAt(0).toUpperCase() + prop.name.slice(1) + "Enum";
      enumTypes.push({
        enumName,
        values: prop.enumValues.map(v => ({ key: v.toUpperCase().replace(/[^A-Z0-9]/g, "_"), value: v })),
      });
    }
  }

  // Enrich properties with enumName for template lookups
  const propsWithEnumNames = entity.properties.map(prop => {
    if (prop.isEnum && prop.enumValues?.length) {
      const enumName = prop.name.charAt(0).toUpperCase() + prop.name.slice(1) + "Enum";
      return { ...prop, enumName };
    }
    return prop;
  });

  // class-validator decorators per property
  const TYPE_VALIDATORS: Record<string, string[]> = {
    string:  ["@IsString()"],
    number:  ["@IsNumber()"],
    boolean: ["@IsBoolean()"],
    Date:    ["@IsDateString()"],
    any:     [],
  };

  const validatorImportsSet = new Set<string>();
  const enrichedProperties = propsWithEnumNames.map(prop => {
    const validators: string[] = [];

    if (!prop.isPrimary && !prop.isJoinColumn) {
      if (prop.isOptional) {
        validators.push("@IsOptional()");
        validatorImportsSet.add("IsOptional");
      }
      if (prop.isRelation) {
        const isSingle = prop.relationType === "ManyToOne" ||
          (prop.relationType === "OneToOne" && prop.isOwningRelation);
        const isMulti = prop.relationType === "OneToMany" ||
          (prop.relationType === "ManyToMany" && prop.isOwningRelation);

        if (isSingle) {
          validators.push("@IsInt()");
          validatorImportsSet.add("IsInt");
        } else if (isMulti) {
          validators.push("@IsArray()");
          validators.push("@IsInt({ each: true })");
          validatorImportsSet.add("IsArray");
          validatorImportsSet.add("IsInt");
        }
      } else {
        const typeValidators = TYPE_VALIDATORS[prop.type] ?? [];
        for (const v of typeValidators) {
          validators.push(v);
          const match = v.match(/@(\w+)/);
          if (match) validatorImportsSet.add(match[1]);
        }
      }
    }

    return { ...prop, validators, hasValidators: validators.length > 0 };
  });

  const validatorImports = Array.from(validatorImportsSet);

  const context = {
    entityName,
    entityFile,
    entityVar,
    route,
    typeormImports: Array.from(typeormImports),
    properties: enrichedProperties,
    enumTypes,
    relations: entity.relations,
    hasRelations: entity.hasRelations,
    relatedEntities,
    validatorImports,
    hasValidatorImports: validatorImports.length > 0,
    swagger: entity.swagger ?? false,
    dateProperties: entity.dateProperties,
    optionalProperties: entity.optionalProperties,
  };
  const allFiles = [
    { name: `${entityFile}.controller.ts`, template: "controller" },
    { name: `${entityFile}.service.ts`, template: "service" },
    { name: `${entityFile}.module.ts`, template: "module" },
    { name: `dto/create-${entityFile}.dto.ts`, template: "create-dto" },
    { name: `dto/update-${entityFile}.dto.ts`, template: "update-dto" },
    { name: `dto/pagination.dto.ts`, template: "pagination-dto" },
    { name: `entities/${entityFile}.entity.ts`, template: "entity" },
  ]

  const files = allFiles.filter(f => filesToGenerate.includes(f.template));
  const templatesDir = resolveTemplatesDir(customTemplatesDir);

  for (const file of files) {
    const content = compileTemplate(file.template, context, templatesDir);
    const targetPath = path.join(outputDir, file.name);
    if (dryRun) {
      console.log(`🔍 [dry-run] Fichier : ${targetPath}`);
      const preview = content.split("\n").slice(0, 10).join("\n");
      console.log(preview + (content.split("\n").length > 10 ? "\n  ..." : ""));
    } else {
      await writeFileWithBackup(targetPath, content, entity.overwriteExisting);
    }
  }
}