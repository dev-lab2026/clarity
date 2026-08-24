# Guide de Déploiement en Production Docker — Clarity PM

Ce document détaille la procédure standardisée pour construire, configurer et déployer l'image Docker de **Clarity PM** en environnement de production (Docker autonome, Docker Compose, Kubernetes, Azure Container Apps, AWS ECS, Google Cloud Run).

---

## 1. Architecture du Conteneur

L'image Docker de Clarity PM utilise un patron **Multi-Stage Build** garantissant une sécurité maximale, une taille d'image réduite (< 150 Mo) et des performances optimales.

- **Stage 1 (Builder)** :
  - Image de base : `node:22-alpine`
  - Compilation du frontend React (Vite) en fichiers statiques optimisés dans `/app/dist`.
  - Empaquetage du serveur Express TypeScript en un bundle CommonJS autonome (`/app/dist/server.cjs`) via `esbuild`.
- **Stage 2 (Runner)** :
  - Image minimale Alpine Linux avec le runtime Node.js 22.
  - Dépendances de production uniquement.
  - Gestionnaire de signaux PID 1 via `tini` (évite les processus zombies et garantit un arrêt propre `SIGTERM`).
  - Exécution sous utilisateur système non privilégié (`USER node`).
  - Sonde de santé intégrée (`HEALTHCHECK`) interrogeant `http://localhost:3000/api/health`.

---

## 2. Fichiers Inclus dans le Projet

| Fichier | Rôle |
|---|---|
| `Dockerfile` | Définition de l'image de conteneur multi-stage |
| `docker-compose.yml` | Stack complète orchestrant l'application et PostgreSQL 16 |
| `.dockerignore` | Exclusion des dossiers lourds (`node_modules`, `.git`, caches) |
| `src/db/schema.sql` | Schéma DDL relationnel pour l'initialisation de PostgreSQL |
| `.env.example` | Gabarit des variables d'environnement de production |

---

## 3. Déploiement Rapide avec Docker Compose (Recommandé)

Le fichier `docker-compose.yml` démarre à la fois **Clarity PM** et une instance **PostgreSQL 16** persistante avec initialisation automatique du schéma de données.

```bash
# 1. Cloner ou naviguer dans le dossier du projet
cd clarity-pm

# 2. Configurer les variables d'environnement (optionnel)
cp .env.example .env

# 3. Construire et lancer la stack en arrière-plan
docker compose up -d --build

# 4. Vérifier l'état des conteneurs
docker compose ps

# 5. Consulter les journaux en direct
docker compose logs -f app
```

L'application est immédiatement accessible sur **`http://localhost:3000`** et la base PostgreSQL sur le port `5432`.

---

## 4. Construction et Exécution Manuelle de l'Image Docker

### 4.1. Construction de l'image (Build)
```bash
docker build -t clarity-pm:latest .
```

### 4.2. Lancement du conteneur en mode autonome
```bash
docker run -d \
  --name clarity_pm_app \
  -p 3000:3000 \
  -e NODE_ENV=production \
  -e DATABASE_URL="postgresql://user:password@your-postgres-host:5432/clarity_pm_enterprise" \
  -e GEMINI_API_KEY="votre_cle_gemini" \
  --restart unless-stopped \
  clarity-pm:latest
```

### 4.3. Commandes de maintenance
```bash
# Inspecter la santé du conteneur
docker inspect --format='{{json .State.Health}}' clarity_pm_app

# Arrêter le conteneur
docker stop clarity_pm_app

# Redémarrer
docker restart clarity_pm_app
```

---

## 5. Variables d'Environnement de Production

| Variable | Obligatoire | Description | Exemple |
|---|---|---|---|
| `NODE_ENV` | Oui | Mode d'exécution | `production` |
| `PORT` | Non | Port d'écoute interne (défaut : 3000) | `3000` |
| `DATABASE_URL` | Oui | Chaîne de connexion PostgreSQL | `postgresql://user:pwd@host:5432/dbname` |
| `POSTGRES_SSL` | Non | Mode SSL PostgreSQL (`require` ou `disable`) | `require` |
| `GEMINI_API_KEY` | Recommandé | Clé d'API Google Gemini pour l'assistant IA Copilot | `AIzaSy...` |
| `MICROSOFT_CLIENT_ID` | Optionnel | Azure Entra ID Application Client ID | `xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx` |
| `MICROSOFT_CLIENT_SECRET` | Optionnel | Secret d'application Entra ID | `secret_value` |
| `MICROSOFT_TENANT_ID` | Optionnel | ID de l'annuaire Azure AD | `common` ou ID du Tenant |

---

## 6. Déploiement sur le Cloud

### A. Microsoft Azure (Azure Container Apps)
```bash
# Connexion à Azure
az login

# Déploiement direct depuis le code source
az containerapp up \
  --name clarity-pm \
  --resource-group rg-clarity-prod \
  --location westeurope \
  --source . \
  --target-port 3000 \
  --ingress external \
  --env-vars DATABASE_URL=secretref:db-conn-string
```

### B. Google Cloud (Cloud Run)
```bash
gcloud run deploy clarity-pm \
  --source . \
  --platform managed \
  --region europe-west1 \
  --allow-unauthenticated \
  --port 3000 \
  --set-env-vars="NODE_ENV=production"
```

### C. Amazon Web Services (AWS ECS / Fargate)
1. Créer un dépôt sur Amazon ECR : `aws ecr create-repository --repository-name clarity-pm`.
2. Tagger et pusher l'image construite : `docker push <account-id>.dkr.ecr.<region>.amazonaws.com/clarity-pm:latest`.
3. Définir une `Task Definition` ECS avec le conteneur exposé sur le port 3000 et relié à Amazon RDS for PostgreSQL.

## Sécurité — configuration obligatoire

En production, les éléments suivants sont obligatoires :

- `JWT_SECRET` : secret aléatoire long (au moins 32 octets).
- `DATABASE_URL` ou `POSTGRES_*` : PostgreSQL persistant.
- `REQUIRE_DATABASE=true` : refuse le démarrage sans base.
- `MICROSOFT_CLIENT_ID`, `MICROSOFT_CLIENT_SECRET`, `MICROSOFT_TENANT_ID`, `APP_URL` : SSO Entra ID.
- `DEMO_MODE=false` : le mode démo doit rester désactivé.
- `ADMIN_EMAILS`, `DIRECTOR_EMAILS`, `PMO_EMAILS` : correspondances de rôles gérées côté serveur.

Les rôles ne sont plus acceptés via des headers HTTP ou par le navigateur. Les mots de passe Microsoft ne sont jamais reçus ni stockés par l'application. Les données métier et les journaux d'audit sont persistés dans PostgreSQL lorsqu'il est configuré.
