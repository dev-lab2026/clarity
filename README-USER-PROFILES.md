# CLARITY PM — Gestion des profils utilisateurs

Cette version ajoute une gestion complète des profils depuis **Administration → Profils utilisateurs**.

## Fonctionnalités

- CREATE : créer un profil avec email, nom, rôle, poste, département, localisation et Object ID Entra.
- READ : lister et rechercher les profils.
- UPDATE : modifier les informations et le rôle.
- ACTIVATE / DEACTIVATE : activer ou désactiver un profil.
- DELETE : supprimer un profil.
- Protection RBAC : seules les personnes avec le rôle `ADMINISTRATEUR` accèdent au CRUD.
- Protection du dernier administrateur actif : impossible de supprimer ou désactiver le dernier administrateur actif.
- Association Entra ID : à la connexion, le profil existant est retrouvé par Object ID Entra ou email.
- Par défaut, l'auto-provisionnement Entra est désactivé : un administrateur doit créer/autoriser le profil avant la première connexion.

## Variables supplémentaires

```env
AUTO_PROVISION_USERS=false
DEFAULT_USER_ROLE=CHEF_PROJET
```

Pour autoriser la création automatique au premier login Entra :

```env
AUTO_PROVISION_USERS=true
DEFAULT_USER_ROLE=CHEF_PROJET
```

## Déploiement

Conserver le `.env` existant de la VM. Ne pas l'écraser avec `.env.example`.

```bash
docker compose build --no-cache
docker compose up -d --force-recreate
```

Le compose de cette version utilise **uniquement `shared_network`**. Aucun réseau `backend` ou `frontend` n'est créé.

## Test CRUD automatisé

Après le déploiement :

```bash
chmod +x scripts/test-user-crud.sh
./scripts/test-user-crud.sh
```

Le test vérifie : health check, login admin, CREATE, READ, UPDATE, désactivation, activation et DELETE.

## Important

Le compte `admin@local` reste géré par `LOCAL_ADMIN_*` et n'est pas supprimable depuis le CRUD. Il sert de compte de secours pour l'administration initiale.
