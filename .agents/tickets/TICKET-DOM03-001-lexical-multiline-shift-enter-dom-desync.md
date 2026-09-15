# TICKET-DOM03-001: Désynchronisation des Sauts de Ligne Multi-Paragraphes dans l'Éditeur Lexical

---

| Champ | Valeur |
|---|---|
| **ID Ticket** | `TICKET-DOM03-001` |
| **Domaine** | Domaine 3 — Éditeur Lexical, Staging & Injection de Commandes |
| **Package ID** | `PKG-03` |
| **Date Création** | 2026-09-15 |
| **Rapporteur (Agent)** | OmniAuditor |
| **Statut** | `RESOLVED` |
| **Sévérité** | `P1 (Majeur / Rendu & Saisie)` |
| **Catégorie** | `BUG` |
| **Fichier(s) Concerné(s)` | `src/server.js:1840-1920` |
| **Suite(s) de Tests Liée(s)` | `test/unit/simulated-e2e-workflows.test.js` |

---

## 1. Description du Problème / Constat 360°

Dans `src/server.js`, la saisie de texte dans l'éditeur Antigravity utilise l'API DOM de Lexical en insérant des nœuds de texte (`span`) et des blocs paragraphes (`p`).
Lorsque le texte envoyé depuis le mobile comporte plusieurs sauts de ligne consécutifs (`\n\n`), ou des blocs de code formatés avec indentations, l'injection par manipulation de nœuds DOM bruts peut désynchroniser l'état interne de Lexical (`editorState`).
Dans certaines versions d'Antigravity/VS Code, Lexical ignore les nœuds DOM modifiés sans passer par son gestionnaire de transactions (`editor.update()`), ce qui provoque l'envoi d'un message vide ou tronqué lorsque la touche Entrée est ensuite simulée par CDP.

- **Comportement Attendu** : Le texte multi-lignes doit être inséré de façon atomique et validé par un contrôle de `boundary staging` garantissant que le texte est bien reconnu par l'état Lexical avant la frappe d'envoi.
- **Comportement Actuel** : Risque d'envoi partiel ou de désynchronisation de curseur.
- **Impact Applicatif / Utilisateur** : Prompts tronqués ou perte des blocs de code envoyés depuis le mobile.

---

## 2. Preuve & Emplacement dans le Code (Code Snippet)

```javascript
// Référence : src/server.js:1840-1870
// Injection directe dans le conteneur [contenteditable="true"]
// sans validation de cohérence editorState
```

---

## 3. Analyse d'Écart & Évaluation des Risques

- **Risque de Régression** : Faible si l'injection via clipboard reste en fallback.
- **Concurrence & Transactions** : Incohérence d'état de l'arbre Lexical.

---

## 4. Recommandation / Plan de Correction Prescrit

1. Utiliser en priorité l'injection via le presse-papiers CDP (`Input.insertText` ou `Clipboard.readText/writeText`) pour laisser Lexical parser nativement les sauts de ligne.
2. Ajouter un contrôle de vérification du contenu textuel de l'éditeur après staging (`stagingText.trim() === inputPrompt.trim()`).

---

## 5. Stratégie de Test E2E & Automatisation

- **Test E2E Simulé** :
  - Injecter un prompt complexe de 5 paragraphes avec blocs Markdown (` ```javascript...``` `).
  - Vérifier la complétude du texte injecté avant la simulation de la touche `Enter`.

---

## 6. Journal de Suivi / Résolution

| Date | Agent / Développeur | Action effectuée | Statut |
|---|---|---|---|
| 2026-09-15 | OmniAuditor | Diagnostic de la manipulation Lexical et ouverture du ticket | `OPEN` |
| 2026-09-15 | Orchestrateur Squad | Implémentation de l'injection par émulation ClipboardEvent native et fallback de paragraphes structurés | `RESOLVED` |
