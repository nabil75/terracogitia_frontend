# Home Landing Specification

## Purpose
Page d'accueil (`HomeComponent`, route `/home`) : parcours des thèmes de la discipline
sélectionnée, dépliage pour voir les parcours, et lancement de Discover pour un parcours.

## Requirements

### Requirement: Affichage des thèmes filtrés par discipline
Le système SHALL charger et afficher les thèmes de la discipline sélectionnée
(`getAllThemes(idDiscipline)`), en rechargeant à chaque changement de discipline ; une
discipline nulle affiche tous les thèmes.

#### Scenario: Chargement pour une discipline
- GIVEN une discipline sélectionnée (id 3)
- WHEN la page Home se charge
- THEN `GET /themes/all_themes?id_discipline=3` est appelé et les cartes de thèmes s'affichent

### Requirement: Dépliage d'un thème actif
Le système SHALL permettre de déplier une carte de thème actif pour afficher la liste de ses
parcours avec une action Discover.

#### Scenario: Dépliage et action Discover
- GIVEN un thème actif (avec parcours)
- WHEN l'utilisateur clique sur la carte
- THEN la liste des parcours s'affiche avec le bouton Discover

#### Scenario: Navigation vers Discover
- GIVEN un thème déplié avec au moins un parcours
- WHEN l'utilisateur clique sur Discover d'un parcours
- THEN l'application navigue vers `/discover` avec les paramètres `theme`, `subTheme`, `themeLabel`, `subThemeLabel`

### Requirement: Thèmes inactifs
Le système SHALL marquer comme inactifs les thèmes sans parcours (non dépliables), et
permettre de les masquer selon la bascule de visibilité.

#### Scenario: Thème inactif non dépliable
- GIVEN un thème sans parcours
- WHEN l'utilisateur clique sur sa carte
- THEN rien ne se déplie et une infobulle indique l'inactivité

#### Scenario: Masquage des thèmes inactifs
- GIVEN des thèmes inactifs existent et la bascule de masquage est active
- WHEN la grille se rend
- THEN les thèmes sans parcours sont masqués

### Requirement: Échec de chargement silencieux
Le système SHALL, en cas d'échec de l'API, afficher une grille vide sans bannière d'erreur.

#### Scenario: API injoignable
- GIVEN l'API est injoignable
- WHEN Home se charge
- THEN la grille est vide et aucune bannière d'erreur n'est affichée
