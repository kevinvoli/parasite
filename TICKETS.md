# Tickets d'Implémentation — `parasite-cli`

> Basé sur `PLAN_IMPLEMENTATION.md` — 2026-03-02
> 34 tickets répartis en 6 phases

---

## Légende

| Champ | Valeurs possibles |
|-------|-------------------|
| **Type** | `bug` · `feature` · `test` · `refactor` · `chore` |
| **Priorité** | `🔴 critique` · `🟡 haute` · `🟠 moyenne` · `🟢 basse` |
| **Taille** | `XS` (< 1h) · `S` (1–2h) · `M` (2–4h) · `L` (4–8h) · `XL` (> 1 jour) |
| **Statut** | `⬜ à faire` · `🔄 en cours` · `✅ fait` |

---

## Vue d'ensemble

```
PHASE 1 — Bugs bloquants        : TICKET-001 → TICKET-005
PHASE 2 — Bugs majeurs/mineurs  : TICKET-006 → TICKET-012
PHASE 3 — Robustesse            : TICKET-013 → TICKET-016
PHASE 4 — Expérience développeur: TICKET-017 → TICKET-027
PHASE 5 — Nouvelles fonctions   : TICKET-028 → TICKET-032
PHASE 6 — Fonctions avancées    : TICKET-033 → TICKET-034 (+N6 hors scope)
```

---

## PHASE 1 — Bugs bloquants 🔴

---

### TICKET-001
**Titre** : Résoudre le chemin des templates avec `__dirname` pour usage CLI global
**Type** : `bug`
**Priorité** : 🔴 critique
**Taille** : S
**Statut** : ⬜ à faire
**Réf. plan** : P1.1 / B5
**Dépend de** : —
**Bloque** : TICKET-023 (templates personnalisables)

**Contexte**
`path.resolve("src/templates/crud", ...)` est relatif au répertoire courant de l'utilisateur.
Dès que la CLI est installée globalement (`npm install -g`), les templates sont introuvables.

**Fichiers impactés**
- `src/core/crud-generator.ts`

**À faire**
1. Importer `fileURLToPath` et `dirname` depuis les modules Node natifs
2. Calculer `__dirname` depuis `import.meta.url`
3. Construire le chemin des templates depuis ce `__dirname` (`../../src/templates/crud`)
4. Ajouter une vérification d'existence du fichier template avec message d'erreur explicite

**Critères d'acceptance**
- [ ] `npm install -g .` puis `parasite generate -p ./mon-projet` fonctionne sans erreur `ENOENT`
- [ ] Si un template est manquant, l'erreur indique le chemin complet du fichier introuvable
- [ ] Les tests existants continuent de passer

---

### TICKET-002
**Titre** : Appeler `addModuleToAppModule()` dans le flux `parasite db`
**Type** : `bug`
**Priorité** : 🔴 critique
**Taille** : S
**Statut** : ⬜ à faire
**Réf. plan** : P1.2 / B1
**Dépend de** : —
**Bloque** : —

**Contexte**
Après `parasite db`, les modules générés ne sont jamais importés dans `app.module.ts`.
L'utilisateur doit ajouter chaque import manuellement — la promesse d'automatisation n'est pas tenue.

**Fichiers impactés**
- `src/core/generate-from-db.ts`

**À faire**
1. Importer `addModuleToAppModule` depuis `../utils/app-module-updater.js`
2. Dans la boucle de génération, après chaque `generateCrudResources()`, vérifier si `app.module.ts` existe
3. Si oui : appeler `addModuleToAppModule()` avec le bon chemin de module
4. Si non : afficher un avertissement indiquant le module à importer manuellement

**Critères d'acceptance**
- [ ] Après `parasite db --db-url postgres://...`, `app.module.ts` contient l'import de chaque `*Module` généré
- [ ] Si `app.module.ts` est absent, un warning clair est affiché (pas d'erreur fatale)
- [ ] Pas de doublon si le module était déjà importé (comportement existant de `app-module-updater`)

---

### TICKET-003
**Titre** : Corriger `findBy()` → `find({ where: ... })` dans `service.hbs`
**Type** : `bug`
**Priorité** : 🔴 critique
**Taille** : XS
**Statut** : ⬜ à faire
**Réf. plan** : P1.3 / B2
**Dépend de** : —
**Bloque** : TICKET-015 (transactions)

**Contexte**
`findBy({ id: In([1,2,3]) })` ne fonctionne pas avec les opérateurs TypeORM (`In`, `Not`, `Like`, etc.).
TypeORM exige `find({ where: { id: In([1,2,3]) } })` pour les opérateurs.
Le code généré est donc dysfonctionnel pour toutes les relations de type OneToMany et ManyToMany.

**Fichiers impactés**
- `src/templates/crud/service.hbs`

**À faire**
1. Dans la méthode `create()` : remplacer `findBy(...)` par `find({ where: ... })`
2. Dans la méthode `update()` : même correction (deux occurrences)

```handlebars
{{! AVANT }}
await this.{{relationFieldName}}Repository.findBy({ id: In({{relationFieldName}}Ids) });

{{! APRÈS }}
await this.{{relationFieldName}}Repository.find({ where: { id: In({{relationFieldName}}Ids) } });
```

**Critères d'acceptance**
- [ ] Le service généré pour une entité avec relations OneToMany ou ManyToMany compile sans erreur
- [ ] `create()` et `update()` fonctionnent correctement avec des tableaux d'IDs
- [ ] Les tests existants passent toujours

---

### TICKET-004
**Titre** : Implémenter `toSingular()` robuste pour le nommage des relations
**Type** : `bug`
**Priorité** : 🔴 critique
**Taille** : S
**Statut** : ⬜ à faire
**Réf. plan** : P1.4 / B3
**Dépend de** : —
**Bloque** : TICKET-016 (tests toSingular)

**Contexte**
`.replace(/s$/, "")` casse des mots courants : `status → statu`, `process → proces`, `address → addres`.
Le nom de champ de relation généré est alors invalide en TypeScript.

**Fichiers impactés**
- `src/utils/string-formatters.ts` (ajout)
- `src/core/mysql-scanner.ts` (consommation)
- `src/core/postgres-scanner.ts` (consommation)

**À faire**
1. Ajouter et exporter `toSingular(word: string): string` dans `string-formatters.ts`
   - Gérer les irréguliers (people→person, children→child, men→man…)
   - Gérer les terminaisons : `-ies`→`-y`, `-ses/-xes/-zes/-ches/-shes`→supprimer `-es`
   - Préserver les mots invariants : `status`, `process`, `news`, `series`
2. Remplacer `.replace(/s$/, "")` par `toSingular()` dans les deux scanners

**Critères d'acceptance**
- [ ] `toSingular("users")` → `"user"`
- [ ] `toSingular("categories")` → `"category"`
- [ ] `toSingular("addresses")` → `"address"`
- [ ] `toSingular("status")` → `"status"` (inchangé)
- [ ] `toSingular("process")` → `"process"` (inchangé)
- [ ] Tests unitaires écrits et passants

---

### TICKET-005
**Titre** : Corriger le mapping TypeScript → type SQL dans `entity.hbs`
**Type** : `bug`
**Priorité** : 🔴 critique
**Taille** : S
**Statut** : ⬜ à faire
**Réf. plan** : P1.5 / B4
**Dépend de** : —
**Bloque** : —

**Contexte**
`@Column({ type: "number" })` est rejeté par TypeORM au démarrage.
TypeORM attend le type SQL (`"int"`, `"varchar"`, `"boolean"`, `"timestamp"`).

**Fichiers impactés**
- `src/core/crud-generator.ts`
- `src/templates/crud/entity.hbs`

**À faire**
1. Dans `crud-generator.ts`, définir une map `TS_TO_SQL`:
   ```typescript
   const TS_TO_SQL: Record<string, string> = {
     number: "int", string: "varchar",
     boolean: "boolean", Date: "timestamp", any: "text"
   };
   ```
2. Dans la construction du contexte, injecter `sqlType` sur chaque propriété :
   ```typescript
   properties: entity.properties.map(p => ({ ...p, sqlType: TS_TO_SQL[p.type] ?? "text" }))
   ```
3. Dans `entity.hbs`, remplacer `{{lowercase type}}` par `{{sqlType}}`

**Critères d'acceptance**
- [ ] L'entité générée contient `@Column({ type: "int" })` pour un champ `number`
- [ ] L'entité générée contient `@Column({ type: "varchar" })` pour un champ `string`
- [ ] NestJS démarre sans erreur TypeORM sur les entités générées

---

## PHASE 2 — Bugs majeurs et mineurs 🟡

---

### TICKET-006
**Titre** : Détecter `isOwningRelation` dans `entity-scanner.ts` via décorateurs AST
**Type** : `bug`
**Priorité** : 🟡 haute
**Taille** : M
**Statut** : ⬜ à faire
**Réf. plan** : P2.1 / B6
**Dépend de** : —
**Bloque** : TICKET-020 (tests entity-scanner)

**Contexte**
Le scanner d'entités existantes ne lit pas `@JoinColumn` ni `@JoinTable`.
Résultat : les entités OneToOne et ManyToMany générées n'ont jamais les bons décorateurs
(`@JoinColumn` ou `@JoinTable` manquants).

**Fichiers impactés**
- `src/core/entity-scanner.ts`

**À faire**
1. Pour chaque propriété de type relation, lire la liste des noms de décorateurs via `ts-morph` :
   ```typescript
   const decorators = prop.getDecorators().map(d => d.getName());
   ```
2. Déduire `isOwningRelation` selon le type de relation :
   - `ManyToOne` → toujours `true`
   - `OneToMany` → toujours `undefined` (côté inverse)
   - `OneToOne` → `true` si `decorators.includes("JoinColumn")`
   - `ManyToMany` → `true` si `decorators.includes("JoinTable")`
3. Inclure `isOwningRelation` dans la propriété poussée dans le tableau `properties`

**Critères d'acceptance**
- [ ] `parasite generate` sur un projet contenant un OneToOne génère `@JoinColumn` du bon côté
- [ ] `parasite generate` sur un projet contenant un ManyToMany génère `@JoinTable` du bon côté
- [ ] Les propriétés ManyToOne ont `isOwningRelation: true`

---

### TICKET-007
**Titre** : Corriger les imports des entités relationnelles dans `module.hbs`
**Type** : `bug`
**Priorité** : 🟡 haute
**Taille** : M
**Statut** : ⬜ à faire
**Réf. plan** : P2.2 / B7
**Dépend de** : —
**Bloque** : TICKET-013 (class-validator nécessite le contexte de relation correct)

**Contexte**
`{{Capitalise this}}` utilise le nom du champ (`author`) et non le nom de l'entité (`User`).
L'import généré `'../author/entities/author.entity'` est incorrect si l'entité est dans `user/`.

**Fichiers impactés**
- `src/core/crud-generator.ts`
- `src/core/generate-from-db.ts`
- `src/core/intelligent-generator.ts`
- `src/templates/crud/module.hbs`
- `src/templates/crud/service.hbs` (références aux relations dans `findAll`, `findOne`)

**À faire**
1. Dans `crud-generator.ts`, changer le type de `relations` de `string[]` à objet :
   ```typescript
   relations: entity.properties
     .filter(p => p.isRelation && p.relatedEntity)
     .map(p => ({
       fieldName:  p.relationFieldName ?? p.name,
       entityName: p.relatedEntity!,
       entityFile: kebabCase(p.relatedEntity!),
     })),
   ```
2. Mettre à jour `generate-from-db.ts` et `intelligent-generator.ts` qui construisent aussi `relations`
3. Dans `module.hbs`, utiliser `{{entityName}}` et `{{entityFile}}` :
   ```handlebars
   {{#each relations}}
   import { {{entityName}} } from '../{{entityFile}}/entities/{{entityFile}}.entity';
   {{/each}}
   ```
4. Dans `service.hbs`, adapter les références à `relations` pour utiliser `fieldName`

**Critères d'acceptance**
- [ ] Module généré pour `Post` avec relation `author: User` importe `User` depuis `'../user/entities/user.entity'`
- [ ] `TypeOrmModule.forFeature([Post, User])` contient le bon nom de classe
- [ ] Les tests existants passent

---

### TICKET-008
**Titre** : Rendre la détection des colonnes de date flexible (pas seulement `created_at`)
**Type** : `bug`
**Priorité** : 🟡 haute
**Taille** : M
**Statut** : ⬜ à faire
**Réf. plan** : P2.3 / B8
**Dépend de** : —
**Bloque** : —

**Contexte**
La détection est câblée sur `created_at`, `updated_at`, `deleted_at` (exact).
`createdAt`, `date_creation`, `modified_at`, `archived_at` sont tous traités comme `@Column({ type: "timestamp" })`.

**Fichiers impactés**
- `src/types.d.ts`
- `src/core/mysql-scanner.ts`
- `src/core/postgres-scanner.ts`
- `src/core/entity-scanner.ts`
- `src/templates/crud/entity.hbs`

**À faire**
1. Ajouter `dateRole?: "created" | "updated" | "deleted" | "plain"` dans `EntityProperty`
2. Créer une fonction `inferDateRole(columnName: string)` dans `string-formatters.ts` :
   - `creat` dans le nom → `"created"`
   - `updat` ou `modif` dans le nom → `"updated"`
   - `delet` ou `remov` ou `archiv` dans le nom → `"deleted"`
   - sinon → `"plain"`
3. Appeler cette fonction dans les deux scanners + entity-scanner pour chaque colonne `Date`
4. Dans `entity.hbs`, remplacer les `eq name "created_at"` par `eq dateRole "created"` etc.

**Critères d'acceptance**
- [ ] `createdAt` → `@CreateDateColumn`
- [ ] `date_creation` → `@CreateDateColumn`
- [ ] `modified_at` → `@UpdateDateColumn`
- [ ] `archived_at` → `@DeleteDateColumn`
- [ ] Colonne date sans nom reconnu → `@Column({ type: "timestamp" })`

---

### TICKET-009
**Titre** : Renommer `reccurcive.ts` → `recursive.ts` et corriger les formatters
**Type** : `chore`
**Priorité** : 🟠 moyenne
**Taille** : XS
**Statut** : ⬜ à faire
**Réf. plan** : P2.4 / B9, B10, B11
**Dépend de** : —
**Bloque** : TICKET-025 (logger utilise kebabCase)

**Contexte**
- Faute de frappe dans le nom du fichier
- `kebabCase("my_Entity")` produit `"my_-entity"` (incorrect)
- `camelCase("my__test")` produit `"my_test"` (underscore perdu)

**Fichiers impactés**
- `src/utils/reccurcive.ts` → `src/utils/recursive.ts`
- `src/core/entity-scanner.ts` (mise à jour de l'import)
- `src/utils/string-formatters.ts`
- `src/utils/string-formatters.test.ts`

**À faire**
1. Renommer le fichier ; mettre à jour l'import dans `entity-scanner.ts`
2. Réécrire `kebabCase` :
   ```typescript
   export function kebabCase(str: string): string {
     return str
       .replace(/_/g, "-")
       .replace(/([a-z])([A-Z])/g, "$1-$2")
       .replace(/([A-Z]+)([A-Z][a-z])/g, "$1-$2")
       .replace(/-+/g, "-")
       .toLowerCase();
   }
   ```
3. Réécrire `camelCase` :
   ```typescript
   export function camelCase(str: string): string {
     return str
       .replace(/_+([a-zA-Z])/g, (_, l) => l.toUpperCase())
       .replace(/^[A-Z]/, c => c.toLowerCase());
   }
   ```
4. Mettre à jour les tests existants + ajouter les cas `my_Entity` et `my__test`

**Critères d'acceptance**
- [ ] `kebabCase("my_Entity")` → `"my-entity"`
- [ ] `kebabCase("UserProfile")` → `"user-profile"`
- [ ] `camelCase("my__test")` → `"myTest"`
- [ ] `camelCase("user_name")` → `"userName"`
- [ ] Build propre, tests passants

---

### TICKET-010
**Titre** : Nettoyer `handlebars-helpers.ts` (doublon `ne`, unifier `kebabCase`)
**Type** : `refactor`
**Priorité** : 🟠 moyenne
**Taille** : XS
**Statut** : ⬜ à faire
**Réf. plan** : P2.4 / B13, B14
**Dépend de** : TICKET-009 (kebabCase corrigé)
**Bloque** : TICKET-025 (logger)

**Fichiers impactés**
- `src/handlebars/handlebars-helpers.ts`

**À faire**
1. Supprimer le helper `ne` (doublon de `neq`)
2. Remplacer l'implémentation inline de `kebabCase` par l'import depuis `string-formatters.ts`
3. Ajouter un helper `uppercase` pour les colonnes enum (TICKET-027)

**Critères d'acceptance**
- [ ] Un seul helper pour "non-égalité" : `neq`
- [ ] `kebabCase` helper utilise la même implémentation que `string-formatters.ts`
- [ ] Aucune régression dans les templates générés

---

### TICKET-011
**Titre** : Afficher un warning lisible si `parasite.conf.json` est invalide
**Type** : `bug`
**Priorité** : 🟠 moyenne
**Taille** : XS
**Statut** : ⬜ à faire
**Réf. plan** : P2.4 / B15
**Dépend de** : —
**Bloque** : TICKET-021 (validation Zod complète)

**Contexte**
Une erreur JSON dans `parasite.conf.json` est silencieusement avalée.
L'utilisateur ne sait pas que sa configuration est ignorée.

**Fichiers impactés**
- `src/utils/config-loader.ts`

**À faire**
```typescript
} catch (err) {
  // AVANT : return {};
  // APRÈS :
  const msg = err instanceof SyntaxError ? err.message : String(err);
  console.warn(chalk.yellow(`⚠ parasite.conf.json illisible : ${msg}`));
  console.warn(chalk.yellow("  → Configuration par défaut utilisée."));
  return {};
}
```

**Critères d'acceptance**
- [ ] Un JSON malformé affiche un warning précis avec le message d'erreur de parsing
- [ ] L'outil continue de fonctionner avec la configuration par défaut
- [ ] Aucune exception non gérée n'est levée

---

### TICKET-012
**Titre** : Corriger les typos mineures dans le code source
**Type** : `chore`
**Priorité** : 🟠 moyenne
**Taille** : XS
**Statut** : ⬜ à faire
**Réf. plan** : P2.4 / B12, B16
**Dépend de** : —
**Bloque** : —

**Fichiers impactés**
- `src/cli/index.ts`
- `src/core/intelligent-generator.ts`

**À faire**
1. `cli/index.ts` : remplacer `"Entitiés Détectées"` par `"Entités Détectées"`
2. `intelligent-generator.ts` : renommer la variable `entitys` → `entity` (ligne 25) et mettre à jour `expectedPaths.entitys` → `expectedPaths.entity`

**Critères d'acceptance**
- [ ] Plus aucune faute d'orthographe dans les logs utilisateur
- [ ] Build propre, tests passants

---

## PHASE 3 — Robustesse du code généré 🟡

---

### TICKET-013
**Titre** : Ajouter les décorateurs `class-validator` dans les DTOs générés
**Type** : `feature`
**Priorité** : 🟡 haute
**Taille** : M
**Statut** : ⬜ à faire
**Réf. plan** : P3.1 / A1
**Dépend de** : TICKET-007 (contexte relations corrigé)
**Bloque** : —

**Contexte**
Les DTOs générés n'ont aucune validation. Sans `ValidationPipe`, n'importe quelle valeur est acceptée.

**Fichiers impactés**
- `src/core/crud-generator.ts`
- `src/templates/crud/create-dto.hbs`

**À faire**
1. Dans `crud-generator.ts`, définir `TYPE_VALIDATORS` :
   ```typescript
   const TYPE_VALIDATORS: Record<string, string[]> = {
     string: ["@IsString()"], number: ["@IsNumber()"],
     boolean: ["@IsBoolean()"], Date: ["@IsDateString()"], any: [],
   };
   ```
2. Injecter `validators` et `hasValidators` sur chaque propriété du contexte
3. Dans `create-dto.hbs` :
   - Ajouter l'import `class-validator` en tête de fichier
   - Insérer `@IsOptional()` si `isOptional` est vrai
   - Insérer les décorateurs depuis `{{#each validators}}`
4. Pour les relations (IDs) : ajouter `@IsInt()` / `@IsArray()` + `@IsInt({ each: true })`

**Critères d'acceptance**
- [ ] `CreateUserDto` avec `name: string` génère `@IsString() name: string`
- [ ] Champ optionnel génère `@IsOptional()` avant les autres décorateurs
- [ ] Relation ManyToOne génère `@IsInt() @IsOptional() userId?: number`
- [ ] Relation OneToMany génère `@IsArray() @IsInt({ each: true }) @IsOptional() postIds?: number[]`
- [ ] Le DTO compilé sans import manquant

---

### TICKET-014
**Titre** : Implémenter la pagination dans `findAll()` et le controller
**Type** : `feature`
**Priorité** : 🟡 haute
**Taille** : M
**Statut** : ⬜ à faire
**Réf. plan** : P3.2 / A2
**Dépend de** : TICKET-013 (class-validator disponible)
**Bloque** : —

**Fichiers impactés**
- `src/templates/crud/service.hbs`
- `src/templates/crud/controller.hbs`
- Nouveau fichier : `src/templates/crud/pagination.dto.hbs`

**À faire**
1. Créer `pagination.dto.hbs` avec `PaginationDto` (page, limit avec validateurs)
2. Dans `service.hbs`, modifier `findAll()` pour accepter `pagination` et utiliser `findAndCount()` :
   ```typescript
   async findAll(pagination?: { page?: number; limit?: number }): Promise<[{{entityName}}[], number]>
   ```
3. Dans `controller.hbs`, passer `@Query() pagination: PaginationDto` à `findAll()`
4. Dans `crud-generator.ts`, ajouter `"pagination-dto"` dans la liste des fichiers générés

**Critères d'acceptance**
- [ ] `GET /users` retourne `[users[], total]`
- [ ] `GET /users?page=2&limit=5` retourne les éléments 6 à 10
- [ ] `limit` ne peut pas dépasser 100 (validation)
- [ ] Sans paramètres, page=1 et limit=20 par défaut

---

### TICKET-015
**Titre** : Envelopper `create()` et `update()` dans des transactions TypeORM
**Type** : `feature`
**Priorité** : 🟡 haute
**Taille** : L
**Statut** : ⬜ à faire
**Réf. plan** : P3.3 / A3
**Dépend de** : TICKET-003 (findBy corrigé), TICKET-007 (contexte relations correct)
**Bloque** : —

**Fichiers impactés**
- `src/templates/crud/service.hbs`

**À faire**
1. Ajouter `DataSource` dans l'import et le constructeur du service généré (uniquement si `hasRelations`)
2. Envelopper le corps de `create()` dans `this.dataSource.transaction(async (manager) => { ... })` quand `hasRelations`
3. Même chose pour `update()`
4. Utiliser `manager.create()`, `manager.save()`, `manager.findOne()` à l'intérieur des transactions

**Critères d'acceptance**
- [ ] Si la résolution d'une relation échoue (ID inexistant), aucune donnée n'est persistée
- [ ] Service sans relations n'importe pas `DataSource` (pas d'injection inutile)
- [ ] Le code généré compile sans erreur TypeScript

---

### TICKET-016
**Titre** : Écrire les tests unitaires complets pour `toSingular()` et les formatters
**Type** : `test`
**Priorité** : 🟡 haute
**Taille** : S
**Statut** : ⬜ à faire
**Réf. plan** : P3.4 / A6
**Dépend de** : TICKET-004 (toSingular implémenté), TICKET-009 (formatters corrigés)
**Bloque** : —

**Fichiers impactés**
- `src/utils/string-formatters.test.ts`

**À faire**
Ajouter les suites de tests suivantes :
```
describe("toSingular")
  → "users" → "user"
  → "categories" → "category"
  → "addresses" → "address"
  → "status" → "status" (invariant)
  → "process" → "process" (invariant)
  → "news" → "news" (invariant)
  → "people" → "person" (irrégulier)
  → "children" → "child" (irrégulier)

describe("kebabCase") — cas supplémentaires
  → "my_Entity" → "my-entity"
  → "MyHTTPRequest" → "my-http-request"
  → "already-kebab" → "already-kebab"

describe("camelCase") — cas supplémentaires
  → "my__test" → "myTest"
  → "MY_CONSTANT" → "myCONSTANT"
```

**Critères d'acceptance**
- [ ] Tous les tests passent
- [ ] Coverage de `string-formatters.ts` > 90%

---

## PHASE 4 — Expérience développeur 🟠

---

### TICKET-017
**Titre** : Remplacer `@nestjs/cli` global par `npx` dans la création de projet
**Type** : `feature`
**Priorité** : 🟠 moyenne
**Taille** : XS
**Statut** : ⬜ à faire
**Réf. plan** : P4.1 / A4
**Dépend de** : —
**Bloque** : —

**Fichiers impactés**
- `src/core/generate-from-db.ts`

**À faire**
1. Supprimer la fonction `isNestInstalled()` et sa vérification
2. Remplacer `execSync("nest new ...")` par `execSync("npx --yes @nestjs/cli new ... --package-manager npm")`
3. Supprimer le `process.exit(1)` conditionnel lié à `@nestjs/cli`

**Critères d'acceptance**
- [ ] `parasite db --db-url mysql://...` crée un projet NestJS sans `@nestjs/cli` préinstallé
- [ ] Marquer **Tâche 3.1** comme ✅ dans `JOURNAL_REFACTORING.md`

---

### TICKET-018
**Titre** : Ajouter les décorateurs Swagger/OpenAPI (option `swagger: true`)
**Type** : `feature`
**Priorité** : 🟠 moyenne
**Taille** : M
**Statut** : ⬜ à faire
**Réf. plan** : P4.2 / A7
**Dépend de** : TICKET-021 (Zod config — swagger dans le schéma)
**Bloque** : —

**Fichiers impactés**
- `src/templates/crud/controller.hbs`
- `src/core/crud-generator.ts` (passer `swagger` au contexte)

**À faire**
1. Lire `config.swagger` et le passer dans le contexte Handlebars
2. Dans `controller.hbs`, conditionner les imports et décorateurs sur `{{#if swagger}}` :
   - `@ApiTags('{{route}}')` sur la classe
   - `@ApiOperation({ summary: '...' })` sur chaque route
   - `@ApiResponse({ status: 201/200/404 })` sur chaque route
   - `@ApiParam({ name: 'id', type: Number })` sur les routes `:id`

**Critères d'acceptance**
- [ ] `swagger: false` (défaut) → controller sans décorateurs Swagger
- [ ] `swagger: true` → controller avec `@ApiTags`, `@ApiOperation`, `@ApiResponse`
- [ ] Le controller compilé sans `@nestjs/swagger` installé si `swagger: false`

---

### TICKET-019
**Titre** : Résoudre les variables d'environnement dans `parasite.conf.json`
**Type** : `feature`
**Priorité** : 🟠 moyenne
**Taille** : S
**Statut** : ⬜ à faire
**Réf. plan** : P4.3 / A8
**Dépend de** : TICKET-011 (config-loader amélioré)
**Bloque** : —

**Fichiers impactés**
- `src/utils/config-loader.ts`

**À faire**
1. Créer `resolveEnvVars(obj: any): any` — récursif sur objets/tableaux/strings
2. Pour les strings : remplacer `${VAR}` par `process.env.VAR` (garder la valeur brute si non définie)
3. Appliquer après le parsing JSON

**Critères d'acceptance**
- [ ] `"host": "${DB_HOST}"` avec `DB_HOST=prod.server.com` → `host: "prod.server.com"`
- [ ] Variable non définie → la valeur `"${DB_HOST}"` est conservée telle quelle (pas `undefined`)
- [ ] `DB_HOST=myserver parasite db` utilise le bon host

---

### TICKET-020
**Titre** : Écrire les tests unitaires pour `entity-scanner.ts`
**Type** : `test`
**Priorité** : 🟠 moyenne
**Taille** : L
**Statut** : ⬜ à faire
**Réf. plan** : P5.2 / N9
**Dépend de** : TICKET-006 (isOwningRelation dans scanner)
**Bloque** : —

**Fichiers impactés**
- Nouveau fichier : `src/core/entity-scanner.test.ts`

**Suites de tests à écrire**
1. Entité simple (PrimaryGeneratedColumn + Column)
2. Colonnes optionnelles
3. Relation ManyToOne (avec `isOwningRelation: true`)
4. Relation OneToMany (inverse, sans `isOwningRelation`)
5. Relation OneToOne côté propriétaire (avec `@JoinColumn`, `isOwningRelation: true`)
6. Relation OneToOne côté inverse (sans `@JoinColumn`, `isOwningRelation: false`)
7. Relation ManyToMany côté propriétaire (`@JoinTable`)
8. Entité sans décorateur `@Entity` → non détectée

**Approche** : Utiliser `ts-morph` avec `useInMemoryFileSystem: true` pour créer des fixtures

**Critères d'acceptance**
- [ ] 8+ tests écrits et passants
- [ ] Coverage de `entity-scanner.ts` > 80%

---

### TICKET-021
**Titre** : Valider `parasite.conf.json` avec Zod au chargement
**Type** : `feature`
**Priorité** : 🟠 moyenne
**Taille** : M
**Statut** : ⬜ à faire
**Réf. plan** : P4.10 / N10
**Dépend de** : TICKET-011 (warning config amélioré)
**Bloque** : TICKET-018 (swagger dans config), TICKET-019 (env vars)

**Fichiers impactés**
- `src/utils/config-loader.ts`
- `package.json` (ajout de `zod`)

**À faire**
1. `npm install zod`
2. Définir `DbConfigSchema` et `ParasiteConfigSchema` avec Zod
3. Utiliser `safeParse()` — afficher chaque issue en warning
4. Exporter le type `ParasiteConfig` depuis le schéma Zod (`z.infer<typeof ParasiteConfigSchema>`)

**Critères d'acceptance**
- [ ] Config valide → aucun warning
- [ ] `"port": "5432"` (string au lieu de number) → warning `"db.port: Expected number, received string"`
- [ ] `"type": "oracle"` → warning `"db.type: Invalid enum value"`
- [ ] L'outil continue de fonctionner malgré les warnings

---

### TICKET-022
**Titre** : Détecter et générer correctement les colonnes `uuid`
**Type** : `feature`
**Priorité** : 🟠 moyenne
**Taille** : S
**Statut** : ⬜ à faire
**Réf. plan** : P4.4 / A9
**Dépend de** : —
**Bloque** : —

**Fichiers impactés**
- `src/core/mysql-scanner.ts`
- `src/core/postgres-scanner.ts`
- `src/types.d.ts`
- `src/templates/crud/entity.hbs`

**À faire**
1. Ajouter `isUuid?: boolean` dans `EntityProperty`
2. Dans mysql-scanner : détecter `char(36)` comme UUID
3. Dans postgres-scanner : détecter `udt_name === "uuid"` comme UUID
4. Dans `entity.hbs` :
   - PK uuid → `@PrimaryGeneratedColumn("uuid")`
   - Colonne uuid non-PK → `@Column({ type: "uuid" })` + `@Generated("uuid")` si applicable

**Critères d'acceptance**
- [ ] PK de type UUID → `@PrimaryGeneratedColumn("uuid") id: string`
- [ ] Colonne UUID non-PK → `@Column({ type: "uuid" }) token: string`
- [ ] Les colonnes UUID ne reçoivent pas `@Column({ type: "varchar" })`

---

### TICKET-023
**Titre** : Brancher `templatesDir` de la config dans `crud-generator.ts`
**Type** : `feature`
**Priorité** : 🟠 moyenne
**Taille** : S
**Statut** : ⬜ à faire
**Réf. plan** : P4.9 / N5
**Dépend de** : TICKET-001 (chemin __dirname résolu)
**Bloque** : —

**Contexte**
`templatesDir` est déjà présent dans `parasite.conf.json` et `config-loader.ts` mais jamais lu dans `crud-generator.ts`.

**Fichiers impactés**
- `src/core/crud-generator.ts`

**À faire**
1. Dans `compileTemplate()`, accepter un `customDir` optionnel
2. Créer `getTemplatesDir()` qui lit `config.templatesDir` et vérifie son existence
3. Si le répertoire custom n'existe pas : warning + fallback sur les templates par défaut
4. Passer le `templatesDir` résolu à `generateCrudResources()`

**Critères d'acceptance**
- [ ] `templatesDir: "./my-templates"` dans la config → les templates custom sont utilisés
- [ ] Si `templatesDir` pointe vers un dossier inexistant → warning + templates par défaut
- [ ] Template individuel manquant dans le dossier custom → erreur claire

---

### TICKET-024
**Titre** : Implémenter le mode `--dry-run` sur `generate` et `db`
**Type** : `feature`
**Priorité** : 🟠 moyenne
**Taille** : M
**Statut** : ⬜ à faire
**Réf. plan** : P4.5 / A11
**Dépend de** : —
**Bloque** : —

**Fichiers impactés**
- `src/cli/index.ts`
- `src/core/crud-generator.ts`
- `src/core/generate-from-db.ts`
- `src/core/intelligent-generator.ts`

**À faire**
1. Ajouter `--dry-run` aux commandes `generate` et `db` dans `cli/index.ts`
2. Propager le flag `dryRun: boolean` jusqu'à `generateCrudResources()`
3. En mode dry-run : afficher le chemin et un aperçu des 10 premières lignes au lieu d'écrire le fichier
4. En mode dry-run : ne pas modifier `app.module.ts`

**Critères d'acceptance**
- [ ] `parasite generate --dry-run` n'écrit aucun fichier
- [ ] La sortie affiche la liste des fichiers qui *seraient* créés
- [ ] `parasite db --db-url ... --dry-run` liste les entités détectées + fichiers à créer

---

### TICKET-025
**Titre** : Implémenter le logging structuré avec niveaux `--verbose` / `--quiet`
**Type** : `feature`
**Priorité** : 🟠 moyenne
**Taille** : M
**Statut** : ⬜ à faire
**Réf. plan** : P4.11 / N7
**Dépend de** : TICKET-009 (kebabCase), TICKET-010 (helpers nettoyés)
**Bloque** : —

**Fichiers impactés**
- Nouveau fichier : `src/utils/logger.ts`
- `src/cli/index.ts`
- Tous les fichiers contenant `console.log/warn/error`

**À faire**
1. Créer `src/utils/logger.ts` avec niveaux `debug | info | warn | error | silent`
2. Ajouter les méthodes `debug`, `info`, `success`, `warn`, `error` utilisant chalk
3. Dans `cli/index.ts`, ajouter `--verbose` et `--quiet` au programme principal via `.hook("preAction")`
4. Remplacer tous les `console.*` dans : `cli/index.ts`, `generate-from-db.ts`, `intelligent-generator.ts`, `crud-generator.ts`, `app-module-updater.ts`, `config-loader.ts`

**Critères d'acceptance**
- [ ] `parasite generate --quiet` : affiche seulement les erreurs
- [ ] `parasite generate` : affiche les ✅ / ⚠ habituels
- [ ] `parasite generate --verbose` : affiche aussi les détails (propriétés, relations détectées)
- [ ] `parasite db --verbose` : affiche les requêtes d'introspection exécutées

---

### TICKET-026
**Titre** : Ajouter le backup de fichiers avant écrasement (`overwriteExisting`)
**Type** : `feature`
**Priorité** : 🟠 moyenne
**Taille** : S
**Statut** : ⬜ à faire
**Réf. plan** : P4.7 / A13
**Dépend de** : —
**Bloque** : —

**Fichiers impactés**
- `src/core/crud-generator.ts`

**À faire**
1. Créer `writeFileWithBackup(path, content, overwrite)` — copie en `.bak` si le fichier existe et `overwrite: true`
2. Utiliser cette fonction à la place de `fs.writeFile()` dans la boucle de génération
3. Lire `config.overwriteExisting` pour activer le backup

**Critères d'acceptance**
- [ ] Avec `overwriteExisting: true`, un fichier existant est copié en `.bak` avant d'être réécrit
- [ ] Sans `overwriteExisting: true`, le backup n'est pas créé
- [ ] Le backup affiche un message `📦 Backup : <chemin>`

---

### TICKET-027
**Titre** : Détecter et générer les colonnes `ENUM` (MySQL et PostgreSQL)
**Type** : `feature`
**Priorité** : 🟠 moyenne
**Taille** : L
**Statut** : ⬜ à faire
**Réf. plan** : P4.8 / A14
**Dépend de** : TICKET-010 (helper `uppercase` dans handlebars)
**Bloque** : —

**Fichiers impactés**
- `src/types.d.ts`
- `src/core/mysql-scanner.ts`
- `src/core/postgres-scanner.ts`
- `src/templates/crud/entity.hbs`
- `src/templates/crud/create-dto.hbs`

**À faire**
1. Ajouter `enumValues?: string[]` et `isEnum?: boolean` dans `EntityProperty`
2. MySQL scanner : détecter `col.Type.startsWith("enum(")` et extraire les valeurs
3. PostgreSQL scanner : interroger `information_schema.columns.udt_name` pour les types `USER-DEFINED` + `pg_enum` pour les valeurs
4. Dans `entity.hbs` : générer `export enum XxxEnum { ... }` puis `@Column({ type: 'enum', enum: XxxEnum })`
5. Dans `create-dto.hbs` : utiliser `XxxEnum` comme type

**Critères d'acceptance**
- [ ] Colonne MySQL `ENUM('admin','user','guest')` → `export enum RoleEnum { ADMIN='admin', USER='user', GUEST='guest' }`
- [ ] `@Column({ type: 'enum', enum: RoleEnum })` dans l'entité
- [ ] Le DTO utilise `RoleEnum` comme type (pas `string`)

---

## PHASE 5 — Nouvelles fonctionnalités majeures 🟠

---

### TICKET-028
**Titre** : Écrire les tests unitaires pour `postgres-scanner.ts`
**Type** : `test`
**Priorité** : 🟠 moyenne
**Taille** : L
**Statut** : ⬜ à faire
**Réf. plan** : P5.1 / N9
**Dépend de** : —
**Bloque** : —

**Fichiers impactés**
- Nouveau fichier : `src/core/postgres-scanner.test.ts`
- Nouveau fichier : `src/__mocks__/pg/index.js`

**Mock à créer**
```javascript
// src/__mocks__/pg/index.js
export const mockQuery = jest.fn();
export const Client = jest.fn().mockImplementation(() => ({
  connect: jest.fn().mockResolvedValue(undefined),
  query: mockQuery,
  end: jest.fn().mockResolvedValue(undefined),
}));
export default { Client };
```

**Suites de tests**
1. `mapPostgresTypeToTS` — tous les types (integer, varchar, uuid, boolean, date…)
2. Base vide → erreur explicite
3. Table simple sans relations
4. Relation ManyToOne + inverse OneToMany
5. Relation OneToOne via FK UNIQUE
6. Relation ManyToMany via table de jonction
7. PK composite (2 colonnes primaires)
8. Colonne UUID

**Critères d'acceptance**
- [ ] 8+ tests écrits et passants
- [ ] Coverage `postgres-scanner.ts` > 80%
- [ ] Même pattern de mock que `mysql-scanner.test.ts`

---

### TICKET-029
**Titre** : Écrire les tests unitaires pour `crud-generator.ts`
**Type** : `test`
**Priorité** : 🟠 moyenne
**Taille** : L
**Statut** : ⬜ à faire
**Réf. plan** : P5.3 / N9
**Dépend de** : TICKET-001 (chemin templates), TICKET-005 (sqlType), TICKET-013 (validators)
**Bloque** : —

**Fichiers impactés**
- Nouveau fichier : `src/core/crud-generator.test.ts`

**Approche** : Intercepter `fs.writeFile` avec un mock en mémoire pour capturer le contenu généré sans écriture disque.

**Suites de tests**
1. Entité simple → vérifier que les 6 fichiers sont générés
2. Service sans relations → pas de `DataSource`, `create()` simple
3. Service avec ManyToOne → `InjectRepository`, `findOneBy`
4. Service avec OneToMany → `find({ where: { id: In(...) } })`
5. Entity avec colonnes Date → bons décorateurs (`@CreateDateColumn` etc.)
6. DTO avec validators → `@IsString()`, `@IsInt()`
7. Module → imports corrects des entités relationnelles
8. Filtre `filesToGenerate` → ne génère que les fichiers demandés

**Critères d'acceptance**
- [ ] 8+ tests écrits et passants
- [ ] Coverage `crud-generator.ts` > 75%

---

### TICKET-030
**Titre** : Implémenter le scanner SQLite
**Type** : `feature`
**Priorité** : 🟠 moyenne
**Taille** : L
**Statut** : ⬜ à faire
**Réf. plan** : P5.4 / N2
**Dépend de** : TICKET-004 (toSingular), TICKET-009 (formatters)
**Bloque** : —

**Contexte**
`sqlite3` est déjà dans les dépendances. Ajouter `better-sqlite3` pour les requêtes synchrones.

**Fichiers impactés**
- Nouveau fichier : `src/core/sqlite-scanner.ts`
- `src/core/generate-from-db.ts`
- `package.json`

**À faire**
1. `npm install better-sqlite3 @types/better-sqlite3`
2. Implémenter `SqliteScanner` avec 3 passes (colonnes, ManyToMany, inverses) en utilisant :
   - `PRAGMA table_info(table)` → colonnes + PKs
   - `PRAGMA foreign_key_list(table)` → FKs
   - Index UNIQUE → `PRAGMA index_list(table)` + `PRAGMA index_info(index)`
3. Mapper les types SQLite (`INTEGER`, `TEXT`, `REAL`, `BLOB`) vers TypeScript
4. Brancher dans `getDbScanner()` pour `sqlite://`

**Critères d'acceptance**
- [ ] `parasite db --db-url sqlite:///path/to/db.sqlite` génère le CRUD complet
- [ ] Relations ManyToOne, OneToMany, OneToOne détectées
- [ ] Jointure ManyToMany via table de jonction détectée
- [ ] Tests unitaires du scanner SQLite écrits

---

### TICKET-031
**Titre** : Implémenter le mode interactif pour `parasite db` avec `inquirer`
**Type** : `feature`
**Priorité** : 🟠 moyenne
**Taille** : M
**Statut** : ⬜ à faire
**Réf. plan** : P4.6 / A12
**Dépend de** : TICKET-017 (npx), TICKET-021 (Zod config)
**Bloque** : TICKET-032 (parasite add utilise le même pattern)

**Fichiers impactés**
- `src/cli/index.ts`

**À faire**
1. Dans la commande `db`, si `--db-url` est absent ET que la config ne contient pas de `db`, déclencher les prompts
2. Prompts : type (list), host, port (number), username, password (masked), database/path
3. Créer `buildUrlFromAnswers()` pour construire l'URL de connexion
4. Créer `buildUrlFromConfig()` pour construire depuis `config.db`

**Critères d'acceptance**
- [ ] `parasite db` sans argument → affiche les prompts interactifs
- [ ] `parasite db --db-url ...` → utilise directement l'URL, sans prompts
- [ ] `parasite db` avec `parasite.conf.json` complet → utilise la config, sans prompts

---

### TICKET-032
**Titre** : Implémenter la commande `parasite add <EntityName>`
**Type** : `feature`
**Priorité** : 🟠 moyenne
**Taille** : XL
**Statut** : ⬜ à faire
**Réf. plan** : P5.5 / N4
**Dépend de** : TICKET-031 (pattern inquirer), TICKET-013 (class-validator), TICKET-014 (pagination)
**Bloque** : —

**Fichiers impactés**
- Nouveau fichier : `src/core/interactive-generator.ts`
- `src/cli/index.ts`

**À faire**
1. Dans `cli/index.ts`, ajouter la commande `add <entityName>`
2. Dans `interactive-generator.ts`, implémenter `promptEntityProperties()` :
   - Boucle : demander nom de colonne + type + nullable, répéter jusqu'à "Terminer"
   - Demander si ajouter des colonnes de date (created_at, updated_at, deleted_at)
   - Demander si ajouter des relations (type, entité cible, nom du champ)
3. Implémenter `buildParsedEntity()` qui construit un `ParsedEntity` depuis les réponses
4. Appeler `generateMissingCrudElements()` + `addModuleToAppModule()`

**Critères d'acceptance**
- [ ] `parasite add Product` → prompts → génère les 6 fichiers CRUD pour `Product`
- [ ] Les colonnes saisies apparaissent dans l'entité et les DTOs générés
- [ ] `Product` est ajouté dans `app.module.ts`
- [ ] `parasite add Product --project ./mon-projet` génère dans le bon répertoire

---

## PHASE 6 — Fonctionnalités avancées 🟢

---

### TICKET-033
**Titre** : Implémenter la commande `parasite diff`
**Type** : `feature`
**Priorité** : 🟢 basse
**Taille** : XL
**Statut** : ⬜ à faire
**Réf. plan** : P5.6 / N1
**Dépend de** : TICKET-006 (entity-scanner isOwningRelation), TICKET-028, TICKET-020 (tests scanners)
**Bloque** : —

**Fichiers impactés**
- Nouveau fichier : `src/core/schema-differ.ts`
- `src/cli/index.ts`

**À faire**
1. Dans `cli/index.ts`, ajouter la commande `diff`
2. Dans `schema-differ.ts`, implémenter `computeDiff(dbEntities, projectEntities)` qui retourne `string[]`
3. Comparer :
   - Tables DB sans entité projet correspondante
   - Entités projet sans table DB correspondante
   - Colonnes DB absentes dans l'entité (nom + type)
   - Propriétés d'entité absentes en DB
   - Relations DB absentes dans l'entité
4. Formater la sortie avec couleurs (rouge = absent, jaune = différent, vert = synchronisé)

**Critères d'acceptance**
- [ ] `parasite diff --db-url postgres://...` liste les divergences
- [ ] Pas de divergences → `✅ Entités synchronisées avec la base de données.`
- [ ] Sortie lisible avec symboles ➕ (absent en entité) / ➖ (absent en DB) / ≠ (type différent)

---

### TICKET-034
**Titre** : Écrire les tests d'intégration end-to-end
**Type** : `test`
**Priorité** : 🟢 basse
**Taille** : XL
**Statut** : ⬜ à faire
**Réf. plan** : P6.1 / N8
**Dépend de** : Tous les tickets Phase 1–3
**Bloque** : —

**Fichiers impactés**
- Nouveau fichier : `src/__tests__/e2e/generate.test.ts`

**À faire**
1. Créer des helpers `setupMinimalNestProject(tmpDir)` et `cleanupTmpDir(tmpDir)`
2. Tester le flux `generate` : créer une fausse entité, lancer `generateMissingCrudElements()`, vérifier que `tsc --noEmit` passe
3. Tester le flux complet entity→service→module : vérifier que le module est bien dans `app.module.ts`
4. Tester une entité avec relation ManyToOne : vérifier que le service et le module importent les deux entités

**Critères d'acceptance**
- [ ] E2E pour entité simple → code généré compile
- [ ] E2E pour entité avec ManyToOne → code généré compile
- [ ] Les tests s'exécutent en < 30 secondes
- [ ] Le répertoire temporaire est nettoyé après chaque test (même en cas d'échec)

---

## Tableau de bord

| ID | Titre (court) | Type | Priorité | Taille | Statut | Dépend de |
|----|---------------|------|----------|--------|--------|-----------|
| 001 | Chemin templates __dirname | bug | 🔴 | S | ⬜ | — |
| 002 | app.module dans flux db | bug | 🔴 | S | ⬜ | — |
| 003 | findBy → find({ where }) | bug | 🔴 | XS | ⬜ | — |
| 004 | toSingular robuste | bug | 🔴 | S | ⬜ | — |
| 005 | Mapping TS→SQL entity.hbs | bug | 🔴 | S | ⬜ | — |
| 006 | isOwningRelation entity-scanner | bug | 🟡 | M | ⬜ | — |
| 007 | module.hbs imports corrects | bug | 🟡 | M | ⬜ | — |
| 008 | Colonnes date flexibles | bug | 🟡 | M | ⬜ | — |
| 009 | Renommage recursive + formatters | chore | 🟠 | XS | ⬜ | — |
| 010 | Nettoyer handlebars-helpers | refactor | 🟠 | XS | ⬜ | 009 |
| 011 | Warning config JSON invalide | bug | 🟠 | XS | ⬜ | — |
| 012 | Typos mineures | chore | 🟠 | XS | ⬜ | — |
| 013 | class-validator dans DTOs | feature | 🟡 | M | ⬜ | 007 |
| 014 | Pagination findAll | feature | 🟡 | M | ⬜ | 013 |
| 015 | Transactions create/update | feature | 🟡 | L | ⬜ | 003, 007 |
| 016 | Tests toSingular + formatters | test | 🟡 | S | ⬜ | 004, 009 |
| 017 | npx au lieu de @nestjs/cli | feature | 🟠 | XS | ⬜ | — |
| 018 | Décorateurs Swagger | feature | 🟠 | M | ⬜ | 021 |
| 019 | Env vars dans config | feature | 🟠 | S | ⬜ | 011 |
| 020 | Tests entity-scanner | test | 🟠 | L | ⬜ | 006 |
| 021 | Validation Zod config | feature | 🟠 | M | ⬜ | 011 |
| 022 | Colonnes UUID | feature | 🟠 | S | ⬜ | — |
| 023 | templatesDir dans config | feature | 🟠 | S | ⬜ | 001 |
| 024 | Mode --dry-run | feature | 🟠 | M | ⬜ | — |
| 025 | Logging structuré --verbose | feature | 🟠 | M | ⬜ | 009, 010 |
| 026 | Backup avant écrasement | feature | 🟠 | S | ⬜ | — |
| 027 | Support colonnes ENUM | feature | 🟠 | L | ⬜ | 010 |
| 028 | Tests postgres-scanner | test | 🟠 | L | ⬜ | — |
| 029 | Tests crud-generator | test | 🟠 | L | ⬜ | 001, 005, 013 |
| 030 | Scanner SQLite | feature | 🟠 | L | ⬜ | 004, 009 |
| 031 | Mode interactif parasite db | feature | 🟠 | M | ⬜ | 017, 021 |
| 032 | Commande parasite add | feature | 🟠 | XL | ⬜ | 031, 013, 014 |
| 033 | Commande parasite diff | feature | 🟢 | XL | ⬜ | 006, 028, 020 |
| 034 | Tests E2E | test | 🟢 | XL | ⬜ | 001–015 |
