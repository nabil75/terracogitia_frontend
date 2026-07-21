# Disciplines UI Specification

## Purpose
Gestion des disciplines côté interface (`DisciplineComponent`, route `/discipline`) et filtre
de discipline global partagé (`DisciplineService`) : sélection de la discipline active,
consultation/édition du détail, création assistée par IA, et suppression conditionnelle.

## Requirements

### Requirement: Filtre de discipline global
Le système SHALL maintenir une discipline active partagée (id + label) via `DisciplineService`,
persistée en localStorage, utilisée par Home, Discover, Défis et la barre transversale.

#### Scenario: Sélection appliquant le filtre global
- GIVEN la liste des disciplines
- WHEN l'utilisateur sélectionne une discipline
- THEN `DisciplineService` persiste son id et son label et une confirmation (snackbar) s'affiche
- AND Home et les vues filtrées par discipline se rechargent sur cette discipline

#### Scenario: Sélection « toutes »
- GIVEN une discipline sélectionnée
- WHEN l'utilisateur choisit « toutes »
- THEN le filtre global est remis à nul et une confirmation s'affiche

### Requirement: Consultation et édition du détail
Le système SHALL afficher le détail d'une discipline sélectionnée (label, description, niveau,
projection éditables ; thèmes/compétences/prérequis en lecture seule) et permettre sa mise à
jour via `updateDiscipline`.

#### Scenario: Édition et enregistrement
- GIVEN une discipline sélectionnée et chargée
- WHEN l'utilisateur modifie des champs et enregistre
- THEN `updateDiscipline` est appelé, une confirmation s'affiche et le détail est rechargé

#### Scenario: États de chargement/erreur du détail
- GIVEN le chargement du détail échoue
- WHEN la vue se met à jour
- THEN un message d'erreur de détail s'affiche

### Requirement: Création assistée par IA
Le système SHALL permettre la création d'une discipline en plusieurs étapes : saisie d'un
souhait (≥ 3 caractères), proposition IA (`proposeDisciplineFromWish`) remplissant les champs,
validation puis création (`createDiscipline`).

#### Scenario: Création réussie
- GIVEN un souhait d'au moins 3 caractères
- WHEN l'utilisateur propose, valide puis ajoute
- THEN la discipline est créée, sélectionnée et son détail est chargé

#### Scenario: Souhait trop court
- GIVEN un souhait de moins de 3 caractères
- WHEN l'utilisateur tente de proposer
- THEN une erreur s'affiche et aucun appel API n'est effectué

#### Scenario: Échec de proposition IA
- GIVEN Mistral renvoie une erreur (502)
- WHEN la proposition est demandée
- THEN un message d'erreur adapté s'affiche

### Requirement: Suppression conditionnelle
Le système SHALL n'autoriser la suppression d'une discipline que lorsqu'elle n'a aucun
parcours (comptage via `getAllThemesAdmin`), demander confirmation, et restituer une erreur si
le serveur refuse (409).

#### Scenario: Suppression bloquée en UI
- GIVEN une discipline ayant des parcours
- WHEN l'utilisateur consulte l'action de suppression
- THEN le bouton est désactivé avec une explication

#### Scenario: Refus serveur
- GIVEN la suppression est tentée mais refusée par le serveur (409)
- WHEN la réponse est reçue
- THEN un message indiquant le blocage par les parcours (avec le nombre) s'affiche
