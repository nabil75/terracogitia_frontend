# Proposal — Formulaire d'inscription sur la page login

## Intent
Permettre aux utilisateurs de créer un compte email/mot de passe depuis l'interface,
sans passer par l'API Swagger ou curl. Le backend expose déjà `POST /auth/register` ;
seule l'UI manquait.

## Scope
- Lien « Créer un compte » sur le mode connexion
- Mode `register` avec formulaire email + mot de passe + confirmation
- Appel `POST /auth/register`, gestion des erreurs structurées
- Retour au mode connexion après succès

## Non-goals
- Connexion automatique après inscription
- Vérification d'email par message
- Protection de routes
