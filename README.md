# Clarity PM

Clarity PM est un cockpit de pilotage de projets et de portefeuille, conçu pour centraliser :
- suivi de projet
- tâches et jalons
- risques
- charge des équipes
- indicateurs EVM (PV, EV, AC, SPI, CPI)
- intégration IA pour l’aide au pilotage
- administration des profils et de la configuration

Le projet est construit avec React + Vite côté front, Express + TypeScript côté API, et PostgreSQL pour la persistance (avec un mode mémoire de secours).

## Fonctionnalités principales

- Tableau de bord KPI et santé de projet
- Gestion de tâches, jalons et risques
- Vue Kanban, Gantt et liste
- Vue portefeuille / PMO
- Gestion des utilisateurs et des rôles
- Authentification Microsoft Entra / OAuth
- Import de projets et de données JSON
- Copilot IA / assistant de projet
- Intégration de fournisseurs IA (Gemini, OpenAI compatible, etc.)
- Audit trail et journaux d’activité

## Stack technique

- Frontend : React 19, Vite, TypeScript
- Backend : Node.js, Express
- Base de données : PostgreSQL
- IA : intégration multi-provider via gateway configurable
- Sécurité : OAuth, session cookie, RBAC
- Visualisation : Recharts, motion

## Prérequis

- Node.js 18+
- npm ou bun
- PostgreSQL optionnel selon le mode d’exécution
- Variables d’environnement pour l’authentification et l’IA

## Installation

```bash
npm install
```

## Configuration

Copiez le fichier d’exemple d’environnement si nécessaire :

```bash
cp .env.example .env
```

Les variables courantes incluent :
- PORT
- DATABASE_URL ou POSTGRES_HOST / POSTGRES_DB / POSTGRES_USER / POSTGRES_PASSWORD
- MICROSOFT_CLIENT_ID
- MICROSOFT_CLIENT_SECRET
- MICROSOFT_TENANT_ID
- APP_URL
- JWT_SECRET
- ADMIN_EMAILS
- DIRECTOR_EMAILS
- PMO_EMAILS
- LOCAL_ADMIN_EMAIL / LOCAL_ADMIN_PASSWORD (pour l’admin local)
- paramètres IA (provider, model, clé API, base URL, etc.)

## Démarrage

Mode développement :

```bash
npm run dev
```

Build de production :

```bash
npm run build
```

Lancement de la version buildée :

```bash
npm start
```

## Structure du dépôt

```text
.
├── src/
│   ├── components/
│   ├── data/
│   ├── db/
│   ├── utils/
│   ├── App.tsx
│   ├── types.ts
│   ├── ai_gateway.ts
│   ├── ai_router.ts
│   └── server_ai_config.ts
├── server.ts
├── package.json
├── tsconfig.json
├── vite.config.ts
├── Dockerfile
├── docker-compose.yml
├── README.md
├── .env.example
└── docs/
```

## Rôles applicatifs

- DIRECTEUR_PROJETS : création/suppression de projets, accès portfolio
- CHEF_PROJET : gestion des projets et tâches assignées
- PMO : supervision portfolio et gouvernance
- CONTRIBUTEUR : mise à jour des tâches assignées
- ADMINISTRATEUR : administration système et configuration IA

## Sécurité et gouvernance

Le back-end applique des contrôles d’accès par rôle, des filtres sur les projets selon la visibilité utilisateur, ainsi qu’un système d’audit pour tracer les actions critiques.

## Développement

### Vérification TypeScript

```bash
npm run lint
```

### Nettoyage build

```bash
npm run clean
```

## Notes

Le dépôt contient un jeu de données d’exemple pour démontrer les écrans de gestion de projet sans avoir besoin d’une base fonctionnelle au démarrage.

## License

Le projet est fourni à des fins de démonstration et de développement interne. Vérifier les règles internes de votre organisation avant toute mise en production.
