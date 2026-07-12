# Audio Recording UI Specification

## Purpose
Barre réutilisable d'enregistrement audio, transcription automatique (Whisper côté backend)
et relecture du fichier enregistré. Intégrable dans n'importe quel template via two-way
binding sur la transcription et l'identifiant audio.

Fichiers :
- `shared/audio-recording-toolbar/audio-recording-toolbar.component.*`
- i18n : clés `audioRecording.*` dans `assets/i18n/fr.json` et `en.json`
- API : `ApiService.transcribeAudio`, `getAudioFile`
  (backend : spec `themes-parcours`, stockage sous `APP_DATA_DIR/audio/`)

## Requirements

### Requirement: Barre d'enregistrement réutilisable
Le système SHALL exposer un composant standalone `app-audio-recording-toolbar` avec trois
actions : démarrer l'enregistrement, arrêter, lire l'audio enregistré.

#### Scenario: Intégration dans un template parent
- GIVEN un composant parent importe `AudioRecordingToolbarComponent`
- WHEN il insère `<app-audio-recording-toolbar [(transcription)]="texte" [(audioId)]="id">`
- THEN la barre s'affiche avec les boutons micro, stop et lecture

#### Scenario: Binding two-way
- GIVEN le parent lie `[(transcription)]` et `[(audioId)]`
- WHEN la transcription backend se termine
- THEN `transcription` et `audioId` sont mis à jour côté parent

#### Scenario: Désactivation
- GIVEN le parent passe `[disabled]="true"`
- WHEN la barre est affichée
- THEN les contrôles sont inactifs et visuellement atténués

### Requirement: Enregistrement micro navigateur
Le système SHALL capturer l'audio via `navigator.mediaDevices.getUserMedia` et
`MediaRecorder` (format `audio/webm`), libérer le flux micro à l'arrêt, et afficher un
indicateur « enregistrement en cours » pendant la capture.

#### Scenario: Démarrage et arrêt
- GIVEN l'utilisateur autorise l'accès micro
- WHEN il clique sur le bouton micro puis sur stop
- THEN un blob WebM est produit et envoyé au backend pour transcription

#### Scenario: Refus ou erreur micro
- GIVEN l'accès micro est refusé ou indisponible
- WHEN l'utilisateur tente d'enregistrer
- THEN l'état d'enregistrement repasse à inactif sans bloquer l'interface

### Requirement: Transcription via le backend
Le système SHALL envoyer le blob audio à `POST /themes/get_transcribe_audio` via
`ApiService.transcribeAudio`, afficher un spinner pendant l'appel, puis propager le texte
transcrit et l'identifiant fichier retournés.

#### Scenario: Transcription réussie
- GIVEN un enregistrement vient de s'arrêter
- WHEN le backend répond `{ id, text }`
- THEN `transcription` et `audioId` sont mis à jour, `(transcribed)` émet `{ id, text }`,
  et le spinner disparaît

#### Scenario: Échec de transcription
- GIVEN l'appel API échoue
- WHEN la requête retourne une erreur
- THEN le spinner disparaît et l'erreur est journalisée en console (sans message UI dédié)

### Requirement: Relecture de l'audio enregistré
Le système SHALL permettre la lecture du fichier précédemment enregistré via
`GET /themes/get_audio_file/{id}` lorsque `audioId` est renseigné.

#### Scenario: Lecture
- GIVEN un `audioId` valide est présent
- WHEN l'utilisateur clique sur le bouton lecture
- THEN le fichier blob est récupéré et lu via un élément `Audio` HTML

#### Scenario: Bouton lecture inactif
- GIVEN aucun `audioId` n'est renseigné
- WHEN la barre est affichée
- THEN le bouton lecture est désactivé

### Requirement: Nettoyage des ressources
Le système SHALL libérer le flux micro, révoquer les object URLs blob et arrêter les
références audio à la destruction du composant (`ngOnDestroy`).

#### Scenario: Destruction du composant
- GIVEN un enregistrement ou une lecture est en cours
- WHEN le composant parent est détruit
- THEN les tracks micro sont stoppés et les URLs objet révoquées

### Requirement: Internationalisation de la barre audio
Le système SHALL traduire les libellés et attributs ARIA via ngx-translate (clés
`audioRecording.*`).

#### Scenario: Libellés FR/EN
- GIVEN la langue UI est le français
- WHEN la barre est affichée
- THEN les tooltips et l'indicateur d'enregistrement sont en français

### Requirement: Page de test de développement
Le système SHALL exposer la barre audio sur la route `/dev/drawing-test` (section dédiée,
usage provisoire).

#### Scenario: Harness de test
- GIVEN un développeur ouvre `/dev/drawing-test`
- WHEN il utilise la section « Test — barre audio »
- THEN enregistrement, transcription et relecture sont testables isolément
