# Discover Experience Specification

## Purpose
Espace d'apprentissage « Discover » (`DiscoverComponent`, route `/discover`) : atelier
multi-panneaux pour un parcours sélectionné, combinant une carte mentale (D3), une timeline
d'ordre logique des questions, la liste des questions (avec regroupement par famille et
séquence), la proposition IA courante (ou sauvegardée) et un panneau latéral de notes et
d'historique.

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
générer (`ordreLogiqueQuestions`, mode enrichi), afficher un badge « depuis le cache »,
permettre la régénération (`force_refresh`), et signaler les états vides ou partiels
(cycles).

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
regroupement IA (`regroupementQuestionsParcours`), et persister le mode choisi par parcours.

#### Scenario: Regroupement par famille
- GIVEN des questions sans regroupement
- WHEN l'utilisateur clique sur « regrouper »
- THEN le regroupement IA s'exécute, la liste est réordonnée par famille et le mode est persisté

#### Scenario: Bascule regroupement / séquence
- GIVEN un regroupement déjà effectué
- WHEN l'utilisateur reclique sur le bouton
- THEN l'affichage bascule entre regroupement par famille et séquence suggérée

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

### Requirement: Notes personnelles et historique
Le système SHALL charger l'historique des propositions sauvegardées
(`getSavedDiscoverPropositionsByQuestion`), synchroniser et enregistrer automatiquement
(débounce) les notes de la proposition courante (`upsertQuestionPropositionNotes`), et traiter
un 404 d'historique comme une liste vide silencieuse.

#### Scenario: Enregistrement automatique des notes
- GIVEN une question avec une proposition courante
- WHEN l'utilisateur modifie les notes
- THEN les notes sont enregistrées automatiquement après un court délai

#### Scenario: Historique introuvable
- GIVEN l'endpoint d'historique renvoie 404
- WHEN l'historique se charge
- THEN une liste vide est affichée sans message bloquant
