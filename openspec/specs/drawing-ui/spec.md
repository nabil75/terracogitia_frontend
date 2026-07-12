# Drawing UI Specification

## Purpose
Composants réutilisables de dessin graphique (Fabric.js) associés à un objet métier
(identifiant générique `id_objet`) : édition embarquable dans n'importe quel template et
ouverture optionnelle en dialogue Material.

Fichiers :
- `shared/drawing-editor/drawing-editor.component.*` — composant principal
- `shared/drawing-editor/drawing-dialog.component.*` — wrapper MatDialog
- Styles globaux overlay : `app/styles/styles.scss` (classes `app-drawing-dialog`)
- i18n : clés `drawing.*` dans `assets/i18n/fr.json` et `en.json`
- API : `ApiService.getObjectDessin`, `saveObjectDessin`, `deleteObjectDessin`
  (backend : spec `questions`, réponse `{ id_objet, dessin, has_dessin }`)

## Requirements

### Requirement: Éditeur de dessin embarquable
Le système SHALL exposer un composant standalone `app-drawing-editor` intégrable
directement dans n'importe quel template, sans dépendance à MatDialog.

#### Scenario: Intégration dans un template parent
- GIVEN un composant parent importe `DrawingEditorComponent`
- WHEN il insère `<app-drawing-editor [idObjet]="id" [objectLabel]="label">`
- THEN l'éditeur affiche la barre d'outils, le canvas Fabric.js et les actions Enregistrer /
  Annuler / Supprimer le dessin

#### Scenario: Entrées requises
- GIVEN l'éditeur est affiché
- WHEN le parent fournit `idObjet` (requis) et optionnellement `objectLabel`
- THEN au montage l'éditeur charge le dessin via `GET /questions/{id_objet}/dessin`

#### Scenario: Événements de sortie
- GIVEN l'utilisateur interagit avec l'éditeur
- WHEN il enregistre, supprime ou annule
- THEN le composant émet respectivement `(saved)`, `(deleted)` ou `(cancelled)`

#### Scenario: Hauteur configurable
- GIVEN un conteneur parent définit `--drawing-editor-min-height`
- WHEN l'éditeur est rendu
- THEN la hauteur minimale du composant respecte cette variable CSS

### Requirement: Outils de dessin Fabric.js
Le système SHALL proposer un canvas Fabric.js avec outils glisser-déposer : formes
(rect, circle, triangle, diamond, trapezoid), texte, flèches simples et polylignes
(`polyArrow`), connecteurs entre formes, zoom, taille de police des libellés, et
suppression de la sélection.

#### Scenario: Persistance du schéma
- GIVEN l'utilisateur compose un dessin non vide
- WHEN il clique sur Enregistrer
- THEN le canvas est sérialisé (`canvas.toObject` avec propriétés `terra*`) et envoyé via
  `PUT /questions/{id_objet}/dessin`

#### Scenario: Chargement d'un dessin existant
- GIVEN un objet avec `has_dessin: true`
- WHEN l'éditeur est monté
- THEN le JSON Fabric.js est rechargé dans le canvas

#### Scenario: Suppression du dessin
- GIVEN un objet avec un dessin enregistré
- WHEN l'utilisateur confirme la suppression
- THEN `DELETE /questions/{id_objet}/dessin` est appelé et `(deleted)` est émis

### Requirement: Dialogue Material optionnel
Le système SHALL exposer un wrapper `DrawingDialogComponent` ouvrable via
`MatDialog.open`, encapsulant l'éditeur embarqué.

#### Scenario: Ouverture en modal
- GIVEN un composant appelle `MatDialog.open(DrawingDialogComponent, { data: { idObjet, objectLabel }, panelClass: 'app-drawing-dialog', ... })`
- WHEN le dialogue s'affiche
- THEN le titre traduit (`drawing.title`), le bouton plein écran et l'éditeur sont visibles

#### Scenario: Résultat à la fermeture
- GIVEN le dialogue est ouvert
- WHEN l'éditeur émet `saved`, `deleted` ou `cancelled`
- THEN `MatDialogRef.close` est appelé avec `'saved'`, `'deleted'` ou `undefined`

#### Scenario: Maximisation du dialogue
- GIVEN le dialogue est ouvert
- WHEN l'utilisateur active le plein écran
- THEN la taille passe à `100vw` × `100vh`, la classe `app-drawing-dialog--maximized`
  est ajoutée et le canvas est redimensionné

### Requirement: Internationalisation de l'éditeur
Le système SHALL traduire tous les libellés de l'éditeur et du dialogue via ngx-translate
(clés `drawing.*`, bouton Annuler via `common.cancel`).

#### Scenario: Libellés FR/EN
- GIVEN la langue UI est l'anglais
- WHEN l'éditeur ou le dialogue est affiché
- THEN les libellés d'outils, zoom, erreurs et actions sont en anglais

### Requirement: Page de test de développement
Le système SHALL exposer la route `/dev/drawing-test` permettant de tester l'éditeur
embarqué et le dialogue modal (usage provisoire, hors navigation principale).

#### Scenario: Harness de test
- GIVEN un développeur ouvre `/dev/drawing-test`
- WHEN il saisit un `id_objet` et utilise l'éditeur intégré ou le bouton d'ouverture modal
- THEN les deux modes (embarqué et dialogue) sont exercables sans autre page métier
