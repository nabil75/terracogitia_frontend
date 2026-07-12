# Internationalization UI Specification

## Purpose
Internationalisation de l'interface (FR/EN) via ngx-translate, persistance du choix de langue,
bascule depuis la barre transversale, et transmission de la langue courante aux endpoints IA
du backend.

Fichiers : `app.config.ts`, `shared/services/language.service.ts`, `assets/i18n/fr.json`,
`assets/i18n/en.json`.

## Requirements

### Requirement: Résolution et persistance de la langue
Le système SHALL déterminer la langue au démarrage dans l'ordre : langue enregistrée
(`localStorage['lang']`) → langue du navigateur (`en*` / `fr*`) → français par défaut, et
SHALL persister tout changement de langue.

#### Scenario: Persistance après rechargement
- GIVEN l'utilisateur bascule en anglais
- WHEN la page est rechargée
- THEN l'interface se charge en anglais et `localStorage['lang']` vaut `"en"`

#### Scenario: Détection navigateur au premier lancement
- GIVEN aucune langue enregistrée et un navigateur en anglais
- WHEN l'application démarre
- THEN la langue initiale est l'anglais

### Requirement: Bascule de langue
Le système SHALL proposer une bascule FR ↔ EN depuis la barre transversale, mettant à jour
immédiatement les libellés traduits.

#### Scenario: Bascule immédiate
- GIVEN l'interface en français
- WHEN l'utilisateur active la bascule de langue
- THEN les libellés traduits passent en anglais sans rechargement

### Requirement: Transmission de la langue aux endpoints IA
Le système SHALL joindre la langue UI courante aux appels de génération IA, dans le corps de
la requête (via `withLangBody`) ou en paramètre de requête (via `withLangParams`).

#### Scenario: Langue dans le corps
- GIVEN la langue UI est l'anglais
- WHEN l'utilisateur déclenche `proposeDisciplineFromWish`
- THEN le corps de la requête inclut `lang: "en"`

### Requirement: Contenu API non traduit côté client
Le système SHALL afficher tel quel le contenu métier renvoyé par l'API (thèmes, notions),
la traduction ne portant que sur les libellés d'interface.

#### Scenario: Contenu métier issu de l'API
- GIVEN des thèmes renvoyés par l'API
- WHEN l'interface les affiche
- THEN leur libellé n'est pas traduit côté client (seule la coque UI est traduite)
