# Intégration CLARITY PM ↔ Microsoft Copilot Studio

## Configuration

Dans Copilot Studio : **Canaux → Application mobile** puis copier **Point de terminaison du jeton**.

Mettre cette valeur côté serveur :

```env
COPILOT_AGENT_ID=cr299_clarity_tB6p_X
COPILOT_ENVIRONMENT_ID=Default-1d593042-a69d-49e0-8d1c-0daf8ac1717b
COPILOT_TENANT_ID=<Tenant ID Entra>
COPILOT_DIRECTLINE_TOKEN_ENDPOINT=<Token Endpoint Copilot Studio>
CLARITY_API_KEY=<clé secrète générée pour CLARITY>
```

Le token Direct Line n'est jamais exposé au navigateur. Le serveur CLARITY l'obtient puis appelle Direct Line.

## Flux

1. L'utilisateur ouvre l'Assistant PM CLARITY.
2. CLARITY envoie les fichiers au backend.
3. Le backend extrait le contenu et l'envoie à l'agent Copilot Studio via Direct Line.
4. Copilot retourne une réponse JSON avec `reply`, `analysis` et `actions`.
5. CLARITY normalise les actions et les stocke comme propositions.
6. L'utilisateur doit valider les propositions avant écriture dans PostgreSQL.
7. Pour un appel service-à-service depuis un plugin/action Copilot Studio, utiliser `POST /api/copilot/actions` avec `Authorization: Bearer <CLARITY_API_KEY>`.

## Sécurité

- Ne jamais mettre `COPILOT_DIRECTLINE_TOKEN_ENDPOINT` ou `CLARITY_API_KEY` dans `VITE_*`.
- Ne jamais mettre le secret Direct Line dans React.
- L'endpoint `/api/copilot/actions` exige la clé API.
- Les modifications proposées dans l'interface ne sont pas écrites avant validation explicite.
