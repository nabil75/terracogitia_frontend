# API Client Specification

## Purpose
Client HTTP centralisé (`ApiService`) exposant toutes les méthodes d'accès au backend,
attachant la langue UI aux endpoints IA, et « humanisant » les libellés snake_case renvoyés
par l'API. Base URL codée en dur : `http://localhost:8002`.

Fichiers : `api/api.service.ts`, `shared/.../label-display.util.ts`,
`shared/services/language.service.ts`.

Domaines couverts : disciplines, thèmes/parcours/questions (dont dessin JSONB par `id_objet`),
authentification, Discover, transcription et lecture audio, défis cognitifs et gamification.

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

### Requirement: Client API défis cognitifs
Le système SHALL exposer dans `ApiService` les méthodes du domaine `/challenges` :
catalogues (opérations cognitives, mécaniques, matrice, guidance pyramide), génération
d'exercice, lecture d'exercice, soumission de tentative et profil gamification.

#### Scenario: Catalogue des opérations
- GIVEN la page cadre défis est affichée
- WHEN le composant appelle `getCognitiveOperationsCatalog()`
- THEN une requête `GET /challenges/catalog/cognitive-operations` est émise

#### Scenario: Génération d'exercice
- GIVEN un objet de connaissance, un niveau pyramide, une opération et une mécanique
- WHEN `generateChallengeExercise(payload)` est appelé
- THEN une requête `POST /challenges/generate` est émise avec le corps de génération
  (`use_ai`, `lang` optionnels pour la génération Mistral)

#### Scenario: Soumission de tentative
- GIVEN un exercice joué côté client
- WHEN `submitChallengeAttempt(payload)` est appelé
- THEN une requête `POST /challenges/attempts` est émise avec actions apprenant et durée

#### Scenario: Profil gamification
- GIVEN un identifiant apprenant
- WHEN `getChallengeGamificationProfile(idUser)` est appelé
- THEN une requête `GET /challenges/gamification/profile?id_user=` est émise

### Requirement: Client API Discover
Le système SHALL exposer dans `ApiService` les méthodes du domaine Discover : génération de
proposition (`getPropositionForQuestion`), sauvegarde et historique des propositions,
notes sur la proposition courante (`upsertQuestionPropositionNotes`), timeline en cache
(`getSubthemeTimeline`) et ordre logique (`ordreLogiqueQuestions` avec `legacy` et
`forceRefresh` optionnels).

#### Scenario: Notes sur proposition courante
- GIVEN une question avec notes modifiées côté UI
- WHEN `upsertQuestionPropositionNotes(idQuestion, notes)` est appelé
- THEN une requête `PUT /discovering/question_proposition_notes/{id}` est émise avec `{ notes }`

#### Scenario: Ordre logique enrichi
- GIVEN un parcours et sa liste de questions
- WHEN `ordreLogiqueQuestions(payload, { legacy: false })` est appelé
- THEN une requête `POST /discovering/ordre_logique_questions?legacy=false` est émise

#### Scenario: Sauvegarde et liste des défis par question
- GIVEN un exercice généré depuis Discover
- WHEN `saveChallengeExercise(idExercise)` puis `getSavedChallengeExercisesByQuestion(idQuestion)` sont appelés
- THEN les requêtes `POST /challenges/exercises/{id}/save` et `GET /challenges/exercises/by-question/{id}/saved` sont émises

### Requirement: Client API authentification
Le système SHALL exposer `login`, `register`, `resetPassword`, `microsoftLoginUrl`, `getSession`
et `logout` pour le domaine `/auth`, avec `withCredentials` sur les appels de session.

#### Scenario: Connexion par email
- GIVEN un couple email / mot de passe
- WHEN `login(email, password)` est appelé
- THEN une requête `POST /auth/login` est émise

### Requirement: Absence d'intercepteur et de configuration d'environnement
Le système SHALL fonctionner sans intercepteur HTTP ni fichier d'environnement : la base URL
est codée en dur pour le développement.

#### Scenario: Base URL de développement
- GIVEN aucun fichier d'environnement configuré
- WHEN une requête est émise
- THEN elle cible `http://localhost:8002`
