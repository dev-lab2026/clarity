# Import JSON CLARITY PM

L'import JSON remplace l'ancien import Excel + IA.

## Droits

- `DIRECTEUR_PROJETS` : projets, tâches et jalons.
- `CHEF_PROJET`, `PMO`, `CONTRIBUTEUR` : tâches et jalons.
- `ADMINISTRATEUR` : pas d'import métier depuis la console d'administration.

Les droits sont contrôlés côté serveur. L'interface ne constitue pas une sécurité.

## Formats

Projet :
```json
{"projects":[{"code":"1133","name":"Migration Red Hat 7 ou 8","description":"...","startDate":"2026-09-01","endDate":"2026-12-31","totalBudget":50000,"status":"PLANNING","priority":"HIGH","methodology":"HYBRID","currency":"EUR"}]}
```

Tâche :
```json
{"tasks":[{"projectCode":"1133","title":"Inventaire des serveurs","description":"...","startDate":"2026-09-01","dueDate":"2026-09-15","priority":"HIGH","status":"TODO","estimatedHours":20}]}
```

Jalon :
```json
{"milestones":[{"projectCode":"1133","title":"Architecture validée","targetDate":"2026-09-30","description":"...","completed":false}]}
```

Chaque import est d'abord validé côté serveur, puis doit être confirmé par l'utilisateur avant le CRUD.
