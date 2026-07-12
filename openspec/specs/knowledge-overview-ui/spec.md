# Knowledge Overview UI Specification

## Purpose
Page « vue d'ensemble / accueil » (`ResumeComponent`, route `/resume`) : arbre hiérarchique
en lecture seule de toutes les connaissances (discipline → thème → parcours → question →
propositions uniquement).

## Requirements

### Requirement: Arbre hiérarchique des connaissances
Le système SHALL charger `getKnowledgeOverview()` et afficher un arbre dépliable présentant
les niveaux discipline, thème, parcours, question et proposition, chaque proposition étant
identifiée par son `#id` et sa date.

#### Scenario: Affichage de l'arbre
- GIVEN l'API renvoie des disciplines avec données imbriquées
- WHEN la page se charge
- THEN un arbre dépliable présente tous les niveaux

#### Scenario: Marqueur de thème inactif
- GIVEN un thème sans parcours
- WHEN l'arbre se rend
- THEN la ligne du thème porte un marqueur « inactif »

### Requirement: États de chargement, d'erreur et vide
Le système SHALL afficher un état de chargement, un état d'erreur avec bouton « Réessayer »,
et un état vide.

#### Scenario: Réessai après échec
- GIVEN le chargement initial a échoué
- WHEN l'utilisateur clique sur « Réessayer »
- THEN `getKnowledgeOverview()` est rappelé

#### Scenario: État vide
- GIVEN l'API ne renvoie aucune donnée
- WHEN la page se rend
- THEN un état vide est affiché

### Requirement: Lecture seule
Le système SHALL présenter l'arbre en lecture seule, sans navigation depuis les nœuds vers
Review ou Discover (l'ancien lien Review a été retiré).

#### Scenario: Aucun lien de navigation depuis les nœuds
- GIVEN l'arbre affiché
- WHEN l'utilisateur clique sur un nœud
- THEN le nœud se déplie/replie sans naviguer vers une autre page
