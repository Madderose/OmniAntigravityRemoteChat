# TICKET-DOM04-004: Identification de la fenêtre / workspace cible sur les cartes d'action et la prévisualisation de plan

---

| Champ | Valeur |
|---|---|
| **ID Ticket** | `TICKET-DOM04-004` |
| **Domaine** | Domaine 4 — Gestion des Questions Interactives & Approbations (Action Cards) |
| **Package ID** | `PKG-04` |
| **Date Création** | 2026-09-16 |
| **Rapporteur (Agent)** | Antigravity Pair Programmer |
| **Statut** | `RESOLVED` |
| **Sévérité** | `P2 (Moyen/Ergonomie Multi-Fenêtres)` |
| **Catégorie** | `FEATURE` / `UX` |
| **Fichier(s) Concerné(s)** | `src/server.js:3010-3075`, `src/utils/workspace.js:735-770`, `public/js/app.js:1030-1160`, `public/css/components.css:2275-2315` |
| **Suite(s) de Tests Liée(s)** | `test/unit/action-decision.test.js`, `test/unit/plan-archive-and-walkthrough.test.js` |

---

## 1. Description du Problème / Constat 360°

Dans un environnement de travail productif avec Antigravity IDE, l'utilisateur a souvent plusieurs projets et fenêtres d'IDE ouvertes en simultané (par exemple : la fenêtre de discussion du projet client `Projet_Cholet` sur le port 7800, et la fenêtre `OmniAntigravityRemoteChat` sur le même port ou un port adjacent).

- **Comportement Attendu** :
  Lorsqu'une carte d'action interactive flottante apparaît sur le mobile (validation de commande, question à choix multiples ou approbation d'un plan d'implémentation), l'utilisateur doit immédiatement savoir à quel projet ou quelle fenêtre d'IDE l'action s'applique, afin d'éviter toute validation croisée ou confusion de contexte.
- **Comportement Antérieur** :
  La carte d'action affichait seulement l'icône et le titre générique (ex: `Plan Approval` ou `Command Execution`), sans aucune indication de l'espace de travail ou du dossier concerné.
  La modale de prévisualisation de plan n'indiquait pas non plus le nom du workspace, obligeant l'utilisateur à deviner ou à inspecter les chemins absolus.

---

## 2. Résolution Implémentée

1. **Extraction Automatique du Contexte Workspace (`src/utils/workspace.js`)** :
   - Ajout de la fonction `deriveWorkspaceNameFromPath(filePath, content)` qui résout le nom du projet (`Projet_Cholet`, `OmniAntigravityRemoteChat`, ou le numéro de conversation brain).
   - Ajout de la fonction `extractMarkdownTitle(content, fallback)` pour extraire le titre réel du document markdown.
2. **Propagation du Workspace dans `scanInteractivePrompts` (`src/server.js`)** :
   - Récupération du titre de la cible active (`currentTarget?.title`).
   - Dérivation du dossier de premier niveau (`targetTitle.split(' - ')[0].trim()`).
   - Enrichissement systématique des objets prompts (`prompt.workspaceName`, `prompt.targetTitle`, `prompt.planTitle`).
3. **Interface Graphique Mobile (`public/js/app.js` & `public/css/components.css`)** :
   - Affichage d'un badge distinctif `📂 [Nom du Workspace]` sur `#floatingActionCard` à côté du titre.
   - Intégration du badge dans le sous-titre de la modale de plan (`#planPreviewSubtitle`) et de la modale walkthrough (`#walkthroughSubtitle`).
   - Intégration du sélecteur d'archive `#planHistorySelect` permettant de naviguer et filtrer entre les plans issus des différents espaces.

---

## 3. Validation & Tests

- **Tests Unitaires Vitest** :
  `test/unit/plan-archive-and-walkthrough.test.js` valide la dérivation précise des noms d'espaces de travail à partir des chemins et des fichiers du projet.
- **Tests d'Intégration** :
  `scanInteractivePrompts` renvoie les métadonnées de workspace attendues pour toutes les cibles connectées.
