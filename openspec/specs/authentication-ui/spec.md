# Authentication UI Specification

## Purpose
Interface de connexion, d'inscription et de réinitialisation de mot de passe
(`LoginComponent`, route `/login`). La connexion classique ne persiste **ni jeton ni
session** : c'est une vérification d'identifiants suivie d'une redirection. La page
comporte trois modes : `login`, `register` et `reset`.

## Requirements

### Requirement: Formulaire de connexion
Le système SHALL proposer un formulaire de connexion avec email (requis, format email) et
mot de passe (requis), appeler `POST /auth/login`, afficher un état de chargement, et
rediriger vers `/` en cas de succès sans stocker de jeton ni de session.

#### Scenario: Connexion réussie
- GIVEN des identifiants valides
- WHEN l'utilisateur soumet le formulaire de connexion
- THEN un message de succès s'affiche et l'utilisateur est redirigé vers `/`
- AND aucun jeton ni session n'est stocké en localStorage/sessionStorage

#### Scenario: Mot de passe incorrect
- GIVEN un email connu et un mot de passe erroné
- WHEN l'utilisateur soumet le formulaire
- THEN le champ mot de passe est mis en évidence et un message d'erreur s'affiche
- AND l'utilisateur reste sur `/login`

#### Scenario: Validation bloquante
- GIVEN un email vide ou mal formé
- WHEN l'utilisateur clique sur soumettre
- THEN les erreurs de validation s'affichent et aucun appel API n'est effectué

#### Scenario: Lien vers l'inscription
- GIVEN le mode connexion
- WHEN l'utilisateur clique sur « Créer un compte »
- THEN le mode inscription s'affiche

### Requirement: Réinitialisation de mot de passe
Le système SHALL proposer un mode réinitialisation (email, nouveau mot de passe ≥ 6,
confirmation) appelant `POST /auth/reset_password`, avec vérification de correspondance des
mots de passe côté client.

#### Scenario: Réinitialisation réussie
- GIVEN le mode réinitialisation avec email et mots de passe correspondants (≥ 6)
- WHEN l'utilisateur soumet
- THEN la réinitialisation réussit et l'utilisateur revient au mode connexion avec l'email pré-rempli

#### Scenario: Mots de passe non concordants
- GIVEN le mode réinitialisation
- WHEN la confirmation diffère du nouveau mot de passe
- THEN le champ de confirmation affiche une erreur et aucun appel API n'est effectué

#### Scenario: Email inconnu à la réinitialisation
- GIVEN le backend renvoie `email_not_found`
- WHEN la réinitialisation est soumise
- THEN le champ email est mis en évidence et l'erreur est affichée

### Requirement: Restitution des erreurs serveur structurées
Le système SHALL interpréter le `detail` structuré (`{ code, message }`) renvoyé par le
backend pour cibler le champ concerné et afficher un message approprié
(`email_not_found`, `invalid_password`, `email_already_exists`), avec repli sur un message
générique en cas d'erreur réseau.

#### Scenario: Mappage d'un code d'erreur
- GIVEN une réponse d'erreur avec `detail.code = "invalid_password"`
- WHEN l'erreur est traitée
- THEN le champ mot de passe est signalé avec le message correspondant

#### Scenario: Erreur réseau
- GIVEN le service est indisponible
- WHEN une soumission échoue sans code métier
- THEN un message générique « Service indisponible » s'affiche

### Requirement: Inscription depuis la page de connexion
Le système SHALL proposer un mode inscription accessible via un lien « Créer un compte »
depuis le mode connexion. Le formulaire SHALL comporter email (requis, format email),
mot de passe (requis, ≥ 6 caractères) et confirmation du mot de passe, avec vérification
de correspondance côté client. Il SHALL appeler `POST /auth/register` et, en cas de
succès, revenir au mode connexion avec l'email pré-rempli et un message de succès.

#### Scenario: Inscription réussie
- GIVEN le mode inscription avec email valide et mots de passe correspondants (≥ 6)
- WHEN l'utilisateur soumet le formulaire
- THEN `POST /auth/register` est appelé
- AND l'utilisateur revient au mode connexion avec l'email pré-rempli
- AND un message de succès invite à se connecter

#### Scenario: Email déjà utilisé
- GIVEN le backend renvoie `email_already_exists`
- WHEN l'inscription est soumise
- THEN le champ email est mis en évidence et l'erreur est affichée
- AND l'utilisateur reste en mode inscription

#### Scenario: Mots de passe non concordants à l'inscription
- GIVEN le mode inscription
- WHEN la confirmation diffère du mot de passe
- THEN le champ de confirmation affiche une erreur et aucun appel API n'est effectué

#### Scenario: Accès au mode inscription
- GIVEN le mode connexion
- WHEN l'utilisateur clique sur « Créer un compte »
- THEN le formulaire d'inscription s'affiche avec le sous-titre approprié
