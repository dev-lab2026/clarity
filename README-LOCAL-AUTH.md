# CLARITY PM — authentification locale + Microsoft Entra ID

Cette version ajoute un accès administrateur local en parallèle de Microsoft Entra ID.

## Premier accès

Le fichier `.env` contient un compte de démarrage :

- Email: `admin@local`
- Mot de passe: `ChangeMeNow!2026`

**Changez immédiatement `LOCAL_ADMIN_PASSWORD` et `JWT_SECRET` avant une exposition Internet.**

## Variables

```env
LOCAL_ADMIN_ENABLED=true
LOCAL_ADMIN_EMAIL=admin@local
LOCAL_ADMIN_PASSWORD=CHANGE_ME
LOCAL_ADMIN_NAME=Administrateur CLARITY PM
```

Pour désactiver le login local après la configuration Entra ID :

```env
LOCAL_ADMIN_ENABLED=false
```

## Microsoft Entra ID

Les variables existantes restent disponibles :

```env
MICROSOFT_CLIENT_ID=
MICROSOFT_CLIENT_SECRET=
MICROSOFT_TENANT_ID=common
APP_URL=https://votre-domaine.example.com
COOKIE_SECURE=true
```

Le callback Microsoft est :

```text
https://votre-domaine.example.com/auth/microsoft/callback
```

## Docker

Le compose expose aussi temporairement le port 3000 pour le premier test :

```bash
docker compose build
docker compose up -d
docker compose ps
docker compose logs --tail=100 app
```

Test :

```text
http://IP_VM:3000
```

Le réseau Docker externe `shared_network` doit déjà exister pour que Nginx Proxy Manager puisse joindre `prometric-app:3000`.

Vérifier :

```bash
docker network inspect shared_network
```

Dans Nginx Proxy Manager, utilisez ensuite :

```text
Scheme: http
Forward Hostname: prometric-app
Forward Port: 3000
```
