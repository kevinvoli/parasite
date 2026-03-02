# Audit Complet — `parasite-cli`

> Généré le 2026-03-02

---

## État général

L'outil est **fonctionnel à ~75%** : la base architecturale est solide (AST, séparation analyse/génération, templates Handlebars), mais plusieurs bugs bloquants, des fonctionnalités manquantes et un manque de robustesse freinent une utilisation en production.

---

## 1. Fonctionnalités existantes — État réel

| Fonctionnalité | Commande | État | Notes |
|---|---|---|---|
| Initialisation config | `parasite init` | ✅ Fonctionne | |
| Nettoyage | `parasite clean` | ✅ Fonctionne | |
| Génération depuis entités | `parasite generate` | ✅ Fonctionne | Évite d'écraser les fichiers existants |
| Génération depuis MySQL | `parasite db` | ✅ Fonctionne | Relations complètes (ManyToOne, OneToMany, OneToOne, ManyToMany) |
| Génération depuis PostgreSQL | `parasite db` | ✅ Fonctionne | Parité complète avec MySQL |
| Mise à jour `app.module.ts` | automatique | ⚠️ Partiel | Fonctionne pour `generate` mais **absent** du flux `db` |
| Templates CRUD | interne | ✅ Fonctionne | Controller, Service, Module, Entity, DTOs |

---

## 2. Bugs identifiés

### 🔴 Critiques (bloquants)

**B1 — `generate-from-db.ts` : les modules générés ne sont jamais importés dans `app.module.ts`**

`addModuleToAppModule()` est appelé dans le flux `generate` mais pas dans le flux `db`.
Impact : l'utilisateur doit manuellement importer chaque module — la promesse d'automatisation n'est pas tenue.

---

**B2 — `service.hbs` : `findBy()` ne supporte pas `In()` de TypeORM**

```typescript
// Généré actuellement — NE FONCTIONNE PAS correctement
entity.posts = await this.postsRepository.findBy({ id: In(postIds) });
// findBy() n'accepte pas les opérateurs TypeORM comme In()

// Correct :
entity.posts = await this.postsRepository.find({ where: { id: In(postIds) } });
```

---

**B3 — Extracteur de singulier naïf dans les deux scanners**

```typescript
const relationName = camelCase(fk.REFERENCED_TABLE_NAME).replace(/s$/, "");
// "users"   → "user"   ✓
// "status"  → "statu"  ✗
// "process" → "proces" ✗
// "address" → "addres" ✗
```

---

**B4 — `entity.hbs` : le type de colonne scalaire est incorrect**

```handlebars
@Column({ type: "{{lowercase type}}", ... })
```
`type` est le type TypeScript (`number`, `string`) mais TypeORM attend le type SQL (`int`, `varchar`).
Génère des entités invalides au runtime.

---

**B5 — `crud-generator.ts` : chemin des templates codé en dur**

```typescript
const templatePath = path.resolve("src/templates/crud", `${templateName}.hbs`);
```
Ne fonctionne que si la commande est lancée depuis la racine du projet `parasite-cli`.
Incompatible avec l'installation globale en tant que CLI (`npm install -g`).

---

### 🟡 Majeurs (dégradent le résultat généré)

**B6 — `entity-scanner.ts` : `isOwningRelation` n'est jamais défini**

Le scanner d'entités existantes ne positionne pas `isOwningRelation`, donc les templates
OneToOne/ManyToMany généreront toujours la version inverse (sans `@JoinColumn`/`@JoinTable`).

---

**B7 — `module.hbs` : import des entités relationnelles cassé**

```handlebars
import { {{Capitalise this}} } from '../{{this}}/entities/{{this}}.entity';
```
`this` est le champ de relation (ex: `author`) pas l'entité (ex: `User`).
L'import sera `'../author/entities/author.entity'` même si l'entité est dans `user/`.
Il faudrait utiliser `relatedEntity` (PascalCase) et son kebabCase pour le chemin.

---

**B8 — `entity.hbs` : noms de colonnes date codés en dur en anglais**

```handlebars
{{#if (eq name "created_at")}} → @CreateDateColumn
{{else if (eq name "updated_at")}} → @UpdateDateColumn
{{else if (eq name "deleted_at")}} → @DeleteDateColumn
```
Ne fonctionne pas pour `createdAt`, `dateCreation`, `date_creation`, etc.

---

### 🟠 Mineurs (qualité / maintenabilité)

| Ref | Fichier | Problème |
|-----|---------|----------|
| B9  | `reccurcive.ts` | Faute de frappe dans le nom du fichier (`reccurcive` → `recursive`) |
| B10 | `string-formatters.ts` | `kebabCase("my_Entity")` → `"my_-entity"` (underscore + majuscule) |
| B11 | `string-formatters.ts` | `camelCase("my__test")` → `"my_test"` (double underscore perdu) |
| B12 | `cli/index.ts` | Typo : `"Entitiés"` → `"Entités"` (ligne 112) |
| B13 | `handlebars-helpers.ts` | Helper `ne` duplique `neq` — inutile |
| B14 | `handlebars-helpers.ts` | Deux implémentations différentes de `kebabCase` (helpers vs utils) |
| B15 | `config-loader.ts` | Erreur JSON silencieuse — l'utilisateur ne sait pas que sa config est ignorée |
| B16 | `intelligent-generator.ts` | Typo variable `entitys` (ligne 25) — fonctionne par chance |

---

## 3. Améliorations des fonctionnalités existantes

### Priorité haute

**A1 — Templates avec validation `class-validator`**

Les DTOs générés n'ont aucun décorateur de validation.

```typescript
// Actuellement généré
export class CreateUserDto {
  name: string;
  age: number;
}

// À générer
import { IsString, IsInt, IsOptional, Min } from 'class-validator';

export class CreateUserDto {
  @IsString()
  name: string;

  @IsInt()
  @Min(0)
  age: number;
}
```

---

**A2 — Pagination dans `findAll()`**

Tous les `findAll()` générés chargent la table entière sans limite.

```typescript
// À générer
async findAll(page = 1, limit = 20) {
  return this.repo.findAndCount({
    skip: (page - 1) * limit,
    take: limit,
    relations: [...],
  });
}
```

---

**A3 — Transactions dans `create()` et `update()`**

La création d'une entité avec plusieurs relations fait plusieurs requêtes non atomiques.

```typescript
// À générer
async create(dto: CreateUserDto) {
  return this.dataSource.transaction(async (manager) => {
    const entity = manager.create(User, rest);
    // résolution des relations...
    return manager.save(entity);
  });
}
```

---

**A4 — Utiliser `npx @nestjs/cli` au lieu de la dépendance globale**

```typescript
// Actuellement
execSync(`nest new ${outputDir} --skip-install`);

// Proposé
execSync(`npx --yes @nestjs/cli new ${outputDir} --skip-install`);
```
Résout le point **Tâche 3.1** du `JOURNAL_REFACTORING.md`.

---

**A5 — Mapping TypeScript → type SQL dans les entités générées**

```typescript
// Table de mapping à ajouter dans crud-generator.ts
const tsTypeToSqlType: Record<string, string> = {
  number:  "int",
  string:  "varchar",
  boolean: "boolean",
  Date:    "timestamp",
  any:     "text",
};
```

---

**A6 — Nommage singulier robuste**

Remplacer le `.replace(/s$/, "")` par une vraie logique :

```typescript
function toSingular(word: string): string {
  if (word.endsWith("ies"))  return word.slice(0, -3) + "y"; // categories → category
  if (word.endsWith("ses") || word.endsWith("xes") || word.endsWith("zes"))
    return word.slice(0, -2); // addresses → address
  if (word.endsWith("s") && !word.endsWith("ss"))
    return word.slice(0, -1); // users → user
  return word;                 // status → status (inchangé)
}
```

---

### Priorité moyenne

**A7 — Décorateurs Swagger/OpenAPI dans les templates**

```typescript
// controller.hbs — à ajouter
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';

@ApiTags('{{entityFile}}')
@Controller('{{route}}')
export class {{entityName}}Controller {
  @ApiOperation({ summary: 'Create {{entityName}}' })
  @ApiResponse({ status: 201, type: {{entityName}} })
  @Post()
  create(@Body() dto: Create{{entityName}}Dto) { ... }
}
```

---

**A8 — Support des variables d'environnement dans la config**

```json
{
  "db": {
    "type": "postgres",
    "host": "${DB_HOST}",
    "port": "${DB_PORT}",
    "username": "${DB_USER}",
    "password": "${DB_PASSWORD}"
  }
}
```

---

**A9 — Détection des colonnes `uuid` dans les scanners**

Les colonnes UUID en PostgreSQL sont mappées en `string` mais ne reçoivent pas
`@PrimaryGeneratedColumn("uuid")` ni `@Generated("uuid")` dans l'entité générée.

---

**A10 — `entity-scanner.ts` : positionner `isOwningRelation` correctement**

Le scanner doit détecter si un `@JoinColumn` ou `@JoinTable` est présent sur la propriété
pour définir `isOwningRelation: true` et générer les bons décorateurs.

---

### Priorité basse

**A11 — Mode `--dry-run`**

Afficher ce qui serait généré sans écrire sur le disque.

```bash
parasite generate --dry-run
parasite db --db-url postgres://... --dry-run
```

---

**A12 — Mode interactif avec prompts**

Utiliser `inquirer` (déjà dans les dépendances) pour guider l'utilisateur quand les options
sont absentes :

```bash
$ parasite db
? Type de base de données : (MySQL / PostgreSQL)
? Host : localhost
? Port : 5432
```

---

**A13 — Backup avant écrasement**

Créer un fichier `.bak` des fichiers existants avant de les réécrire
(utile quand `overwriteExisting: true`).

---

**A14 — Support des colonnes `enum`**

Les colonnes `ENUM` MySQL/PostgreSQL génèrent `type: "any"` alors qu'un vrai `enum`
TypeScript serait préférable :

```typescript
export enum UserRole { ADMIN = 'admin', USER = 'user' }

@Column({ type: 'enum', enum: UserRole })
role: UserRole;
```

---

## 4. Nouvelles fonctionnalités à ajouter

### Fonctionnalités techniques

**N1 — Commande `parasite diff`**

Comparer les entités du projet avec le schéma DB actuel et lister les divergences
(colonnes ajoutées/supprimées, relations manquantes).

```bash
parasite diff --db-url postgres://user:pass@localhost/mydb
# → Entity User: colonne 'phone' absente dans l'entité
# → Table 'invoices': aucune entité générée
```

---

**N2 — Scanner SQLite**

`sqlite3` est déjà dans les dépendances. Ajouter un `SqliteScanner` implémentant
`DatabaseScanner` et le brancher dans `getDbScanner()` de `generate-from-db.ts`.

```typescript
if (dbUrl.startsWith("sqlite://")) return new SqliteScanner();
```

---

**N3 — Génération de migrations TypeORM**

Générer les fichiers de migration à partir des changements détectés :

```bash
parasite migrate --from-db postgres://...
```

---

**N4 — Commande `parasite add <EntityName>`**

Ajouter une entité interactivement sans DB existante :

```bash
parasite add Product
# → Nom ? Product
# → Colonnes ? name:string, price:number, stock:number
# → Relations ? category:ManyToOne
```

---

**N5 — Templates personnalisables**

Le champ `templatesDir` est déjà présent dans `parasite.conf.json` et dans
`config-loader.ts` mais n'est jamais lu dans `crud-generator.ts`.
Il suffit de brancher la config sur le chemin de résolution des templates.

```typescript
// crud-generator.ts
const templatesDir = config.templatesDir ?? path.join(__dirname, "../../templates/crud");
const templatePath = path.resolve(templatesDir, `${templateName}.hbs`);
```

---

**N6 — Support MongoDB / Mongoose**

Ajouter un scanner MongoDB et des templates Mongoose (schémas, documents).

---

**N7 — Logging structuré**

Remplacer les `console.log` dispersés par un système avec niveaux de verbosité :

```bash
parasite generate --verbose   # Détails complets
parasite generate             # Résumé
parasite generate --quiet     # Erreurs seulement
```

---

**N8 — Tests d'intégration end-to-end**

Générer un projet NestJS minimal en mémoire et vérifier que le code produit compile
(`tsc --noEmit`).

---

**N9 — Tests unitaires manquants**

| Fichier | Couverture actuelle | Priorité |
|---------|---------------------|----------|
| `postgres-scanner.ts` | 0% | Haute |
| `entity-scanner.ts` | 0% | Haute |
| `crud-generator.ts` | 0% | Moyenne |
| `app-module-updater.ts` | 0% | Moyenne |
| `intelligent-generator.ts` | 0% | Moyenne |
| `generate-from-db.ts` | 0% | Basse |

---

**N10 — Validation du schéma de `parasite.conf.json`**

```typescript
// Exemple avec zod (à ajouter en dépendance)
const ConfigSchema = z.object({
  projectRoot: z.string().optional(),
  templatesDir: z.string().optional(),
  namingConvention: z.enum(["camelCase", "snake_case"]).optional(),
  overwriteExisting: z.boolean().optional(),
  db: z.object({
    type: z.enum(["postgres", "mysql", "sqlite"]),
    host: z.string(),
    port: z.number().int().positive(),
    username: z.string(),
    password: z.string(),
    database: z.string(),
  }).optional(),
});
```

---

## 5. Résumé priorisé

### Corriger immédiatement (bugs bloquants)

| Ref | Fichier | Action |
|-----|---------|--------|
| B1 | `generate-from-db.ts` | Appeler `addModuleToAppModule()` après chaque génération |
| B2 | `service.hbs` | Remplacer `findBy()` par `find({ where: ... })` |
| B3 | `mysql-scanner.ts`, `postgres-scanner.ts` | Remplacer l'extracteur de singulier naïf |
| B4 | `entity.hbs` | Ajouter un mapping TypeScript → type SQL |
| B5 | `crud-generator.ts` | Résoudre le chemin des templates avec `__dirname` |

### Améliorer en priorité (valeur utilisateur directe)

| Ref | Action |
|-----|--------|
| A1 | Ajouter `class-validator` dans les DTOs générés |
| A2 | Pagination dans `findAll()` |
| A4 | Remplacer `@nestjs/cli` global par `npx` |
| A5 | Mapping TypeScript → SQL dans `entity.hbs` |
| N5 | Brancher `templatesDir` dans `crud-generator.ts` |

### Planifier (nouvelles fonctionnalités)

| Ref | Action |
|-----|--------|
| N2 | Scanner SQLite |
| N7 | Logging structuré |
| N9 | Tests pour `postgres-scanner`, `entity-scanner`, `crud-generator` |
| N1 | Commande `parasite diff` |
| A7 | Décorateurs Swagger/OpenAPI |

---

## 6. Points forts à conserver

- **Architecture modulaire** : séparation claire analyse / génération via `ParsedEntity`
- **Manipulation AST avec `ts-morph`** dans `app-module-updater.ts` — approche robuste, à étendre
- **Détection des relations complexes** : algorithme 3 passes dans les scanners (ManyToOne, OneToMany, OneToOne, ManyToMany)
- **Génération incrémentale** dans `intelligent-generator.ts` : ne réécrit que les fichiers manquants
- **Tests solides** sur le scanner MySQL (22 tests, tous passants)
- **Build TypeScript propre** sans erreurs
