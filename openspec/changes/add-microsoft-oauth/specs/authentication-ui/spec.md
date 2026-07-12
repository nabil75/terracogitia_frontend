# Authentication UI Delta — Microsoft Sign-In

## ADDED Requirements

### Requirement: Bouton de connexion Microsoft
Le système SHALL afficher sur l'écran de connexion un bouton « Se connecter avec Microsoft »,
en complément du formulaire email/mot de passe, qui redirige le navigateur (redirection pleine
page) vers l'endpoint backend `GET /auth/microsoft/login`.

#### Scenario: Déclenchement du flux Microsoft
- GIVEN l'utilisateur est sur `/login`
- WHEN il clique sur « Se connecter avec Microsoft »
- THEN le navigateur est redirigé vers `${baseUrl}/auth/microsoft/login`
- AND aucun jeton ni secret n'est manipulé côté client

### Requirement: Retour de connexion et lecture de session
Le système SHALL, au retour du flux OAuth sur le frontend, lire l'état de session
(`GET /auth/session`, avec credentials) afin de confirmer la connexion, et afficher un message
d'erreur si le retour signale un échec.

#### Scenario: Connexion Microsoft réussie
- GIVEN le backend a établi une session après le flux OIDC
- WHEN l'utilisateur revient sur l'application
- THEN `GET /auth/session` renvoie l'utilisateur courant et l'état connecté est affiché

#### Scenario: Échec de connexion Microsoft
- GIVEN le retour de redirection indique un échec (consentement refusé ou erreur)
- WHEN l'écran de connexion se rend
- THEN un message d'erreur OAuth est affiché et l'utilisateur reste sur `/login`
