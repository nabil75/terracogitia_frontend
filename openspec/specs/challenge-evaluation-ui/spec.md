# Challenge Evaluation UI Specification

## Purpose
Domaine **à venir** : interface d'évaluation par **défis / jeux** remplaçant l'ancien
dispositif basé sur les réponses aux questions (Review, Dashboard, Évaluation avancée).

## État actuel

Composants et routes **supprimés** :
- `ReviewComponent` (`/review`) — évaluation IA des réponses
- `DashboardComponent` (`/dashboard`) — tableaux de bord des notes
- `EvaluationAvanceeComponent` (`/evaluation-avancee`) — analytics avancés
- Liens correspondants dans la barre transversale
- Bouton Review sur la page Home

Conservés : Home (Discover uniquement par parcours), Discover, Resume (sans nœuds évaluation).

## Requirements (futurs — non implémentés)

### Requirement: Accès aux défis depuis un parcours
Le système SHALL, dans une version ultérieure, permettre de lancer un défi ludique depuis
un parcours (remplaçant le bouton Review supprimé).

#### Scenario: Placeholder
- GIVEN l'ancienne UI d'évaluation retirée
- WHEN la spec des défis sera disponible
- THEN une entrée UI (bouton, route) sera ajoutée selon ce document
