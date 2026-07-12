# Authentication UI — Delta

## ADDED Requirements

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

## MODIFIED Requirements

### Requirement: Formulaire de connexion
Le système SHALL proposer un formulaire de connexion avec email (requis, format email) et
mot de passe (requis), appeler `POST /auth/login`, afficher un état de chargement, et
rediriger vers `/` en cas de succès sans stocker de jeton ni de session. Un lien
« Créer un compte » SHALL basculer vers le mode inscription.

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
