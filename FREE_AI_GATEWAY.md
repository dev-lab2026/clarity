# CLARITY PM — FREE ONLY AI Gateway

This build intentionally removes Google/Gmail OAuth from the AI Gateway.

Supported routable providers:
- Gemini
- Groq
- Mistral
- OpenRouter models explicitly ending in `:free`

OpenAI and Anthropic are not routable in this build. Existing OpenAI/Anthropic rows are automatically disabled at startup.

## 429 handling
- A temporary HTTP 429 disables that account for 60 seconds, then it can be retried.
- A billing/credit/quota 429 (for example `no credits remaining`) permanently disables that account until an administrator re-enables/recreates it.
- The router immediately falls back to the next free account/provider.
- No infinite retry loop is used.

## Admin
Administration → AI Provider Hub → FREE ONLY.
Add multiple accounts and models. Credentials are encrypted server-side with `AI_CONFIG_SECRET` (or `JWT_SECRET` fallback).

## Environment
Required:
- `APP_URL`
- `JWT_SECRET`
- `AI_CONFIG_SECRET` (recommended)

No Google OAuth variables are required by this gateway.
