# Challenge Evaluation UI Specification

## Purpose
Interface d'évaluation par **défis cognitifs ludiques** alignée sur le cadre backend
(`challenge-evaluation`). Remplace l'ancien dispositif Review / Dashboard / Évaluation avancée.

Fichiers : `components/challenges/`, `components/discover/discover-challenge-dialog.component.*`,
`shared/challenge-exercise-panel` (via `challenge-exercise-panel.component.*`), routes `/challenges`,
`ApiService` (domaine challenges).

## Requirements

### Requirement: Page cadre des défis
Le système SHALL exposer une route `/challenges` présentant le cadre d'évaluation :
taxonomie des opérations, catalogue des mécaniques, matrices de compatibilité et
recommandations par niveau de pyramide.

#### Scenario: Consultation du cadre
- GIVEN un utilisateur authentifié ou invité (selon politique future)
- WHEN il ouvre `/challenges`
- THEN les catalogues API sont affichés sous forme de sections navigables

### Requirement: Génération et lancement d'un exercice
Le système SHALL permettre de générer un exercice via `POST /challenges/generate` depuis
un formulaire (id_objet, type objet, niveau pyramide, opération, mécanique, difficulté).

#### Scenario: Génération depuis l'UI
- GIVEN l'utilisateur saisit un `id_objet` valide et une combinaison compatible
- WHEN il clique sur « Générer l'exercice »
- THEN un exercice est créé et l'utilisateur est redirigé vers `/challenges/play/:id`

### Requirement: Vue de jeu générique (v1)
Le système SHALL afficher `/challenges/play/:exerciseId` avec un rendu minimal adapté à la
mécanique (`matching`, `sorting`, `drag_drop`, `sorting_lab`, `knowledge_bridges`, `sequence_frieze`, `missing_fragment`, `transform_atelier`, `comparator`,
`memory`, `investigation` en priorité) et permettre la soumission d'une tentative.

#### Scenario: Tentative enregistrée
- GIVEN un exercice affiché
- WHEN l'utilisateur valide sa réponse
- THEN `POST /challenges/attempts` est appelé et le feedback (score, maîtrise, XP) s'affiche

### Requirement: Rejouer un défi après tentative incomplète
Le système SHALL permettre de rejouer un exercice dans la même vue (page ou modale) lorsque
le score est strictement inférieur à 100 %, **sans** exiger la sauvegarde du défi ni fermer la
fenêtre.

#### Scenario: Rejouer depuis la modale Discover
- GIVEN un défi joué dans `DiscoverChallengeDialogComponent` avec un score &lt; 100 %
- WHEN l'utilisateur clique sur « Rejouer le défi »
- THEN les réponses et le résultat sont réinitialisés et une nouvelle tentative est possible

#### Scenario: Rejouer depuis la page play
- GIVEN un exercice sur `/challenges/play/:id` avec un score &lt; 100 %
- WHEN l'utilisateur clique sur « Rejouer le défi »
- THEN le panneau `app-challenge-exercise-panel` repart à zéro

#### Scenario: Score parfait
- GIVEN une tentative avec un score de 100 %
- WHEN le résultat s'affiche
- THEN le bouton « Rejouer » n'est pas proposé (seule la fermeture ou navigation reste disponible)

### Requirement: Profil gamification
Le système SHALL afficher XP, niveau, streak et badges sur `/challenges/profile` ou un
panneau intégré à la page cadre.

#### Scenario: Affichage XP
- WHEN la page profil gamification est ouverte
- THEN les données de `GET /challenges/gamification/profile` sont affichées

### Requirement: Intégration Discover
Le système SHALL exposer un bouton « Lancer un défi » sur chaque question sélectionnée
dans Discover, pré-remplissant `knowledge_object_id`, le niveau pyramide et l'opération
cognitive de la question, puis ouvrant une **fenêtre modale** de jeu (et non une navigation
obligatoire vers `/challenges/play/:id`).

#### Scenario: Lancement depuis Discover
- GIVEN une question sélectionnée dans Discover avec `id_question` valide
- WHEN l'utilisateur clique sur « Lancer un défi »
- THEN `POST /challenges/generate` est appelé avec `use_ai: true`
- AND l'exercice s'affiche dans `DiscoverChallengeDialogComponent`

#### Scenario: Sauvegarde optionnelle du défi
- GIVEN un défi généré non encore sauvegardé (`id_challenge` absent)
- WHEN l'utilisateur clique sur « Sauvegarder le défi »
- THEN `saveChallengeExercise` est appelé et le défi devient réouvrable depuis la liste Discover

### Requirement: Génération IA des exercices
Le système SHALL, lorsque `use_ai` est activé (ou auto si clé Mistral présente), générer
le contenu JSON de l'exercice via Mistral en s'appuyant sur la question, le parcours et
la proposition Discover courante, avec repli rule-based en cas d'échec.

#### Scenario: Repli rule-based
- GIVEN `MISTRAL_API_KEY` absente ou réponse IA invalide
- WHEN la génération est demandée
- THEN un exercice rule-based est produit sans erreur HTTP

### Requirement: Barre transverse (navigation)
Le système SHALL afficher `app-transverse-rail` sur `/challenges` et `/challenges/play/:id`,
avec la marge gauche `page-with-transverse-rail-padding` comme les autres pages principales.

#### Scenario: Navigation depuis les défis
- WHEN l'utilisateur ouvre `/challenges`
- THEN la barre latérale transverse (Accueil, Discipline, Défis, etc.) est visible

### Requirement: Internationalisation
Le système SHALL traduire les libellés UI (`challenges.*`, dont `challenges.replay`) en FR/EN ;
les catalogues backend fournissent `label_fr` / `label_en`.

#### Scenario: Libellés bilingues
- GIVEN la langue UI est l'anglais
- WHEN la page `/challenges` est affichée
- THEN les labels catalogue utilisent la locale EN

### Requirement: Matrices visuelles
Le système SHALL visualiser les matrices opérations × mécaniques et niveaux × types
d'évaluation sous forme de grilles heatmap ou tableaux filtrables.

#### Scenario: Heatmap compatibilité
- WHEN le catalogue est chargé
- THEN la matrice est colorée selon le score de compatibilité (0–3)
