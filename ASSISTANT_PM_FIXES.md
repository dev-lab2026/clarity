# Assistant PM — correctifs v8

- L'analyse du Copilot est strictement en lecture seule : aucune opération CRUD projet n'est appelée pendant la génération des propositions.
- `/copilot/apply` n'accepte désormais que des `proposalIds` déjà enregistrés côté serveur ; les objets d'actions envoyés par le navigateur sont refusés.
- Vérification du `targetProjectId` avant toute application.
- Ajout d'une vraie prévisualisation côté UI ; elle n'applique rien.
- Réduction forte de la taille du contexte envoyé au modèle : projet compact, historique limité, documents mémorisés tronqués pour les relances.
- Routage IA explicite : `document` pour les fichiers, `fast` pour les demandes courtes sans fichier, `reasoning` pour les analyses plus longues.
- Extraction documentaire limitée à 70 000 caractères afin d'éviter les requêtes très lourdes.
