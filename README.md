# 🐍 Parasite - Mini-Framework de Génération Automatique de CRUDs pour NestJS

## 📌 Contexte du projet

**Parasite** est un mini-framework en Node.js basé sur **NestJS**
permettant d'automatiser la génération de **CRUDs** complets, de
modules, de services, de contrôleurs et de schémas d'entités à partir :\
- d'une **base de données existante** (PostgreSQL, MySQL, MongoDB,
etc.),\
- d'un **projet NestJS existant**,\
- ou **des deux combinés**.

L'objectif est de gagner un maximum de temps pour les développeurs en
leur fournissant une **CLI intelligente** capable d'analyser la
structure d'un projet, la base de données, puis de générer
automatiquement les fichiers nécessaires.

------------------------------------------------------------------------

## 🎯 Objectifs principaux

-   Développer une CLI robuste : `parasite`\
-   Automatiser la **génération de CRUDs complets** pour chaque entité
    détectée
-   Supporter les **bases de données existantes** et/ou les entités
    NestJS déjà définies
-   Respecter la **nomenclature officielle NestJS**
-   Assurer la cohérence entre **services**, **contrôleurs**, **DTOs**
    et **schémas**
-   Générer des fichiers prêts à l'emploi avec **templates
    personnalisables**
-   Fournir un fichier de configuration unique : `parasite.conf.json`

------------------------------------------------------------------------

## 🏗️ Architecture technique proposée

    parasite/
    ├── bin/
    │   └── parasite.js             # Point d'entrée CLI
    ├── src/
    │   ├── cli/
    │   │   ├── index.ts           # Gestion des commandes CLI
    │   │   ├── generate.ts        # Génération CRUDs
    │   │   ├── analyze.ts         # Analyse projet + DB
    │   │   └── utils.ts           # Fonctions utilitaires
    │   ├── config/
    │   │   └── parasite.conf.json # Fichier config principal
    │   ├── templates/             # Templates de génération
    │   │   ├── controller.hbs
    │   │   ├── service.hbs
    │   │   ├── module.hbs
    │   │   ├── dto-create.hbs
    │   │   ├── dto-update.hbs
    │   │   └── entity.hbs
    │   └── core/
    │       ├── project-scanner.ts # Analyse des entités NestJS
    │       ├── db-scanner.ts      # Analyse des tables DB
    │       ├── crud-generator.ts  # Génération CRUD dynamique
    │       └── validator.ts       # Validation cohérence entités/services
    ├── package.json
    ├── README.md
    └── tsconfig.json

------------------------------------------------------------------------

## ⚙️ Fonctionnalités CLI

### 1. Initialisation

``` bash
parasite init
```

-   Crée un fichier `parasite.conf.json` avec les options par défaut.

### 2. Génération automatique

``` bash
parasite generate crud
```

-   Analyse la **base de données** et le **projet NestJS**.
-   Génère automatiquement les **entités**, **modules**, **services** et
    **contrôleurs**.

### 3. Génération ciblée

``` bash
parasite generate crud User
```

-   Génère le CRUD uniquement pour l'entité `User`.

### 4. Nettoyage

``` bash
parasite clean
```

-   Supprime les fichiers générés.

------------------------------------------------------------------------

## 🔧 parasite.conf.json (exemple)

``` json
{
  "projectRoot": "./src",
  "db": {
    "type": "postgres",
    "host": "localhost",
    "port": 5432,
    "username": "root",
    "password": "root",
    "database": "mydb"
  },
  "templatesDir": "./src/templates",
  "namingConvention": "camelCase",
  "overwriteExisting": false
}
```

------------------------------------------------------------------------

## 🧩 Technologies utilisées

-   **Node.js** + **TypeScript**
-   **NestJS** (framework principal)
-   **Handlebars** → Templates dynamiques
-   **Commander.js** → CLI
-   **TypeORM** → Analyse DB
-   **Chalk** → Logs stylisés

------------------------------------------------------------------------

## ✅ Auto-évaluation

  Critère                   Évaluation
  ------------------------- ------------
  **Clarté**                9/10
  **Exhaustivité**          10/10
  **Précision technique**   9/10
  **Structure**             10/10
  **Prêt pour IA**          ✅ Oui

------------------------------------------------------------------------

## 🚀 Instructions pour IA de codage

> **Mission** : Implémenter intégralement le projet Parasite en
> respectant le cahier des charges ci-dessus.
>
> -   Respecter **l'architecture technique** définie.
> -   Créer la **CLI** et ses commandes principales.
> -   Gérer la génération automatique via **Handlebars**.
> -   Utiliser **TypeORM** pour introspecter la base.
> -   Documenter chaque fonction et module.
> -   Tester toutes les commandes CLI.
