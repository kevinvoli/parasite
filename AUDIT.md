# Rapport d'Audit du Projet `parasite-cli`

Ce document présente les résultats d'une analyse architecturale et fonctionnelle du projet `parasite-cli`.

## Résumé Général

`parasite-cli` est un outil en ligne de commande conçu pour accélérer le développement NestJS en générant des modules CRUD (Create, Read, Update, Delete) complets. Il supporte deux stratégies principales :

1.  **Database-First (`db`)**: Connexion à une base de données (MySQL, PostgreSQL), introspection du schéma et génération d'un projet NestJS complet avec entités TypeORM, DTOs, services et contrôleurs.
2.  **Entity-First (`generate`)**: Analyse d'un projet NestJS existant pour trouver les entités TypeORM et générer le code CRUD correspondant.

L'architecture est modulaire et découple efficacement la source de données (analyse) de la logique de génération de code (synthèse).

## Conclusions de l'Analyse et Points d'Action

| Gravité   | Point d'Analyse                                                                                                                              | Impact                                                                                                                                 | Recommandation                                                                                             |
| :-------- | :------------------------------------------------------------------------------------------------------------------------------------------- | :------------------------------------------------------------------------------------------------------------------------------------- | :--------------------------------------------------------------------------------------------------------- |
| **Critique** | **Absence de suite de tests automatisés.**                                                                                                   | Risque majeur de régression à chaque modification. La logique complexe des scanners de base de données n'est pas vérifiée.            | **Priorité absolue :** Mettre en place un framework de test (ex: Jest) et couvrir les parties critiques.         |
| **Majeur**   | **Support incomplet des relations entre entités.**                                                                                           | L'outil ne gère pas les relations `OneToOne` et `ManyToMany`, ce qui limite son utilité sur des schémas de base de données complexes. | Étendre la logique des scanners (ex: `mysql-scanner.ts`) pour détecter et gérer ces types de relations.   |
| **Mineur**    | **Dépendance à un outil externe global (`@nestjs/cli`).**                                                                                      | Crée une friction pour l'utilisateur qui doit avoir cet outil pré-installé. Peut causer des erreurs si la dépendance n'est pas trouvée. | Envisager d'utiliser `npx` pour appeler le CLI NestJS ou de trouver une alternative pour créer un projet de base. |
| **Bonne Pratique** | **Utilisation de `ts-morph` pour la modification de code.**                                                                              | Les modifications de fichiers TypeScript existants (ex: `app.module.ts`) sont robustes et sécurisées, évitant les erreurs des approches basées sur des expressions régulières. | Maintenir et étendre cette approche pour toute manipulation de code AST.                                        |

## Fichiers et Symboles Clés

-   `package.json`: Définit les dépendances, les scripts et le binaire `parasite-cli`. Révèle l'absence de `jest` ou autre framework de test.
-   `src/cli/index.ts`: Point d'entrée du CLI, définissant les commandes `generate` et `db`.
-   `src/core/generate-from-db.ts`: Orchestre le workflow "database-first".
-   `src/types.d.ts`: **Fichier central**. Définit la structure de données intermédiaire `ParsedEntity` qui fait le lien entre l'analyse et la génération.
-   `src/core/mysql-scanner.ts`: Implémentation concrète pour MySQL. Contient la logique de détection des colonnes et relations.
-   `src/core/crud-generator.ts`: Consomme la structure `ParsedEntity` pour générer les fichiers finaux à l'aide des modèles Handlebars.
-   `src/templates/crud/entity.hbs`: Exemple de modèle Handlebars utilisé pour générer une entité TypeORM.
-   `src/utils/app-module-updater.ts`: Utilitaire (basé sur `ts-morph`) pour mettre à jour le `app.module.ts` de l'utilisateur, ce qui est une excellente pratique.
