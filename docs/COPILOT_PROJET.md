# CLARITY PM — Copilot Projet avec fichiers

Le Copilot Projet utilise exclusivement le moteur **OpenAI Responses** pour analyser les fichiers et raisonner sur le projet courant. Il n'y a **aucune analyse locale de document et aucun fallback Gemini** pour le Copilot.

## Identité automatique

Le navigateur envoie uniquement la session CLARITY. Le serveur récupère automatiquement `id`, `email`, `displayName` et `role` de l'utilisateur connecté et les associe au contexte du Copilot. L'utilisateur n'a jamais à saisir son e-mail dans le chat.

## Analyse d'un fichier

Quand l'utilisateur joint un fichier :

1. CLARITY reçoit le fichier en mémoire côté serveur.
2. Le serveur l'envoie à l'API Files OpenAI.
3. Le fichier est attaché directement à une requête **Responses API** avec `input_file`.
4. Le prompt contient le projet actuel, ses tâches/jalons/risques, l'identité du compte connecté et l'historique Copilot.
5. OpenAI analyse réellement le document et retourne une réponse structurée.
6. Les fichiers temporaires sont supprimés côté OpenAI après la requête.

## Analyse attendue

Pour un XLSX, le Copilot doit examiner toutes les feuilles et rechercher les tâches, jalons, risques, dates, budgets, responsables, décisions, livrables, dépendances, contradictions, doublons et informations manquantes. Il doit citer les sources lorsqu'elles sont disponibles.

## Conversation

Après une première analyse, les informations structurées retournées par OpenAI sont mémorisées pour le couple `projet + utilisateur`. Un message comme « sortir les éléments » ou « ajoute les tâches » peut donc s'appuyer sur le contexte précédent sans demander de joindre à nouveau le fichier.

## Actions projet

Le Copilot peut proposer : `update_project`, `add_task`, `update_task`, `add_milestone`, `update_milestone`, `add_risk`, `update_risk`. Les écritures passent par les contrôles RBAC CLARITY. Le Copilot ne supprime jamais automatiquement un élément.

## Configuration

Dans Administration → IA :

- Fournisseur : **OpenAI / compatible API**
- URL : `https://api.openai.com/v1`
- Modèle : un modèle OpenAI Responses compatible avec votre compte
- Clé API : stockée côté serveur et chiffrée en base

L'abonnement ChatGPT du compte connecté n'est pas automatiquement utilisable comme clé API. La connexion du compte sert à identifier l'utilisateur et à appliquer ses droits ; la clé API OpenAI reste une configuration serveur.


## Architecture 2026 — Microsoft Copilot Studio
Le chat Copilot Projet est désormais rendu par Microsoft Copilot Studio via le SDK Microsoft Agents et Microsoft Entra ID. Les clés OpenAI/Gemini ne sont pas utilisées par ce chat.
