# Discover Experience Specification

## Purpose
Espace d'apprentissage « Discover » (`DiscoverComponent`, route `/discover`) : atelier
multi-panneaux pour un parcours sélectionné, combinant une carte mentale (D3), une timeline
d'ordre logique des questions, la liste des questions (avec regroupement par famille et
séquence), la proposition IA courante (ou sauvegardée) et un panneau latéral de notes et
d'historique.

Fichiers : `components/discover/`, `shared/discover/discover-answer-body.component.*`,
`shared/discover/discover-prose-format.util.ts`.

## Requirements

### Requirement: Sélection d'un parcours et carte mentale
Le système SHALL afficher une carte mentale (graphe D3) des thèmes et parcours de la discipline
(`getAllThemes`), permettre de sélectionner un parcours (depuis la carte ou via les paramètres
d'URL), et indexer les questions pour la recherche globale.

#### Scenario: Sélection depuis la carte mentale
- GIVEN la carte mentale affichée
- WHEN l'utilisateur clique sur un nœud de parcours
- THEN le parcours est sélectionné et ses questions et sa timeline se chargent
- AND l'URL est mise à jour avec `theme`, `subTheme`, `themeLabel`, `subThemeLabel`

#### Scenario: Recherche de question dans la carte
- GIVEN un terme de recherche saisi
- WHEN l'index (débounce) est prêt
- THEN les parcours contenant des questions correspondantes sont mis en évidence

### Requirement: Timeline d'ordre logique des questions
Le système SHALL charger la timeline persistée (`getSubthemeTimeline`) et, si nécessaire, la
générer (`ordreLogiqueQuestions`, mode enrichi uniquement côté UI), afficher un badge « depuis le cache »,
permettre la régénération (`forceRefresh`), et signaler les états vides ou partiels (cycles).

#### Scenario: Timeline depuis le cache
- GIVEN une timeline en cache dont la signature correspond aux questions courantes
- WHEN le parcours se charge
- THEN la timeline se rend sans appel Mistral et un badge « depuis le cache » s'affiche

#### Scenario: Régénération de la timeline
- GIVEN une timeline existante
- WHEN l'utilisateur demande la régénération
- THEN un rafraîchissement forcé est déclenché et la timeline est recalculée

#### Scenario: Séquence partielle
- GIVEN un graphe de prérequis comportant un cycle
- WHEN la séquence est calculée
- THEN un avertissement de séquence partielle s'affiche

### Requirement: Modes d'affichage des questions
Le système SHALL proposer trois modes d'affichage de la liste des questions — ordre backend,
regroupement par famille, séquence suggérée — le premier clic sur « regrouper » déclenchant le
regroupement IA (`regroupementQuestionsParcours`) si les groupes sont absents, et persister le
dernier mode choisi par parcours dans `localStorage`.

#### Scenario: Regroupement par famille (premier clic)
- GIVEN des questions sans regroupement en base
- WHEN l'utilisateur clique sur « regrouper »
- THEN le regroupement IA s'exécute, la liste est réordonnée par famille et le mode « group » est persisté

#### Scenario: Bascule regroupement / séquence
- GIVEN un regroupement déjà effectué en base
- WHEN l'utilisateur reclique sur le bouton
- THEN l'affichage bascule entre regroupement par famille et séquence suggérée
- AND le mode actif devient le défaut pour ce parcours

#### Scenario: Retour à l'ordre backend
- GIVEN un regroupement déjà effectué
- WHEN l'utilisateur bascule jusqu'à l'ordre API initial
- THEN la liste suit l'ordre renvoyé par `getQuestionsBySubTheme`

### Requirement: Génération et gestion des propositions Discover
Le système SHALL générer une proposition IA pour la question sélectionnée
(`getPropositionForQuestion`), afficher le contenu structuré (introduction, contexte, analyse,
conclusion, exercice) avec images/mots-clés (ou un repli texte), et permettre de sauvegarder
un brouillon, d'annuler, de définir une entrée d'historique comme courante et de supprimer une
entrée sauvegardée.

#### Scenario: Génération et sauvegarde
- GIVEN un parcours et une question sélectionnés
- WHEN l'utilisateur clique sur l'action Discover
- THEN un chargement s'affiche puis le contenu apparaît avec un badge « brouillon »
- AND la sauvegarde crée une entrée d'historique et efface le brouillon

#### Scenario: Échec de génération
- GIVEN `getPropositionForQuestion` échoue
- WHEN la génération est demandée
- THEN le chargement s'arrête, un message d'erreur (snackbar) s'affiche et aucun brouillon n'est créé

#### Scenario: Priorité d'affichage de la proposition
- GIVEN un brouillon et/ou une proposition courante existent
- WHEN la colonne proposition se rend
- THEN elle affiche le brouillon en priorité, sinon la proposition courante, sinon un état vide

### Requirement: Mise en forme lisible du texte de proposition
Le système SHALL formater le texte des sections Discover pour faciliter la lecture : paragraphes
séparés, listes numérotées pour les énumérations (`1.`, `2)`, etc.) et listes à puces pour les
lignes préfixées par `-` ou `•`, via `formatDiscoverProseHtml` et `app-discover-answer-body`.

#### Scenario: Énumération sur plusieurs lignes
- GIVEN une section contenant des lignes `1. …`, `2. …`, `3. …`
- WHEN la proposition s'affiche
- THEN une liste ordonnée HTML est rendue (pas un bloc de texte brut)

#### Scenario: Idées séparées par ligne vide
- GIVEN un champ JSON contenant des paragraphes séparés par `\n\n`
- WHEN la proposition s'affiche
- THEN chaque bloc apparaît comme un paragraphe distinct avec espacement vertical

### Requirement: Notes personnelles et historique
Le système SHALL charger l'historique des propositions sauvegardées
(`getSavedDiscoverPropositionsByQuestion`), synchroniser et enregistrer automatiquement
(débounce) les notes de la proposition courante (`upsertQuestionPropositionNotes`), et traiter
un 404 d'historique comme une liste vide silencieuse.

#### Scenario: Enregistrement automatique des notes
- GIVEN une question avec une proposition courante (ou création implicite via l'API)
- WHEN l'utilisateur modifie les notes
- THEN les notes sont enregistrées automatiquement après un court délai dans `proposition.notes`

#### Scenario: Date d'historique depuis la base
- GIVEN une entrée d'historique avec `date_creation` renseignée
- WHEN la liste d'historique s'affiche
- THEN la date affichée provient de `date_creation` (format `JJ/MM/AAAA HH:MM`), pas de l'heure courante

#### Scenario: Historique introuvable
- GIVEN l'endpoint d'historique renvoie 404
- WHEN l'historique se charge
- THEN une liste vide est affichée sans message bloquant

### Requirement: Lisibilité de l'historique en thème clair
Le système SHALL afficher chaque ligne d'historique avec une bordure, un fond et une ombre
visibles en mode light-theme (pas de clipping par le conteneur parent).

#### Scenario: Bordure visible en light-theme
- GIVEN le thème clair actif et plusieurs entrées d'historique
- WHEN le panneau historique se rend
- THEN chaque carte d'historique a une bordure entièrement visible sur les quatre côtés

### Requirement: Défis cognitifs depuis Discover
Le système SHALL permettre de lancer un défi depuis la question sélectionnée via une fenêtre
modale (`DiscoverChallengeDialogComponent`) hébergeant `app-challenge-exercise-panel`, avec
option de sauvegarde du défi et liste des défis sauvegardés par question.

#### Scenario: Lancement en fenêtre modale
- GIVEN une question sélectionnée avec `id_question` valide
- WHEN l'utilisateur lance un défi
- THEN un exercice est généré et affiché dans la modale sans quitter Discover

#### Scenario: Ouverture d'un défi sauvegardé
- GIVEN un défi listé dans « Défis sauvegardés » pour la question
- WHEN l'utilisateur l'ouvre
- THEN la même modale affiche l'exercice existant pour rejouer
