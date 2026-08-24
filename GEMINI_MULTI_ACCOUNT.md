# Gemini Free Multi-Account Gateway

## Fonctionnement

- Plusieurs comptes/projets Gemini peuvent être ajoutés dans **Administration → AI Provider Hub**.
- Chaque API key est chiffrée AES-256-GCM côté serveur.
- Le navigateur ne reçoit jamais la clé.
- Le routeur privilégie la priorité puis le compte le moins récemment utilisé.
- HTTP 429 met le compte en refroidissement temporaire.
- HTTP 404 sur un modèle met ce compte en refroidissement 6 h au lieu de bloquer tout le pool.
- Une erreur de billing désactive le compte concerné.

## Important sur le Free Tier

Google applique les limites de débit **par projet**, pas par clé API. Plusieurs clés dans le même projet ne multiplient donc pas le quota. Pour plusieurs pools indépendants, utilisez des projets Google distincts. Voir la documentation officielle Gemini API.

## Modèles

Le catalogue intégré contient les modèles Gemini API actuels, les modèles preview et les modèles historiques arrêtés. Le mode FREE ONLY n'autorise à l'ajout que les modèles que le catalogue marque `freeTier=true`.

## Variables

```env
AI_CONFIG_SECRET=une-longue-valeur-secrete
JWT_SECRET=une-autre-longue-valeur-secrete
```

`AI_CONFIG_SECRET` est recommandé pour chiffrer les credentials du gateway.
