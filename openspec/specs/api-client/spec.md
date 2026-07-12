# API Client Specification

## Purpose
Client HTTP centralisé (`ApiService`) exposant toutes les méthodes d'accès au backend,
attachant la langue UI aux endpoints IA, et « humanisant » les libellés snake_case renvoyés
par l'API. Base URL codée en dur : `http://localhost:8002`.

Fichiers : `api/api.service.ts`, `shared/.../label-display.util.ts`,
`shared/services/language.service.ts`.

Domaines couverts : disciplines, thèmes/parcours/questions (dont dessin JSONB par `id_objet`),
authentification, Discover, transcription et lecture audio.

## Requirements

### Requirement: Point d'accès unique aux endpoints backend
Le système SHALL centraliser dans `ApiService` l'accès à tous les domaines backend :
disciplines, thèmes/parcours/questions, authentification, Discover, dessin d'objet,
transcription audio, avec l'en-tête `Content-Type: application/json` par défaut
(les uploads multipart audio n'utilisent pas cet en-tête).

#### Scenario: Appel typé d'un endpoint
- GIVEN un composant a besoin des thèmes d'une discipline
- WHEN il appelle `getAllThemes(idDiscipline)`
- THEN une requête `GET /themes/all_themes?id_discipline=` est émise

### Requirement: Attachement de la langue aux endpoints IA
Le système SHALL injecter la langue UI courante dans les endpoints de génération IA, via le
corps (`createDiscipline`, `proposeDisciplineFromWish`, `generateParcoursAndQuestionsFromTheme`,
`generateParcoursAndQuestionsFromTheme`, `ordreLogiqueQuestions`) ou en
paramètre de requête (`getPropositionForQuestion`).

#### Scenario: Langue jointe automatiquement
- GIVEN la langue UI est l'anglais
- WHEN un appel de génération IA est effectué
- THEN la langue `"en"` est jointe à la requête (corps ou query selon la méthode)

### Requirement: Humanisation des libellés
Le système SHALL faire passer les réponses concernées (thèmes, vue d'ensemble des
connaissances, détail de discipline) par des utilitaires
convertissant les libellés snake_case en texte lisible.

#### Scenario: Libellé snake_case humanisé
- GIVEN une réponse contenant un libellé snake_case
- WHEN elle est traitée par l'humanisation
- THEN le libellé affiché est converti en texte lisible

### Requirement: Client API dessin d'objet
Le système SHALL exposer dans `ApiService` les méthodes `getObjectDessin`,
`saveObjectDessin` et `deleteObjectDessin` ciblant `/questions/{id_objet}/dessin`, typées
via `ObjectDessinResponse` (`id_objet`).

#### Scenario: Lecture du dessin
- GIVEN un composant de dessin a besoin du schéma d'un objet
- WHEN il appelle `getObjectDessin(idObjet)`
- THEN une requête `GET /questions/{id_objet}/dessin` est émise

#### Scenario: Enregistrement du dessin
- GIVEN un objet Fabric.js sérialisé
- WHEN le composant appelle `saveObjectDessin(idObjet, dessin)`
- THEN une requête `PUT /questions/{id_objet}/dessin` est émise avec `{ dessin }`

### Requirement: Client API transcription audio
Le système SHALL exposer dans `ApiService` les méthodes `transcribeAudio` (multipart)
et `getAudioFile` (blob) pour la barre `app-audio-recording-toolbar`.

#### Scenario: Transcription
- GIVEN un blob WebM enregistré côté client
- WHEN `transcribeAudio(blob)` est appelé
- THEN une requête `POST /themes/get_transcribe_audio` est émise (FormData, champ `audio`)

#### Scenario: Lecture audio
- GIVEN un identifiant audio serveur
- WHEN `getAudioFile(id)` est appelé
- THEN une requête `GET /themes/get_audio_file/{id}` est émise avec `responseType: 'blob'`

### Requirement: Absence d'intercepteur et de configuration d'environnement
Le système SHALL fonctionner sans intercepteur HTTP ni fichier d'environnement : la base URL
est codée en dur pour le développement.

#### Scenario: Base URL de développement
- GIVEN aucun fichier d'environnement configuré
- WHEN une requête est émise
- THEN elle cible `http://localhost:8002`
