# Proposal: Connexion Microsoft — UI (OAuth 2.0 / OIDC)

## Intent
Ajouter à l'écran de connexion un bouton « Se connecter avec Microsoft » qui déclenche le flux
OIDC orchestré par le backend, et gérer le retour de redirection après authentification.

Changement coordonné avec le changement backend de même nom (`add-microsoft-oauth`), qui porte
le cœur du flux OIDC et la session serveur.

## Scope
Dans le périmètre :
- Bouton « Se connecter avec Microsoft » sur `LoginComponent`, en complément du formulaire
  email/mot de passe existant.
- Déclenchement de la redirection vers `GET /auth/microsoft/login` du backend.
- Gestion du retour post-connexion (redirection vers `/`, lecture de la session via
  `GET /auth/session`).
- Affichage d'un message d'erreur si le retour signale un échec (consentement refusé, etc.).

Hors périmètre :
- Autres fournisseurs.
- Protection de routes / guards (aujourd'hui inexistants) — décision différée.
- Refonte de la connexion email/mot de passe.

## Approach
Le bouton redirige le navigateur vers l'endpoint backend `GET /auth/microsoft/login` (pas
d'appel XHR : redirection pleine page pour le flux OAuth). Au retour sur le frontend, l'app lit
l'état de session (`GET /auth/session`) pour confirmer la connexion et afficher l'utilisateur.
Le frontend ne manipule ni le client secret ni les jetons Microsoft.

## Décisions figées (côté backend, pour rappel)
Le design backend (`add-microsoft-oauth`) est figé. Impacts pour le frontend :
- **Session** : cookie httpOnly géré par le backend (jeton signé sans état, TTL 8 h). Le
  frontend n'accède pas au jeton ; toutes les requêtes authentifiées doivent utiliser
  `withCredentials: true`.
- **Audience** : comptes Microsoft personnels + pro/scolaires (`common`). Aucun impact UI.
- **Connexion classique inchangée** : le formulaire email/mot de passe reste tel quel ; le
  bouton Microsoft s'ajoute à côté.
- **Pas de protection de route** dans ce périmètre : `/login` reste optionnel ; `GET /auth/session`
  sert seulement à afficher l'état connecté.
- **Email non vérifié** : le backend refuse la connexion (401) ; l'UI affiche alors le message
  d'échec OAuth au retour de redirection.
