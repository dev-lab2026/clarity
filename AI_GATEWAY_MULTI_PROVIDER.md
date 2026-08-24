# CLARITY PM — AI Gateway multi-provider

Cette version intègre le principe de NexusAI directement dans CLARITY, sans ajouter une seconde application.

## Architecture

Assistant PM -> AI Gateway -> routage intelligent -> comptes/providers -> modèle -> réponse -> validation utilisateur -> CRUD CLARITY.

### Routage
- document : Gemini > Claude > OpenAI > Mistral > OpenRouter > Groq
- reasoning : Claude > OpenAI > Gemini > Mistral > OpenRouter > Groq
- coding : Claude > OpenAI > Gemini > Mistral > Groq > OpenRouter
- fast : Groq > Gemini > Mistral > OpenAI > Claude > OpenRouter
- chat : OpenAI > Gemini > Claude > Mistral > Groq > OpenRouter

En cas de 401/403/404/429/5xx ou réponse vide, le compte suivant est essayé automatiquement.

## Comptes
Google/Gemini peut être connecté par OAuth : le mot de passe reste chez Google.
Pour OpenAI, Anthropic, Groq, Mistral et OpenRouter, CLARITY accepte une credential serveur chiffrée parce qu'un login personnel sur leur site ne fournit pas automatiquement un token API à une application tierce.

## Sécurité
Les credentials sont chiffrées AES-256-GCM avec `AI_CONFIG_SECRET` ou `JWT_SECRET` et ne sont jamais renvoyées au navigateur.

## Assistant PM
Les fichiers sont extraits techniquement (Excel/PDF/DOCX/JSON/TXT), puis leur contenu est envoyé au Gateway pour le raisonnement sémantique. L'IA propose des actions; le CRUD n'est exécuté qu'après validation utilisateur.
