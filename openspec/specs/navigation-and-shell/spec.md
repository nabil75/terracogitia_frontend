# Navigation & Shell Specification

## Purpose
Structure de navigation de l'application Angular : table de routes, coquille racine
(`AppComponent` + `<router-outlet>`), barre de navigation transversale
(`TransverseRailComponent`) et initialisation applicative (langue, thème). Aucune route
n'est protégée par un guard.

Fichiers : `app.routes.ts`, `admin.routes.ts`, `app.config.ts`,
`shared/transverse-rail/transverse-rail.component.ts`.

## Requirements

### Requirement: Table de routes publiques
Le système SHALL exposer les routes `''` (redirection vers `/login`), `home`, `resume`,
`login`, `discover`, `discipline`, et `admin` (avec routes enfants), accessibles **sans
authentification** obligatoire (sauf redirection initiale vers login).

#### Scenario: Redirection initiale
- GIVEN l'utilisateur ouvre l'application à la racine
- WHEN la route par défaut s'applique
- THEN il est redirigé vers `/login`

#### Scenario: Accès direct sans authentification
- GIVEN l'utilisateur est connecté ou accède directement
- WHEN il navigue vers `/discover` ou `/home`
- THEN la page s'affiche

#### Scenario: Redirection par défaut de l'espace admin
- GIVEN l'utilisateur navigue vers `/admin`
- WHEN la route enfant par défaut s'applique
- THEN il est redirigé vers `/admin/themes`

### Requirement: Absence de protection de route
Le système SHALL ne définir aucun `canActivate` ni guard d'authentification ; `/login`
existe mais n'est pas lié depuis la barre transversale.

#### Scenario: Route orpheline de connexion
- GIVEN la barre de navigation transversale
- WHEN l'utilisateur consulte ses liens
- THEN aucun lien ne pointe vers `/login`

### Requirement: Barre de navigation transversale
Le système SHALL afficher une barre transversale fixe proposant les liens vers `/home`,
`/discipline`, `/resume`, `/admin`, ainsi que les bascules de langue (FR/EN) et de thème
(clair/sombre), et surligner la route active.

Les routes `/review`, `/dashboard` et `/evaluation-avancee` (ancien dispositif
d'évaluation par questions) ne SHALL plus exister.

#### Scenario: Surlignage de la route active
- GIVEN l'utilisateur est sur `/resume`
- WHEN la barre transversale est visible
- THEN l'élément correspondant porte l'état actif

#### Scenario: Badge de discipline sélectionnée
- GIVEN une discipline est sélectionnée dans `DisciplineService`
- WHEN la barre transversale s'affiche
- THEN elle indique « Discipline : {label} »

### Requirement: Bascule de visibilité des thèmes inactifs
Le système SHALL afficher un bouton de visibilité des thèmes inactifs (sans parcours)
uniquement lorsqu'il existe des thèmes inactifs ET que l'URL est `/home` ou `/admin*`.

#### Scenario: Bouton masqué hors contexte
- GIVEN l'URL est `/discover`
- WHEN la barre transversale s'affiche
- THEN le bouton de bascule des thèmes inactifs est absent

### Requirement: Initialisation applicative
Le système SHALL initialiser la langue (`LanguageService`) et le thème (`ThemeService`)
au démarrage via `APP_INITIALIZER`, avant le premier rendu.

#### Scenario: Application de la langue et du thème au démarrage
- GIVEN une langue et un thème enregistrés en localStorage
- WHEN l'application démarre
- THEN la langue est appliquée à ngx-translate et le thème est appliqué au `body` avant le premier rendu
