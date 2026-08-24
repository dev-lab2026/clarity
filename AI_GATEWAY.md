# AI Gateway — OAuth uniquement

## Google / Gemini


Variables serveur :

```env
APP_URL=https://clarity.ferjani.duckdns.org
AI_CONFIG_SECRET=
```

Redirect URI Google :

```text
https://clarity.ferjani.duckdns.org/auth/google/gemini/callback
```

Routes :

```text
GET  /api/admin/ai/oauth/google/start
GET  /auth/google/gemini/callback
GET  /api/admin/ai/gateway/providers
POST /api/admin/ai/gateway/test
DELETE /api/admin/ai/gateway/providers/:id
```

Le refresh token et l'access token sont chiffrés côté serveur. Le Gateway renouvelle l'access token automatiquement puis appelle Gemini avec OAuth Bearer.

## Microsoft

Assistant PM conserve la connexion Microsoft via MSAL/OAuth utilisateur. Le mot de passe Microsoft ne transite pas par CLARITY.

## OpenAI / Anthropic

Pas de faux « login compte personnel → token API ». Une connexion personnelle à ChatGPT/Claude ne donne pas automatiquement à une application tierce le droit d'appeler leur API. Aucun mot de passe n'est collecté.
