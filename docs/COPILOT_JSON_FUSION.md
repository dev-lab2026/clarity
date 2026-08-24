# CLARITY — Fusion Assistant PM + JSON + session utilisateur

Le Copilot Projet utilise la session CLARITY de l'utilisateur connecté. L'adresse e-mail n'est pas une preuve d'identité envoyée par le navigateur : le serveur lit `pm_session` et utilise `user.id`, `user.email` et `user.role`.

## Flux

1. L'utilisateur se connecte à CLARITY.
2. Assistant PM reçoit les fichiers XLSX/PDF/DOCX/JSON.
3. Le moteur IA compare les documents au projet courant.
4. Les actions sont normalisées en propositions CLARITY.
5. `GET /api/projects/:id/copilot/update.json` génère `clarity.pm.project-update.v1`.
6. Rien n'est écrit pendant l'analyse.
7. L'utilisateur valide les propositions dans Assistant PM.
8. `POST /api/projects/:id/copilot/apply` applique uniquement les `proposalIds` conservés côté serveur.

## Import d'un JSON généré

Le même format `clarity.pm.project-update.v1` peut être chargé dans **Import JSON CLARITY**. Le serveur vérifie :

- le schéma et la version ;
- le `project.id` exact ;
- l'accès de l'utilisateur au projet ;
- les droits CRUD ;
- l'existence des identifiants pour les updates ;
- l'absence d'ID imposé pour les créations.

L'endpoint d'application est `POST /api/projects/:id/copilot/apply-json` et exige `confirmed: true`.

## Microsoft 365 Copilot

Le composant Microsoft 365 Copilot utilise le compte Microsoft correspondant à l'utilisateur connecté comme `loginHint` et conserve la session CLARITY comme autorité pour le projet et les droits. Lors de l'application, le navigateur envoie explicitement les `proposalIds` avec `credentials: include`.
