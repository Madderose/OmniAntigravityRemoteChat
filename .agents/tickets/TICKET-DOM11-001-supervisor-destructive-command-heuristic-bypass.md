# TICKET-DOM11-001: Contournement Possible des Barrières Heuristiques du Superviseur sur Commandes Obfusquées

---

| Champ | Valeur |
|---|---|
| **ID Ticket** | `TICKET-DOM11-001` |
| **Domaine** | Domaine 11 — Superviseur IA & File de Suggestions (OmniRoute) |
| **Package ID** | `PKG-11` |
| **Date Création** | 2026-09-15 |
| **Rapporteur (Agent)** | OmniAuditor |
| **Statut** | `OPEN` |
| **Sévérité** | `P1 (Majeur / Sécurité Superviseur)` |
| **Catégorie** | `SECURITY` |
| **Fichier(s) Concerné(s)` | `src/supervisor.js:320-365` |
| **Suite(s) de Tests Liée(s)` | `test/unit/supervisor.test.js`, `test/unit/simulated-e2e-workflows.test.js` |

---

## 1. Description du Problème / Constat 360°

Dans `src/supervisor.js`, les barrières heuristiques de sécurité inspectent les suggestions d'actions avant de les pousser dans la file d'attente d'approbation (`suggestQueue`).
Le filtre bloque des commandes destructrices simples via des regex littérales (ex: `/rm\s+-rf/i`, `/drop\s+database/i`).
Cependant, des formes obfusquées ou imbriquées courantes sous bash/sh ne sont pas détectées :
- `rm -r -f /...` (drapeaux séparés)
- `rm -fr /...` (ordre inversé)
- `find . -delete`
- `eval $(echo ...)` ou `sh -c "$(base64 -d ...)"`
- Redirections destructrices : `> .env` ou `: > file`

- **Comportement Attendu** : Les heuristiques de sécurité doivent normaliser les arguments et interdire tout schéma d'effacement récursif massif ou de troncature de fichiers critiques.
- **Comportement Actuel** : Correspondance par regex trop restrictive facilement contournable par une suggestion IA mal calibrée.
- **Impact Applicatif / Utilisateur** : Risque d'exécution d'une commande destructive sans avertissement préalable de sévérité maximale.

---

## 2. Preuve & Emplacement dans le Code (Code Snippet)

```javascript
// Référence : src/supervisor.js:320-335
// Détection par motifs regex basiques sensibles à la permutation des arguments
```

---

## 3. Analyse d'Écart & Évaluation des Risques

- **Risque de Régression** : Nul.
- **Sécurité & Données** : Prévention des pertes de données accidentelles.

---

## 4. Recommandation / Plan de Correction Prescrit

1. Tokeniser les commandes shell et normaliser les drapeaux courts combinés (`-rf` -> `-r`, `-f`).
2. Marquer comme `HIGH_RISK` toute commande ciblant les fichiers sensibles (`.env`, `.git`, `node_modules`, `certs/`).

---

## 5. Stratégie de Test E2E & Automatisation

- **Test Unitaire (Vitest)** :
  - Tester une batterie de 10 syntaxes destructrices obfusquées (`rm -f -r`, `rm -r -f`, `sh -c "rm ..."`).
  - Vérifier leur catégorisation systématique en action à approbation humaine obligatoire avec avertissement rouge.

---

## 6. Journal de Suivi / Résolution

| Date | Agent / Développeur | Action effectuée | Statut |
|---|---|---|---|
| 2026-09-15 | OmniAuditor | Diagnostic des règles heuristiques et formalisation du ticket | `OPEN` |
