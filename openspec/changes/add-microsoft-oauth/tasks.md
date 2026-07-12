# Tasks — Frontend

## 1. UI de connexion
- [x] 1.1 Ajouter un bouton « Se connecter avec Microsoft » sur `LoginComponent` (logo + libellé i18n)
- [x] 1.2 Ajouter les clés i18n FR/EN (`login.microsoftSignIn`, messages d'erreur OAuth)
- [x] 1.3 Au clic, rediriger la page vers `${baseUrl}/auth/microsoft/login`

## 2. Retour de connexion & session
- [x] 2.1 Ajouter `getSession()` / `logout()` dans `ApiService` (`GET /auth/session`, `POST /auth/logout`, `withCredentials: true`)
- [ ] 2.2 Au retour sur `/`, lire la session pour confirmer la connexion et afficher l'utilisateur (différé : protection de routes hors périmètre de ce change)
- [x] 2.3 Afficher un message d'erreur si le retour indique un échec (paramètre d'erreur)

## 3. Cohérence
- [x] 3.1 S'assurer que les requêtes authentifiées envoient le cookie (`withCredentials`)
- [x] 3.2 Vérifier le comportement CORS avec credentials côté backend
