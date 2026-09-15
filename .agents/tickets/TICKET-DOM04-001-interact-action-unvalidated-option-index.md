# TICKET-DOM04-001: Absence de Validation Stricte sur l'Index d'Option dans /api/interact-action

---

| Champ | Valeur |
|---|---|
| **ID Ticket** | `TICKET-DOM04-001` |
| **Domaine** | Domaine 4 — Questions Interactives (`ask_question`), Grill-Me & Approbations |
| **Package ID** | `PKG-04` |
| **Date Création** | 2026-09-15 |
| **Rapporteur (Agent)** | OmniAuditor |
| **Statut** | `RESOLVED` |
| **Sévérité** | `P1 (Majeur / Robustesse Endpoint)` |
| **Catégorie** | `BUG` |
| **Fichier(s) Concerné(s)` | `src/server.js:3767-3790` |
| **Suite(s) de Tests Liée(s)` | `test/unit/action-decision.test.js`, `test/unit/simulated-e2e-workflows.test.js` |

---

## 1. Description du Problème / Constat 360°

Dans `src/server.js`, l'endpoint `POST /api/interact-action` traite les réponses de l'utilisateur mobile aux questions posées par l'agent (`ask_question`).
La charge utile attendue contient `actionId` et soit `optionIndex` (nombre), soit `customInput` (chaîne).
Le code actuel extrait directement `optionIndex` et tente de sélectionner l'élément correspondant dans le DOM d'Antigravity sans vérifier :
1. Si `optionIndex` est un nombre entier positif valide (`Number.isInteger(optionIndex)`).
2. Si `optionIndex` est bien compris dans les bornes du tableau d'options actuel (`0 <= index < availableOptions.length`).
3. Si une charge utile malformée (`optionIndex = -1` ou `optionIndex = 999` ou `optionIndex = {}`) est soumise, le script CDP injecté tente d'accéder à `elements[optionIndex]` ce qui renvoie `undefined` et provoque un crash silencieux ou une exception non gérée dans la promesse.

- **Comportement Attendu** : Validation stricte des types et des bornes de l'index avant tout envoi de commande CDP, avec renvoi d'un statut HTTP 400 clair en cas d'index hors limites.
- **Comportement Actuel** : Pas de validation préalable, risque de TypeError.
- **Impact Applicatif / Utilisateur** : Échec de soumission de la réponse à la question dans l'IDE.

---

## 2. Preuve & Emplacement dans le Code (Code Snippet)

```javascript
// Référence : src/server.js:3767-3780
app.post('/api/interact-action', async (req, res) => {
    const { actionId, optionIndex, customInput } = req.body;
    // Absence de vérification typeof optionIndex === 'number' && optionIndex >= 0
    // Appel direct clickElement ou evaluateScript avec index non filtré
```

---

## 3. Analyse d'Écart & Évaluation des Risques

- **Risque de Régression** : Nul.
- **Sécurité & Données** : Robustesse de l'API.

---

## 4. Recommandation / Plan de Correction Prescrit

1. Ajouter un schéma de validation :
   ```javascript
   if (optionIndex !== undefined) {
       const parsed = Number(optionIndex);
       if (!Number.isInteger(parsed) || parsed < 0) {
           return res.status(400).json({ error: 'Invalid optionIndex: must be a non-negative integer' });
       }
   }
   ```

---

## 5. Stratégie de Test E2E & Automatisation

- **Test Unitaire & E2E Simulé** :
  - Envoyer des payloads invalides (`optionIndex: -5`, `optionIndex: "abc"`, `optionIndex: 9999`).
  - Vérifier la réponse HTTP 400 sans incidence sur l'état de la session.

---

## 6. Journal de Suivi / Résolution

| Date | Agent / Développeur | Action effectuée | Statut |
|---|---|---|---|
| 2026-09-15 | OmniAuditor | Création du ticket de robustesse endpoint | `OPEN` |
| 2026-09-15 | Orchestrateur Squad | Correction appliquée et validée par les suites de tests unitaires et d'intégration | `RESOLVED` |
