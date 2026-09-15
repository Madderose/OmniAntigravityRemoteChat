# TICKET-[DOMXX-YYY]: [Titre concis et explicite du ticket]

---

| Champ | Valeur |
|---|---|
| **ID Ticket** | `TICKET-DOMXX-YYY` (Ex: `TICKET-DOM06-001`) |
| **Domaine** | Domaine [X] — [Nom du Domaine] (Ex: `Domaine 6 — Authentification, Contrôle d'Accès & Sécurité Réseau`) |
| **Package ID** | `PKG-[XX]` (Ex: `PKG-06`) |
| **Date Création** | YYYY-MM-DD |
| **Rapporteur (Agent)** | [Agent-1 / Agent-2 / OmniAuditor] |
| **Statut** | `OPEN` / `IN_PROGRESS` / `RESOLVED` / `WONTFIX` |
| **Sévérité** | `P0 (Bloquant/Sécurité/Crash)` / `P1 (Majeur/Bogue)` / `P2 (Normal/E2E Gap)` / `P3 (Mineur/Polish)` |
| **Catégorie** | `SECURITY` / `BUG` / `CONCURRENCY` / `E2E_GAP` / `A11Y` / `PERF` / `TECH_DEBT` |
| **Fichier(s) Concerné(s)** | `chemin/vers/fichier.js:Ligne-Ligne` |
| **Suite(s) de Tests Liée(s)** | `test/unit/...test.js` ou `test/e2e/...` |

---

## 1. Description du Problème / Constat 360°

Description factuelle et contextuelle de l'écart constaté entre le comportement attendu et le code réel.

- **Comportement Attendu** : ...
- **Comportement Actuel / Constat Réel** : ...
- **Impact Applicatif / Utilisateur** : ...

---

## 2. Preuve & Emplacement dans le Code (Code Snippet)

```javascript
// Référence : fichier.js:Lignes XX-YY
// Extrait de code exact démontrant le problème
```

---

## 3. Analyse d'Écart & Évaluation des Risques

- **Risque de Régression** : Faible / Moyen / Élevé
- **Effets de Bord Possibles** : ...
- **Concurrence & Asynchronisme** : (ex: race condition, deadlock sur send-lock, fuite de promesses)
- **Sécurité & Données** : (ex: bypass auth, injection, fuite de secrets)
- **Ergonomie Mobile / A11y** : (si applicable)

---

## 4. Recommandation / Plan de Correction Prescrit

1. **Serveur / Backend** :
   - Étape 1...
   - Étape 2...
2. **Frontend Mobile / Client WS** :
   - Étape 1...
3. **Configuration & Environnement** :
   - Étape 1...

---

## 5. Stratégie de Test E2E & Automatisation

- **Test Unitaire (Vitest)** :
  - Scénario à ajouter dans `test/unit/simulated-e2e-workflows.test.js` ou suite dédiée.
- **Scénario E2E Simulé** :
  - Nom du test : `SIM-DOM[XX]-[YY]`
  - Étapes de reproduction à automatiser :
    1. Initialiser le contexte...
    2. Simuler l'appel critique...
    3. Vérifier la réaction du système et l'absence de régression.

---

## 6. Journal de Suivi / Résolution

| Date | Agent / Développeur | Action effectuée | Statut |
|---|---|---|---|
| YYYY-MM-DD | OmniAuditor | Création initiale du ticket | `OPEN` |
