# Journal de Refactoring - Projet `parasite-cli`

Ce document suit les fonctionnalités existantes, les décisions prises et les étapes réalisées durant le refactoring du projet.

## 1. Fonctionnalités Existantes (Avant Refactoring)

-   **Génération de code CRUD "Database-First"**:
    -   Commande: `parasite-cli db`
    -   Fonctionnement: Se connecte à une base de données MySQL ou PostgreSQL.
    -   Analyse les tables, colonnes et certaines relations (`ManyToOne`, `OneToMany`).
    -   Génère une arborescence de projet NestJS complète avec :
        -   Entités TypeORM (`*.entity.ts`)
        -   DTOs pour la création et la mise à jour (`create-*.dto.ts`, `update-*.dto.ts`)
        -   Services (`*.service.ts`)
        -   Contrôleurs (`*.controller.ts`)
        -   Modules (`*.module.ts`)

-   **Génération de code CRUD "Entity-First"**:
    -   Commande: `parasite-cli generate`
    -   Fonctionnement: Analyse les fichiers d'entités (`*.entity.ts`) existants dans un projet.
    -   Génère les fichiers DTOs, services, contrôleurs et modules manquants pour ces entités.

-   **Mise à jour automatique du `app.module.ts`**:
    -   Après la génération, le nouveau module principal est automatiquement importé dans le `app.module.ts` du projet cible.

## 2. Plan de Refactoring

Basé sur l'audit initial, le plan de refactoring suivant est proposé. Les tâches sont priorisées pour maximiser la stabilité et la valeur ajoutée.

### Étape 1 : Mettre en place une base de test solide

*   [x] **Tâche 1.1**: Installer et configurer un environnement de test avec Jest (`jest`, `ts-jest`, `@types/jest`).
*   [x] **Tâche 1.2**: Créer un premier fichier de test pour une fonction utilitaire simple (ex: `string-formatters.ts`) pour valider la configuration.
*   [x] **Tâche 1.3**: Écrire une suite de tests pour le `mysql-scanner.ts`. C'est la partie la plus critique et la plus complexe, qui bénéficiera le plus d'une couverture de test.

### Étape 2 : Améliorer les fonctionnalités de base

*   [x] **Tâche 2.1**: Étendre le `mysql-scanner.ts` pour détecter les relations `OneToOne`.
*   [x] **Tâche 2.2**: Étendre le `mysql-scanner.ts` pour détecter les relations `ManyToMany` (via une table de jonction).
*   [ ] **Tâche 2.3**: Mettre à jour les modèles Handlebars (`entity.hbs`, etc.) pour générer le code correspondant à ces nouvelles relations.

### Étape 3 : Améliorer l'expérience utilisateur (Optionnel)

*   [ ] **Tâche 3.1**: Supprimer la dépendance globale à `@nestjs/cli` en utilisant `npx` lors de la création d'un nouveau projet.
