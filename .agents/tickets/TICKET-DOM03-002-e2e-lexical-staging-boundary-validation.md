# TICKET-DOM03-002: Validation E2E des Limites de Staging Lexical avant Soumission

---

| Champ | Valeur |
|---|---|
| **ID Ticket** | `TICKET-DOM03-002` |
| **Domaine** | Domaine 3 — Éditeur Lexical, Staging & Injection de Commandes |
| **Package ID** | `PKG-03` |
| **Date Création** | 2026-09-15 |
| **Rapporteur (Agent)** | OmniAuditor |
| **Statut** | `RESOLVED` |
| **Sévérité** | `P2 (Normal / Couverture & Fiabilité)` |
| **Catégorie** | `E2E_GAP` |
| **Fichier(s) Concerné(s)** | `src/server.js:1140-1170` |
| **Suite(s) de Tests Liée(s)** | `test/unit/simulated-e2e-workflows.test.js` |

---

## 1. Description du Problème / Constat 360°

Dans `src/server.js`, la fonction `injectMessage` vérifie que le texte a bien été injecté dans le nœud Lexical avant de simuler l'appui sur le bouton d'envoi ou la touche Entrée (`staging check`).
Cependant, aucun test automatisé ne validait la logique de normalisation `normalizeForStaging` et la règle des 85% de couverture minimale (`minExpected`) avec vérification des têtes et queues de message (`head` et `tail`).

- **Comportement Attendu** : Une fonction ou test dédié doit s'assurer que la validation du staging rejette tout contenu incomplet et accepte les prompts avec espaces, guillemets et sauts de ligne.
- **Comportement Actuel** : Logique présente en production mais non couverte par la suite de tests automatisés.
- **Impact Applicatif / Utilisateur** : Risque de régression silencieuse en cas de modification de la logique de staging.

---

## 2. Preuve & Emplacement dans le Code (Code Snippet)

```javascript
// Référence : src/server.js:1142-1157
const normalizeForStaging = value => value.replace(/[\s\\\x60]/g, '');
const actual = normalizeForStaging(editorText);
const expected = normalizeForStaging(textToInsert);
const minExpected = Math.floor(expected.length * 0.85);
const head = expected.slice(0, Math.min(80, expected.length));
const tail = expected.slice(Math.max(0, expected.length - 80));
const staged = expected.length === 0
    || actual.includes(expected)
    || (actual.length >= minExpected && actual.includes(head) && actual.includes(tail));
```

---

## 3. Analyse d'Écart & Évaluation des Risques

- **Risque de Régression** : Nul.
- **Concurrence & Transactions** : Garantit la cohérence du contenu transmis à Antigravity.

---

## 4. Recommandation / Plan de Correction Prescrit

1. Couvrir dans `test/unit/simulated-e2e-workflows.test.js` la logique de validation de staging avec des textes volumineux, des backticks et des blocs de code.

---

## 5. Journal de Suivi / Résolution

| Date | Agent / Développeur | Action effectuée | Statut |
|---|---|---|---|
| 2026-09-15 | OmniAuditor | Signalement du manque de couverture de test et création du ticket | `OPEN` |
| 2026-09-15 | Orchestrateur Squad | Ajout de la suite de tests de validation de staging Lexical dans simulated-e2e-workflows.test.js | `RESOLVED` |
