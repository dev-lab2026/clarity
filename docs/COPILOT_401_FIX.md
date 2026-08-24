# CLARITY PM — Microsoft 365 Copilot 401 fix

## Root cause addressed
The Microsoft 365 Copilot Chat API requires a delegated Microsoft Graph access token containing **all seven** required delegated scopes. A cached MSAL token can predate the admin consent and therefore be missing scopes, even though the Azure app registration is now correct.

The frontend now inspects the Graph access token (`aud` + `scp`) and forces an interactive consent flow when the cached token is not a Graph token with all seven Copilot scopes.

The backend independently validates the token before calling Copilot and returns diagnostics instead of hiding the failure behind a generic 500.

## Required scopes
- Sites.Read.All
- Mail.Read
- People.Read.All
- OnlineMeetingTranscript.Read.All
- Chat.Read
- ChannelMessage.Read.All
- ExternalItem.Read.All

## Deployment
```bash
docker compose down
docker compose build --no-cache
docker compose up -d
docker compose logs --tail=200 app
```

Then open the site in a private window and sign in again.

The app uses the SPA redirect URI:
`https://clarity.ferjani.duckdns.org/`

## Important
The Microsoft 365 Copilot Chat API is a Microsoft Graph `/beta` API and requires an eligible work/school Microsoft 365 Copilot user. Application permissions are not supported for this API.
