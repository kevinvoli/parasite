# Plan d'Implémentation — `parasite-cli`

> Basé sur l'audit du 2026-03-02
> État de départ : build propre, 22 tests passants, ~75% fonctionnel

---

## Vue d'ensemble des phases

| Phase | Thème | Refs couvertes | Priorité |
|-------|-------|---------------|----------|
| **Phase 1** | Correction des bugs bloquants | B1–B5 | 🔴 Critique |
| **Phase 2** | Correction des bugs majeurs et mineurs | B6–B16 | 🟡 Haute |
| **Phase 3** | Robustesse du code généré | A1, A2, A3, A5, A6 | 🟡 Haute |
| **Phase 4** | Expérience développeur (DX) | A4, A7, A8, A9, A11, A12, A13, A14, N5, N7, N10 | 🟠 Moyenne |
| **Phase 5** | Nouvelles fonctionnalités majeures | N1, N2, N4, N9 | 🟠 Moyenne |
| **Phase 6** | Fonctionnalités avancées | N3, N6, N8 | 🟢 Basse |

---

## Phase 1 — Correction des bugs bloquants

> Ces bugs rendent le projet dysfonctionnel dans des cas courants. À corriger avant tout.

---

### P1.1 — Chemin des templates résolu avec `__dirname` `[B5]`

**Problème** : `path.resolve("src/templates/crud", ...)` échoue quand la CLI est installée globalement car le chemin est relatif au CWD de l'utilisateur, pas au package.

**Fichier** : `src/core/crud-generator.ts`

**Implémentation** :
```typescript
// Remplacer ligne 17
// AVANT
const templatePath = path.resolve("src/templates/crud", `${templateName}.hbs`);

// APRÈS — résout depuis le fichier JS compilé (dist/core/)
import { fileURLToPath } from "url";
import { dirname } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname  = dirname(__filename);

function compileTemplate(templateName: string, data: any, customDir?: string): string {
  const defaultDir = path.join(__dirname, "../../src/templates/crud");
  const templatePath = path.join(customDir ?? defaultDir, `${templateName}.hbs`);
  if (!fs.existsSync(templatePath)) {
    throw new Error(`Template introuvable : ${templatePath}`);
  }
  const templateSource = fs.readFileSync(templatePath, "utf8");
  const template = Handlebars.compile(templateSource);
  return template(data);
}
```

**Critère de validation** : `npm install -g .` puis `parasite generate` depuis n'importe quel répertoire → pas d'erreur `ENOENT`.

---

### P1.2 — `app.module.ts` mis à jour dans le flux `db` `[B1]`

**Problème** : `addModuleToAppModule()` est appelé dans `generate` mais jamais dans `db`.

**Fichier** : `src/core/generate-from-db.ts`

**Implémentation** :
```typescript
// Ajouter l'import en haut
import { addModuleToAppModule } from "../utils/app-module-updater.js";

// Dans la boucle for (const entity of entities), après generateCrudResources(...)
const appModulePath = path.join(srcDir, "app.module.ts");
if (fs.existsSync(appModulePath)) {
  await addModuleToAppModule(
    appModulePath,
    `${entity.name}Module`,
    `./${kebabCase(entity.name)}/${kebabCase(entity.name)}.module`
  );
  console.log(chalk.cyan(`  ↳ ${entity.name}Module importé dans app.module.ts`));
} else {
  console.log(chalk.yellow(`  ⚠ app.module.ts introuvable, import manuel requis pour ${entity.name}Module`));
}
```

**Critère de validation** : `parasite db --db-url mysql://...` → `app.module.ts` contient l'import de chaque module généré.

---

### P1.3 — Correction de `findBy()` → `find({ where: ... })` dans `service.hbs` `[B2]`

**Problème** : `findBy()` ne supporte pas les opérateurs TypeORM comme `In()`.

**Fichier** : `src/templates/crud/service.hbs`

**Implémentation** : Remplacer toutes les occurrences de `findBy({ id: In(...) })` par `find({ where: { id: In(...) } })`.

```handlebars
{{! AVANT }}
entity.{{relationFieldName}} = await this.{{relationFieldName}}Repository.findBy({ id: In({{relationFieldName}}Ids) });

{{! APRÈS }}
entity.{{relationFieldName}} = await this.{{relationFieldName}}Repository.find({ where: { id: In({{relationFieldName}}Ids) } });
```

Même correction dans le bloc `update` (deux occurrences : `create` et `update`).

**Critère de validation** : Le service généré compile sans erreur TypeORM au runtime.

---

### P1.4 — Extracteur de singulier robuste `[B3]`

**Problème** : `.replace(/s$/, "")` casse des mots comme `status`, `process`, `address`.

**Fichier à créer** : `src/utils/string-formatters.ts` (ajout de fonction)
**Fichiers impactés** : `src/core/mysql-scanner.ts`, `src/core/postgres-scanner.ts`

**Implémentation** :
```typescript
// src/utils/string-formatters.ts — ajouter
export function toSingular(word: string): string {
  if (!word) return word;
  const lower = word.toLowerCase();
  // Irréguliers courants
  const irregulars: Record<string, string> = {
    people: "person", men: "man", women: "woman",
    children: "child", teeth: "tooth", feet: "foot",
    mice: "mouse", geese: "goose",
  };
  if (irregulars[lower]) return irregulars[lower];
  // Règles générales
  if (lower.endsWith("ies") && lower.length > 4) return word.slice(0, -3) + "y";
  if (lower.endsWith("ses") || lower.endsWith("xes") ||
      lower.endsWith("zes") || lower.endsWith("ches") || lower.endsWith("shes"))
    return word.slice(0, -2);
  if (lower.endsWith("s") && !lower.endsWith("ss") &&
      !lower.endsWith("us") && !lower.endsWith("is"))
    return word.slice(0, -1);
  return word; // inchangé : "status", "process", "news"
}
```

Remplacer dans les scanners :
```typescript
// AVANT
const relationName = camelCase(fk.REFERENCED_TABLE_NAME).replace(/s$/, "");

// APRÈS
import { toSingular } from "../utils/string-formatters.js";
const relationName = camelCase(toSingular(fk.REFERENCED_TABLE_NAME));
```

**Critère de validation** : Test unitaire couvrant `status`, `address`, `categories`, `users`, `process`.

---

### P1.5 — Mapping TypeScript → type SQL dans `entity.hbs` `[B4]`

**Problème** : `@Column({ type: "number" })` est invalide pour TypeORM qui attend `"int"`.

**Fichiers** : `src/core/crud-generator.ts`, `src/templates/crud/entity.hbs`

**Implémentation** :

Dans `crud-generator.ts`, ajouter le mapping dans le contexte :
```typescript
const TS_TO_SQL: Record<string, string> = {
  number:  "int",
  string:  "varchar",
  boolean: "boolean",
  Date:    "timestamp",
  any:     "text",
};

// Dans le contexte Handlebars
const context = {
  ...
  properties: entity.properties.map(p => ({
    ...p,
    sqlType: TS_TO_SQL[p.type] ?? "text",
  })),
};
```

Dans `entity.hbs`, remplacer :
```handlebars
{{! AVANT }}
@Column({ type: "{{lowercase type}}", nullable: ... })

{{! APRÈS }}
@Column({ type: "{{sqlType}}", nullable: ... })
```

**Critère de validation** : Les entités générées compilent et fonctionnent sans erreur TypeORM.

---

## Phase 2 — Correction des bugs majeurs et mineurs

---

### P2.1 — `entity-scanner.ts` : détecter `isOwningRelation` `[B6]`

**Problème** : Le scanner ne lit pas `@JoinColumn` / `@JoinTable` pour positionner `isOwningRelation`.

**Fichier** : `src/core/entity-scanner.ts`

**Implémentation** :
```typescript
// Dans la boucle de parsing des propriétés de relation
const decorators = prop.getDecorators().map(d => d.getName());

let isOwningRelation: boolean | undefined;
if (relationType === "OneToOne") {
  isOwningRelation = decorators.includes("JoinColumn");
} else if (relationType === "ManyToMany") {
  isOwningRelation = decorators.includes("JoinTable");
} else if (relationType === "ManyToOne") {
  isOwningRelation = true;  // ManyToOne est toujours côté propriétaire
} // OneToMany : toujours côté inverse → isOwningRelation reste undefined

properties.push({
  ...existingFields,
  isOwningRelation,
});
```

**Critère de validation** : `parasite generate` sur un projet avec OneToOne génère le bon côté `@JoinColumn`.

---

### P2.2 — `module.hbs` : import des entités relationnelles `[B7]`

**Problème** : `{{Capitalise this}}` et `'../{{this}}/entities/{{this}}.entity'` utilisent le nom du champ, pas de l'entité.

**Fichier** : `src/templates/crud/module.hbs`

La correction nécessite de passer les relations avec leur `relatedEntity` (PascalCase) au contexte.

**Dans `crud-generator.ts`**, changer la construction des relations :
```typescript
// AVANT — tableau de noms de champs
relations: entity.properties.filter(p => p.isRelation).map(p => p.name),

// APRÈS — tableau d'objets avec nom de champ et entité associée
relations: entity.properties
  .filter(p => p.isRelation && p.relatedEntity)
  .map(p => ({
    fieldName: p.relationFieldName ?? p.name,
    entityName: p.relatedEntity!,
    entityFile: kebabCase(p.relatedEntity!),
  })),
```

**Dans `module.hbs`** :
```handlebars
{{! AVANT }}
{{#each relations}}
import { {{Capitalise this}} } from '../{{this}}/entities/{{this}}.entity';
{{/each}}

{{! APRÈS }}
{{#each relations}}
import { {{entityName}} } from '../{{entityFile}}/entities/{{entityFile}}.entity';
{{/each}}

{{! Et dans TypeOrmModule.forFeature }}
{{#each relations}}
  {{entityName}},
{{/each}}
```

**Critère de validation** : Les modules générés importent les entités correctement, même quand le nom de relation diffère du nom de table.

---

### P2.3 — `entity.hbs` : détection des colonnes date flexible `[B8]`

**Problème** : Seuls `created_at`, `updated_at`, `deleted_at` déclenchent les décorateurs spéciaux.

**Fichier** : `src/types.d.ts` + `src/core/crud-generator.ts` + `src/templates/crud/entity.hbs`

**Approche** : Ajouter une propriété `dateRole` dans `EntityProperty` et la renseigner lors de l'introspection.

```typescript
// types.d.ts
dateRole?: "created" | "updated" | "deleted" | "plain";
```

Dans les scanners :
```typescript
function inferDateRole(columnName: string): "created" | "updated" | "deleted" | "plain" {
  const n = columnName.toLowerCase();
  if (n.includes("creat")) return "created";
  if (n.includes("updat") || n.includes("modif")) return "updated";
  if (n.includes("delet") || n.includes("remov") || n.includes("archiv")) return "deleted";
  return "plain";
}
```

Dans `entity.hbs` :
```handlebars
{{#if (eq dateRole "created")}}
@CreateDateColumn(...)
{{else if (eq dateRole "updated")}}
@UpdateDateColumn(...)
{{else if (eq dateRole "deleted")}}
@DeleteDateColumn(...)
{{else}}
@Column({ type: "timestamp", ... })
{{/if}}
```

**Critère de validation** : `createdAt`, `date_creation`, `updatedAt`, `modified_at` reçoivent tous le bon décorateur.

---

### P2.4 — Corrections mineures groupées `[B9–B16]`

| Ref | Fichier | Action |
|-----|---------|--------|
| B9  | `src/utils/reccurcive.ts` | Renommer en `recursive.ts` + mettre à jour l'import dans `entity-scanner.ts` |
| B10 | `src/utils/string-formatters.ts` | Réécrire `kebabCase` pour gérer les underscores : `"my_Entity"` → `"my-entity"` |
| B11 | `src/utils/string-formatters.ts` | Réécrire `camelCase` pour gérer les doubles underscores |
| B12 | `src/cli/index.ts` | Corriger `"Entitiés"` → `"Entités"` |
| B13 | `src/handlebars/handlebars-helpers.ts` | Supprimer le helper `ne` (doublon de `neq`) |
| B14 | `src/handlebars/handlebars-helpers.ts` | Utiliser l'implémentation de `string-formatters.ts` pour `kebabCase` |
| B15 | `src/utils/config-loader.ts` | Logger un warning si le fichier JSON est invalide |
| B16 | `src/core/intelligent-generator.ts` | Renommer `entitys` → `entity` |

**Implémentation de B10/B11** :
```typescript
export function kebabCase(str: string): string {
  return str
    .replace(/_/g, "-")                                    // underscores → tirets
    .replace(/([a-z])([A-Z])/g, "$1-$2")                  // camelCase → kebab
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1-$2")            // acronymes
    .replace(/-+/g, "-")                                   // tirets doubles
    .toLowerCase();
}

export function camelCase(str: string): string {
  return str
    .replace(/_+([a-zA-Z])/g, (_, letter) => letter.toUpperCase())
    .replace(/^[A-Z]/, c => c.toLowerCase());
}
```

**Critère de validation** : Tests unitaires mis à jour pour `kebabCase("my_Entity")` → `"my-entity"` et `camelCase("my__test")` → `"myTest"`.

---

## Phase 3 — Robustesse du code généré

---

### P3.1 — Validation `class-validator` dans les DTOs `[A1]`

**Fichiers** : `src/templates/crud/create-dto.hbs`, `src/core/crud-generator.ts`

**Étape 1** : Mapper les types TypeScript vers les décorateurs `class-validator` dans `crud-generator.ts` :
```typescript
const TYPE_VALIDATORS: Record<string, string[]> = {
  string:  ["@IsString()"],
  number:  ["@IsNumber()"],
  boolean: ["@IsBoolean()"],
  Date:    ["@IsDateString()"],
  any:     [],
};
```

**Étape 2** : Injecter dans le contexte :
```typescript
properties: entity.properties.map(p => ({
  ...p,
  validators: TYPE_VALIDATORS[p.dtoType ?? p.type] ?? [],
  hasValidators: (TYPE_VALIDATORS[p.dtoType ?? p.type] ?? []).length > 0,
})),
```

**Étape 3** : Mettre à jour `create-dto.hbs` :
```handlebars
import { IsString, IsNumber, IsBoolean, IsDateString, IsOptional, IsArray, IsInt } from 'class-validator';

export class Create{{entityName}}Dto {
  {{#each properties}}
    {{#unless isPrimary}}
      {{#unless isJoinColumn}}
        {{#if isRelation}}
          {{! ... relation fields ... }}
        {{else}}
          {{#if isOptional}}
  @IsOptional()
          {{/if}}
          {{#each validators}}
  {{this}}
          {{/each}}
  {{name}}{{#if isOptional}}?{{/if}}: {{dtoType}};
        {{/if}}
      {{/unless}}
    {{/unless}}
  {{/each}}
}
```

**Critère de validation** : Les DTOs générés valident les entrées avec `ValidationPipe` de NestJS.

---

### P3.2 — Pagination dans `findAll()` `[A2]`

**Fichiers** : `src/templates/crud/service.hbs`, `src/templates/crud/controller.hbs`

**Créer** `src/templates/crud/pagination.dto.hbs` (template partagé) :
```typescript
import { IsOptional, IsInt, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';

export class PaginationDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;
}
```

**Dans `service.hbs`** :
```handlebars
async findAll(pagination?: { page?: number; limit?: number }): Promise<[{{entityName}}[], number]> {
  const page  = pagination?.page  ?? 1;
  const limit = pagination?.limit ?? 20;
  return await this.{{entityFile}}Repository.findAndCount({
    skip: (page - 1) * limit,
    take: limit,
    {{#if hasRelations}}
    relations: [{{#each relations}}"{{fieldName}}"{{#unless @last}}, {{/unless}}{{/each}}],
    {{/if}}
  });
}
```

**Dans `controller.hbs`** :
```handlebars
@Get()
findAll(@Query() pagination: PaginationDto) {
  return this.{{entityFile}}Service.findAll(pagination);
}
```

**Critère de validation** : `GET /users?page=2&limit=10` retourne les bons éléments.

---

### P3.3 — Transactions dans `create()` et `update()` `[A3]`

**Fichier** : `src/templates/crud/service.hbs`

**Implémentation** :
```handlebars
{{! Ajouter DataSource dans le constructeur }}
import { DataSource } from 'typeorm';

constructor(
  @InjectRepository({{entityName}})
  private readonly {{entityFile}}Repository: Repository<{{entityName}}>,
  private readonly dataSource: DataSource,
  {{! ... autres injections ... }}
) {}

async create(createDto: Create{{entityName}}Dto): Promise<{{entityName}}> {
  {{#if hasRelations}}
  return this.dataSource.transaction(async (manager) => {
    const { ...destructured relations... ...rest } = createDto;
    const entity = manager.create({{entityName}}, rest);
    {{! résolution des relations ... }}
    return manager.save(entity);
  });
  {{else}}
  const entity = this.{{entityFile}}Repository.create(createDto);
  return await this.{{entityFile}}Repository.save(entity);
  {{/if}}
}
```

**Critère de validation** : Si la résolution d'une relation échoue (ex: ID inexistant), aucune donnée n'est persistée.

---

### P3.4 — Nommage singulier robuste dans les scanners `[A6]`

> Dépend de P1.4 (déjà planifié). Ajouter les tests unitaires complets.

**Tests à ajouter dans** `src/utils/string-formatters.test.ts` :
```typescript
describe("toSingular", () => {
  it("cas standard", () => {
    expect(toSingular("users")).toBe("user");
    expect(toSingular("posts")).toBe("post");
    expect(toSingular("categories")).toBe("category");
    expect(toSingular("addresses")).toBe("address");
  });
  it("mots invariants", () => {
    expect(toSingular("status")).toBe("status");
    expect(toSingular("process")).toBe("process");
    expect(toSingular("news")).toBe("news");
  });
  it("irréguliers", () => {
    expect(toSingular("people")).toBe("person");
    expect(toSingular("children")).toBe("child");
  });
});
```

---

## Phase 4 — Expérience développeur (DX)

---

### P4.1 — Remplacer `@nestjs/cli` global par `npx` `[A4]`

**Fichier** : `src/core/generate-from-db.ts`

```typescript
// AVANT
function isNestInstalled(): boolean {
  try { execSync("nest --version", { stdio: "ignore" }); return true; }
  catch { return false; }
}
// ...
if (!isNestInstalled()) {
  console.error(chalk.red("❌ Le CLI NestJS n'est pas installé..."));
  process.exit(1);
}
execSync(`nest new ${outputDir} --skip-install`, { stdio: "inherit" });

// APRÈS — supprimer isNestInstalled() entièrement
execSync(`npx --yes @nestjs/cli new ${outputDir} --package-manager npm`, { stdio: "inherit" });
```

**Critère de validation** : `parasite db --db-url ...` fonctionne sans `@nestjs/cli` installé globalement.

---

### P4.2 — Décorateurs Swagger/OpenAPI `[A7]`

**Fichier** : `src/templates/crud/controller.hbs`

**Approche** : Ajouter les décorateurs en option via la config (`swagger: true`).

```typescript
// parasite.conf.json
{ "swagger": true }
```

```handlebars
{{#if swagger}}
import { ApiTags, ApiOperation, ApiResponse, ApiParam } from '@nestjs/swagger';

@ApiTags('{{route}}')
{{/if}}
@Controller('{{route}}')
export class {{entityName}}Controller {

  @Post()
  {{#if swagger}}
  @ApiOperation({ summary: 'Créer un(e) {{entityName}}' })
  @ApiResponse({ status: 201, description: '{{entityName}} créé(e) avec succès.' })
  {{/if}}
  create(@Body() createDto: Create{{entityName}}Dto) {
    return this.{{entityFile}}Service.create(createDto);
  }

  @Get(':id')
  {{#if swagger}}
  @ApiParam({ name: 'id', type: Number })
  @ApiResponse({ status: 404, description: '{{entityName}} introuvable.' })
  {{/if}}
  findOne(@Param('id') id: string) {
    return this.{{entityFile}}Service.findOne(+id);
  }
  // ...
}
```

**Critère de validation** : `swagger: true` dans la config → les controllers générés incluent les décorateurs `@ApiTags`, `@ApiOperation`, `@ApiResponse`.

---

### P4.3 — Variables d'environnement dans la config `[A8]`

**Fichier** : `src/utils/config-loader.ts`

```typescript
function resolveEnvVars(obj: any): any {
  if (typeof obj === "string") {
    return obj.replace(/\$\{([^}]+)\}/g, (_, key) => process.env[key] ?? _);
  }
  if (Array.isArray(obj)) return obj.map(resolveEnvVars);
  if (obj && typeof obj === "object") {
    return Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, resolveEnvVars(v)]));
  }
  return obj;
}

export async function loadConfig(): Promise<ParasiteConfig> {
  // ... lecture fichier JSON ...
  return resolveEnvVars(parsed) as ParasiteConfig;
}
```

**Critère de validation** : `DB_HOST=myserver parasite db` utilise `myserver` comme host.

---

### P4.4 — Détection et génération des colonnes `uuid` `[A9]`

**Fichiers** : `src/core/mysql-scanner.ts`, `src/core/postgres-scanner.ts`, `src/templates/crud/entity.hbs`

**Dans les scanners**, ajouter une propriété `isUuid` :
```typescript
properties.push({
  ...existingFields,
  isUuid: col.Type === "char(36)" || col.udt_name === "uuid",
  isPrimary,
});
```

**Dans `entity.hbs`** :
```handlebars
{{#if isUuid}}
  {{#if isPrimary}}
@PrimaryGeneratedColumn("uuid")
  {{else}}
@Column({ type: "uuid", generated: "uuid", nullable: {{#if isOptional}}true{{else}}false{{/if}} })
  {{/if}}
{{else if isPrimary}}
@PrimaryGeneratedColumn("increment")
{{/if}}
{{name}}: string;
```

---

### P4.5 — Mode `--dry-run` `[A11]`

**Fichiers** : `src/cli/index.ts`, `src/core/crud-generator.ts`, `src/core/generate-from-db.ts`

**Dans `crud-generator.ts`**, ajouter un paramètre `dryRun` :
```typescript
export async function generateCrudResources(
  entity: EnrichedEntity,
  outputBase: string,
  filesToGenerate: string[] = [...],
  dryRun = false
) {
  // ...
  for (const file of files) {
    const content = compileTemplate(file.template, context);
    const targetPath = path.join(outputDir, file.name);
    if (dryRun) {
      console.log(chalk.cyan(`[dry-run] Serait créé : ${targetPath}`));
      console.log(chalk.gray("─".repeat(60)));
      console.log(content.slice(0, 200) + (content.length > 200 ? "\n..." : ""));
    } else {
      await fs.writeFile(targetPath, content, "utf-8");
      console.log(`✅ Créé : ${targetPath}`);
    }
  }
}
```

**Dans `cli/index.ts`** :
```typescript
program
  .command("generate")
  .option("--dry-run", "Affiche ce qui serait généré sans écrire de fichiers")
  .action(async (options) => {
    // ...
    await generateMissingCrudElements(entity, projectRoot, options.dryRun);
  });
```

---

### P4.6 — Mode interactif avec `inquirer` `[A12]`

**Fichier** : `src/cli/index.ts`

```typescript
import inquirer from "inquirer";

program
  .command("db")
  .option("-d, --db-url <url>", "URL de connexion")
  .action(async (options) => {
    let dbUrl = options.dbUrl ?? config.db ? buildUrlFromConfig(config.db) : null;

    if (!dbUrl) {
      const answers = await inquirer.prompt([
        {
          type: "list",
          name: "type",
          message: "Type de base de données :",
          choices: ["postgres", "mysql", "sqlite"],
        },
        {
          type: "input",
          name: "host",
          message: "Host :",
          default: "localhost",
          when: (a) => a.type !== "sqlite",
        },
        {
          type: "number",
          name: "port",
          message: "Port :",
          default: (a: any) => a.type === "postgres" ? 5432 : 3306,
          when: (a) => a.type !== "sqlite",
        },
        {
          type: "input",
          name: "username",
          message: "Utilisateur :",
          when: (a) => a.type !== "sqlite",
        },
        {
          type: "password",
          name: "password",
          message: "Mot de passe :",
          when: (a) => a.type !== "sqlite",
        },
        {
          type: "input",
          name: "database",
          message: "Nom de la base / chemin du fichier :",
        },
      ]);
      dbUrl = buildUrlFromAnswers(answers);
    }
    await generateFromDatabase(dbUrl, options.output);
  });
```

---

### P4.7 — Backup avant écrasement `[A13]`

**Fichier** : `src/core/crud-generator.ts`

```typescript
async function writeFileWithBackup(targetPath: string, content: string, overwrite: boolean): Promise<void> {
  if (fs.existsSync(targetPath) && overwrite) {
    const backupPath = `${targetPath}.bak`;
    await fs.copy(targetPath, backupPath);
    console.log(chalk.gray(`  📦 Backup : ${backupPath}`));
  }
  await fs.writeFile(targetPath, content, "utf-8");
}
```

**Dans la config** : déclenché uniquement si `overwriteExisting: true`.

---

### P4.8 — Support des colonnes `enum` `[A14]`

**Fichiers** : `src/core/mysql-scanner.ts`, `src/core/postgres-scanner.ts`, `src/types.d.ts`, `src/templates/crud/entity.hbs`

**Dans `types.d.ts`** :
```typescript
enumValues?: string[];  // Pour les colonnes de type ENUM
```

**Dans MySQL scanner** :
```typescript
// Détecter les colonnes ENUM : Type ressemble à "enum('a','b','c')"
if (col.Type.startsWith("enum(")) {
  const values = col.Type.match(/enum\((.+)\)/)?.[1]
    .split(",").map(v => v.trim().replace(/'/g, ""));
  properties.push({
    ...baseProps,
    type: "string", // TypeScript type
    enumValues: values,
    isEnum: true,
  });
}
```

**Dans `entity.hbs`** :
```handlebars
{{#if isEnum}}
export enum {{Capitalise name}}Enum {
  {{#each enumValues}}
  {{uppercase this}} = '{{this}}',
  {{/each}}
}

@Column({ type: 'enum', enum: {{Capitalise name}}Enum, nullable: ... })
{{name}}: {{Capitalise name}}Enum;
{{/if}}
```

---

### P4.9 — Templates personnalisables via `templatesDir` `[N5]`

**Fichier** : `src/core/crud-generator.ts`

```typescript
import { loadConfig } from "../utils/config-loader.js";

async function getTemplatesDir(): Promise<string> {
  const config = await loadConfig();
  if (config.templatesDir) {
    const customDir = path.resolve(process.cwd(), config.templatesDir);
    if (fs.existsSync(customDir)) return customDir;
    console.warn(chalk.yellow(`⚠ templatesDir introuvable: ${customDir}. Templates par défaut utilisés.`));
  }
  const __dirname = dirname(fileURLToPath(import.meta.url));
  return path.join(__dirname, "../../src/templates/crud");
}
```

---

### P4.10 — Validation de `parasite.conf.json` avec Zod `[N10]`

**Nouvelle dépendance** : `npm install zod`

**Fichier** : `src/utils/config-loader.ts`

```typescript
import { z } from "zod";

const DbConfigSchema = z.object({
  type:     z.enum(["postgres", "mysql", "sqlite"]),
  host:     z.string().optional(),
  port:     z.number().int().positive().optional(),
  username: z.string().optional(),
  password: z.string().optional(),
  database: z.string(),
});

const ParasiteConfigSchema = z.object({
  projectRoot:       z.string().optional(),
  entitiesPath:      z.string().optional(),
  templatesDir:      z.string().optional(),
  namingConvention:  z.enum(["camelCase", "snake_case"]).optional(),
  overwriteExisting: z.boolean().optional(),
  swagger:           z.boolean().optional(),
  db:                DbConfigSchema.optional(),
});

export async function loadConfig(): Promise<z.infer<typeof ParasiteConfigSchema>> {
  // ...
  const result = ParasiteConfigSchema.safeParse(raw);
  if (!result.success) {
    console.warn(chalk.yellow("⚠ parasite.conf.json invalide :"));
    result.error.issues.forEach(issue =>
      console.warn(chalk.yellow(`  - ${issue.path.join(".")}: ${issue.message}`))
    );
    return {};
  }
  return result.data;
}
```

---

### P4.11 — Logging structuré avec niveaux `[N7]`

**Nouveau fichier** : `src/utils/logger.ts`

```typescript
type LogLevel = "debug" | "info" | "warn" | "error" | "silent";

let currentLevel: LogLevel = "info";

const LEVELS: Record<LogLevel, number> = {
  debug: 0, info: 1, warn: 2, error: 3, silent: 99
};

export const logger = {
  setLevel: (level: LogLevel) => { currentLevel = level; },
  debug: (msg: string) => LEVELS[currentLevel] <= 0 && console.log(chalk.gray(`[debug] ${msg}`)),
  info:  (msg: string) => LEVELS[currentLevel] <= 1 && console.log(chalk.blue(msg)),
  success:(msg: string)=> LEVELS[currentLevel] <= 1 && console.log(chalk.green(msg)),
  warn:  (msg: string) => LEVELS[currentLevel] <= 2 && console.warn(chalk.yellow(`⚠ ${msg}`)),
  error: (msg: string) => LEVELS[currentLevel] <= 3 && console.error(chalk.red(`❌ ${msg}`)),
};
```

**Dans `cli/index.ts`** :
```typescript
program
  .option("--verbose", "Afficher les détails complets")
  .option("--quiet",   "Afficher uniquement les erreurs")
  .hook("preAction", (cmd) => {
    if (cmd.opts().verbose) logger.setLevel("debug");
    else if (cmd.opts().quiet) logger.setLevel("error");
  });
```

Remplacer tous les `console.log`, `console.warn`, `console.error` par `logger.*`.

---

## Phase 5 — Nouvelles fonctionnalités majeures

---

### P5.1 — Tests unitaires : `postgres-scanner.ts` `[N9 — priorité haute]`

**Nouveau fichier** : `src/core/postgres-scanner.test.ts`

**Nouveau mock** : `src/__mocks__/pg/index.js`

Structure du mock (calqué sur le mock mysql2) :
```javascript
export const mockQuery = jest.fn();
export const Client = jest.fn().mockImplementation(() => ({
  connect: jest.fn().mockResolvedValue(undefined),
  query:   mockQuery,
  end:     jest.fn().mockResolvedValue(undefined),
}));
export default { Client };
```

**Suites de tests à écrire** :
1. `mapPostgresTypeToTS` — mapping des types PostgreSQL
2. Table simple sans relations
3. Relation ManyToOne + inverse OneToMany
4. Relation OneToOne (FK UNIQUE)
5. Relation ManyToMany (table de jonction)
6. PK composite
7. Colonne UUID

---

### P5.2 — Tests unitaires : `entity-scanner.ts` `[N9 — priorité haute]`

**Nouveau fichier** : `src/core/entity-scanner.test.ts`

**Approche** : Créer des fixtures TypeScript en mémoire avec `ts-morph` :
```typescript
import { Project } from "ts-morph";

function createEntityFixture(source: string) {
  const project = new Project({ useInMemoryFileSystem: true });
  return project.createSourceFile("test.entity.ts", source);
}

it("détecte une entité simple", () => {
  const source = `
    import { Entity, PrimaryGeneratedColumn, Column } from "typeorm";
    @Entity()
    export class User {
      @PrimaryGeneratedColumn()
      id: number;
      @Column()
      name: string;
    }
  `;
  const entities = scanEntitiesFromSource(source);
  expect(entities[0].name).toBe("User");
  expect(entities[0].properties).toHaveLength(2);
});
```

---

### P5.3 — Tests unitaires : `crud-generator.ts` `[N9 — priorité moyenne]`

**Nouveau fichier** : `src/core/crud-generator.test.ts`

**Approche** : Utiliser `memfs` ou `fs-extra` en mode mock pour vérifier les fichiers générés sans écriture disque.

```typescript
it("génère un service correct pour une entité sans relations", async () => {
  const entity: ParsedEntity = {
    name: "Product",
    originalTableName: "products",
    filePath: "/tmp/product/entities/product.entity.ts",
    properties: [
      { name: "id", type: "number", isPrimary: true, isRelation: false, ... },
      { name: "name", type: "string", isPrimary: false, isRelation: false, ... },
    ],
  };
  const files = await generateCrudResourcesInMemory(entity, "/tmp");
  expect(files["product.service.ts"]).toContain("class ProductService");
  expect(files["product.service.ts"]).toContain("findAll()");
});
```

---

### P5.4 — Scanner SQLite `[N2]`

**Nouvelle dépendance** : `better-sqlite3` (plus fiable que `sqlite3` pour la synchronisation)

**Nouveau fichier** : `src/core/sqlite-scanner.ts`

```typescript
import Database from "better-sqlite3";
import { DatabaseScanner } from "./db-scanner.js";
import { ParsedEntity } from "../types.js";

export class SqliteScanner implements DatabaseScanner {
  async introspect(dbUrl: string, outputDir = "parasite-app"): Promise<ParsedEntity[]> {
    const dbPath = dbUrl.replace(/^sqlite:\/\//, "");
    const db = new Database(dbPath, { readonly: true });

    try {
      const tables = db
        .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")
        .all() as { name: string }[];

      if (tables.length === 0) throw new Error("❌ Aucune table trouvée.");

      const allEntities: Record<string, ParsedEntity> = {};

      // Premier passage : colonnes et FK
      for (const { name: tableName } of tables) {
        const columns = db.prepare(`PRAGMA table_info(${tableName})`).all() as any[];
        const foreignKeys = db.prepare(`PRAGMA foreign_key_list(${tableName})`).all() as any[];
        // ... même logique 3 passes que mysql/postgres
      }

      return Object.values(allEntities);
    } finally {
      db.close();
    }
  }
}
```

**Dans `generate-from-db.ts`** :
```typescript
import { SqliteScanner } from "./sqlite-scanner.js";

function getDbScanner(dbUrl: string): DatabaseScanner {
  if (dbUrl.startsWith("mysql://"))   return new MySqlScanner();
  if (dbUrl.startsWith("postgres://") || dbUrl.startsWith("postgresql://")) return new PostgresScanner();
  if (dbUrl.startsWith("sqlite://"))  return new SqliteScanner();
  throw new Error(`Type de base non supporté : ${dbUrl}`);
}
```

---

### P5.5 — Commande `parasite add <EntityName>` `[N4]`

**Fichier** : `src/cli/index.ts` (nouvelle commande)
**Nouveau fichier** : `src/core/interactive-generator.ts`

```typescript
program
  .command("add <entityName>")
  .description("Crée une nouvelle entité et son CRUD de manière interactive")
  .option("-p, --project <path>", "Chemin du projet NestJS")
  .action(async (entityName, options) => {
    const properties = await promptEntityProperties(entityName);
    const entity = buildParsedEntity(entityName, properties);
    const projectRoot = options.project ?? config.projectRoot ?? ".";
    await generateMissingCrudElements(entity, projectRoot);
    await addModuleToAppModule(...);
    console.log(chalk.green(`✅ Entité ${entityName} créée avec succès !`));
  });
```

**`promptEntityProperties()`** utilise `inquirer` pour demander :
- Colonnes (nom, type, nullable)
- Relations (type, entité cible)
- Colonnes de date automatiques (created_at, updated_at, deleted_at)

---

### P5.6 — Commande `parasite diff` `[N1]`

**Fichier** : `src/cli/index.ts` (nouvelle commande)
**Nouveau fichier** : `src/core/schema-differ.ts`

```typescript
program
  .command("diff")
  .description("Compare les entités du projet avec le schéma de la base de données")
  .requiredOption("-d, --db-url <url>", "URL de connexion à la base")
  .option("-p, --project <path>", "Chemin du projet NestJS")
  .action(async (options) => {
    const scanner = getDbScanner(options.dbUrl);
    const dbEntities = await scanner.introspect(options.dbUrl, options.project ?? ".");

    const projectEntities = await scanEntities(options.project ?? ".");
    const diffs = computeDiff(dbEntities, projectEntities);

    if (diffs.length === 0) {
      console.log(chalk.green("✅ Entités synchronisées avec la base de données."));
    } else {
      diffs.forEach(d => console.log(chalk.yellow(`⚠ ${d}`)));
    }
  });
```

**`computeDiff()`** compare :
- Tables DB sans entité correspondante
- Entités sans table correspondante
- Colonnes DB absentes dans l'entité
- Propriétés d'entité absentes en DB

---

## Phase 6 — Fonctionnalités avancées

---

### P6.1 — Tests d'intégration end-to-end `[N8]`

**Nouveau fichier** : `src/__tests__/e2e/generate.test.ts`

**Approche** :
1. Créer un projet NestJS minimal en mémoire (structure simulée)
2. Appeler le générateur complet
3. Vérifier que le code généré compile avec `tsc --noEmit`

```typescript
it("génère un projet NestJS qui compile", async () => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "parasite-e2e-"));
  try {
    // Créer une entité de test
    await setupMinimalNestProject(tmpDir);
    await generateFromEntities(tmpDir);
    // Vérifier que tsc ne produit pas d'erreurs
    const result = spawnSync("tsc", ["--noEmit"], { cwd: tmpDir });
    expect(result.status).toBe(0);
  } finally {
    await fs.remove(tmpDir);
  }
}, 30_000);
```

---

### P6.2 — Génération de migrations TypeORM `[N3]`

**Fichier** : `src/cli/index.ts` (nouvelle commande)
**Nouveau fichier** : `src/core/migration-generator.ts`

```typescript
program
  .command("migrate")
  .description("Génère une migration TypeORM à partir du schéma DB")
  .requiredOption("-d, --db-url <url>", "URL de connexion")
  .option("-n, --name <name>", "Nom de la migration", "AutoMigration")
  .action(async (options) => {
    const scanner = getDbScanner(options.dbUrl);
    const entities = await scanner.introspect(options.dbUrl);
    const migrationContent = generateMigrationFile(entities, options.name);
    const fileName = `${Date.now()}-${options.name}.ts`;
    await fs.writeFile(path.join("src/migrations", fileName), migrationContent);
    console.log(chalk.green(`✅ Migration créée : src/migrations/${fileName}`));
  });
```

---

### P6.3 — Support MongoDB / Mongoose `[N6]`

**Prérequis** : `npm install mongoose @nestjs/mongoose`

**Nouveaux fichiers** :
- `src/core/mongo-scanner.ts` — introspection de collections MongoDB
- `src/templates/mongo/schema.hbs` — template Mongoose Schema
- `src/templates/mongo/service.hbs` — service avec Model<T>

**Dans `generate-from-db.ts`** :
```typescript
if (dbUrl.startsWith("mongodb://") || dbUrl.startsWith("mongodb+srv://")) {
  return new MongoScanner();
}
```

---

## Dépendances entre phases

```
Phase 1 ──────────────────► Phase 3
   │                           │
   │  (B5 doit précéder A4/N5) │  (A5 intègre B4)
   ▼                           ▼
Phase 2 ──────────────────► Phase 4
   │
   │  (B14 doit précéder N7)
   ▼
Phase 5 ──────────────────► Phase 6
```

Dépendances spécifiques :
- `P1.1` (chemin templates) doit précéder `P4.9` (templates personnalisables)
- `P1.4` (toSingular) doit précéder `P3.4` (tests singulier)
- `P2.2` (module.hbs) doit précéder `P3.1` (class-validator) car les deux touchent le contexte des relations
- `P4.10` (Zod config) doit précéder `P4.2` (swagger optionnel via config)
- `P5.1` et `P5.2` (tests) peuvent être développés en parallèle

---

## Récapitulatif des fichiers touchés par phase

| Phase | Fichiers créés | Fichiers modifiés |
|-------|---------------|-------------------|
| **P1** | — | `crud-generator.ts`, `generate-from-db.ts`, `service.hbs`, `string-formatters.ts`, `entity.hbs` |
| **P2** | — | `entity-scanner.ts`, `module.hbs`, `entity.hbs`, `reccurcive.ts`→`recursive.ts`, `string-formatters.ts`, `cli/index.ts`, `handlebars-helpers.ts`, `config-loader.ts`, `intelligent-generator.ts` |
| **P3** | `pagination.dto.hbs` | `create-dto.hbs`, `service.hbs`, `controller.hbs`, `crud-generator.ts`, `string-formatters.test.ts` |
| **P4** | `logger.ts`, `pagination.dto.hbs` | `generate-from-db.ts`, `controller.hbs`, `config-loader.ts`, `mysql-scanner.ts`, `postgres-scanner.ts`, `entity.hbs`, `cli/index.ts`, `crud-generator.ts` |
| **P5** | `postgres-scanner.test.ts`, `entity-scanner.test.ts`, `crud-generator.test.ts`, `sqlite-scanner.ts`, `interactive-generator.ts`, `schema-differ.ts` | `generate-from-db.ts`, `cli/index.ts` |
| **P6** | `migration-generator.ts`, `mongo-scanner.ts`, `templates/mongo/*.hbs`, `e2e/generate.test.ts` | `cli/index.ts` |

---

## État cible après toutes les phases

| Fonctionnalité | État actuel | État cible |
|---|---|---|
| `parasite init` | ✅ | ✅ + validation Zod |
| `parasite generate` | ✅ partiel | ✅ complet + dry-run + interactif |
| `parasite db` (MySQL/PG) | ✅ partiel | ✅ complet + app.module + transactions |
| `parasite db` (SQLite) | ❌ | ✅ |
| `parasite add` | ❌ | ✅ |
| `parasite diff` | ❌ | ✅ |
| `parasite migrate` | ❌ | ✅ |
| DTOs avec validation | ❌ | ✅ class-validator |
| Pagination | ❌ | ✅ |
| Transactions | ❌ | ✅ |
| Swagger/OpenAPI | ❌ | ✅ optionnel |
| Templates custom | ❌ (config présente) | ✅ |
| Variables d'env dans config | ❌ | ✅ |
| Colonnes enum | ❌ | ✅ |
| Colonnes UUID | ⚠️ partiel | ✅ |
| Logging structuré | ❌ | ✅ --verbose / --quiet |
| Tests : mysql-scanner | ✅ 22 tests | ✅ |
| Tests : postgres-scanner | ❌ 0% | ✅ |
| Tests : entity-scanner | ❌ 0% | ✅ |
| Tests : crud-generator | ❌ 0% | ✅ |
| Tests E2E | ❌ | ✅ |
| MongoDB/Mongoose | ❌ | ✅ |
