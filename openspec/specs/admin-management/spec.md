# Admin Management Specification

## Purpose
Espace d'administration (`AdminShellComponent` + sections, routes `/admin/*`) centré sur la
gestion des thèmes et parcours : coquille à onglets, CRUD des thèmes et parcours, panneau de
génération assistée par IA avec sélection de thème par glisser-déposer, et affichage de la
famille des parcours. Aucune protection de rôle côté client.

## Requirements

### Requirement: Coquille d'administration à onglets
Le système SHALL présenter une coquille d'administration avec trois onglets — Themes
(fonctionnel), Notation (placeholder), Sources (placeholder) — et rediriger `/admin` vers
`/admin/themes` par défaut.

#### Scenario: Onglets et redirection
- GIVEN l'utilisateur ouvre `/admin`
- WHEN la coquille se rend
- THEN il est redirigé vers `/admin/themes` et les trois onglets sont visibles

#### Scenario: Sections placeholder
- GIVEN l'utilisateur ouvre `/admin/notation` ou `/admin/sources`
- WHEN la section se rend
- THEN une carte « à venir » avec titre et description s'affiche

### Requirement: CRUD des thèmes
Le système SHALL permettre la création, l'édition et la suppression de thèmes (via dialogues),
le libellé étant requis (max 200), avec confirmation de suppression et rafraîchissement de la
liste après mutation. Créer un thème sans discipline sélectionnée ouvre un dialogue de choix
de discipline.

#### Scenario: Création d'un thème
- GIVEN l'onglet Themes avec une discipline sélectionnée
- WHEN l'utilisateur crée un thème avec un libellé valide
- THEN une confirmation s'affiche et l'accordéon est rafraîchi avec le nouveau thème

#### Scenario: Choix de discipline requis
- GIVEN aucune discipline sélectionnée
- WHEN l'utilisateur crée un thème
- THEN un dialogue de choix de discipline (`ThemeDisciplinePickDialogComponent`) s'ouvre avec la liste des disciplines

#### Scenario: Échec de chargement de la liste
- GIVEN `getAllThemesAdmin` renvoie une erreur
- WHEN la page se charge
- THEN une carte d'erreur avec bouton « Réessayer » s'affiche

### Requirement: CRUD des parcours et affichage de la famille
Le système SHALL permettre la création, l'édition et la suppression de parcours (libellé
requis, description optionnelle), et afficher pour chaque parcours son badge `famille`
(lecture seule, non éditable dans le dialogue).

#### Scenario: Affichage de la famille
- GIVEN un parcours possédant une `famille`
- WHEN la ligne du parcours se rend
- THEN un badge de famille est affiché

#### Scenario: Édition d'un parcours
- GIVEN un parcours existant
- WHEN l'utilisateur modifie son libellé et enregistre
- THEN `updateSubTheme` est appelé et la liste est rafraîchie

### Requirement: Sélection de thème par glisser-déposer vers le panneau IA
Le système SHALL permettre de glisser un thème (poignée, MIME `application/x-terra-theme-id`)
et de le déposer sur le panneau de génération IA pour le sélectionner dans le sélecteur de
thème, avec retour visuel et confirmation.

#### Scenario: Glisser un thème vers le panneau IA
- GIVEN au moins un thème dans la liste
- WHEN l'utilisateur glisse la poignée d'un thème sur le panneau IA
- THEN le sélecteur de thème du panneau IA est mis à jour, le surlignage de dépôt disparaît et une confirmation s'affiche

### Requirement: Génération assistée par IA des parcours et questions
Le système SHALL permettre de générer par IA des parcours et questions pour le thème
sélectionné (`generateParcoursAndQuestionsFromTheme`), avec un overlay de chargement plein
écran, puis rafraîchir la liste ; une génération sans thème sélectionné est refusée.

#### Scenario: Génération réussie
- GIVEN un thème sélectionné dans le panneau IA
- WHEN l'utilisateur lance la génération
- THEN un overlay de chargement s'affiche, l'API est appelée puis la liste est rafraîchie

#### Scenario: Génération sans thème
- GIVEN aucun thème sélectionné
- WHEN l'utilisateur lance la génération
- THEN un message de validation s'affiche et aucun appel API n'est effectué
