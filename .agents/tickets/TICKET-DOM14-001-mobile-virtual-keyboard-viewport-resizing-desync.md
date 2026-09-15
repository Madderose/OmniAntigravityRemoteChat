# TICKET-DOM14-001: Glissement de Vue Mobile et Masquage d'Input lors de l'Ouverture du Clavier Virtuel

---

| Champ | Valeur |
|---|---|
| **ID Ticket** | `TICKET-DOM14-001` |
| **Domaine** | Domaine 14 — Frontend Mobile, Ergonomie Tactile, Thèmes & PWA |
| **Package ID** | `PKG-14` |
| **Date Création** | 2026-09-15 |
| **Rapporteur (Agent)** | OmniAuditor |
| **Statut** | `OPEN` |
| **Sévérité** | `P1 (Majeur / Ergonomie Mobile & A11y)` |
| **Catégorie** | `A11Y` |
| **Fichier(s) Concerné(s)` | `public/js/app.js:840-890`, `public/css/layout.css` |
| **Suite(s) de Tests Liée(s)` | `test/unit/mobile-viewport.test.js`, `test/unit/simulated-e2e-workflows.test.js` |

---

## 1. Description du Problème / Constat 360°

Dans `public/js/app.js`, la gestion de l'affichage sur smartphone utilise l'API `window.visualViewport`.
Sur certains navigateurs mobiles récents (Chrome Mobile sur Android, Safari sur iOS 17+), le déploiement du clavier tactile modifie la hauteur du viewport visuel (`visualViewport.height`).
Cependant, la zone de saisie du prompt `#prompt-input` et le conteneur de chat `#chat-container` ne recalculent pas systématiquement leur position en temps réel lors des animations de transition du clavier, ce qui provoque :
1. Le masquage de la zone de texte sous le clavier virtuel (l'utilisateur tape "à l'aveugle").
2. Un glissement vertical incontrôlé de l'ensemble de la page qui pousse le header hors de l'écran.

- **Comportement Attendu** : La zone de saisie doit rester ancrée immédiatement au-dessus du clavier virtuel grâce à l'événement `visualViewport.onresize` et `scrollIntoView({ block: 'nearest' })`.
- **Comportement Actuel** : Saccades et masquage temporaire de l'input lors de la frappe mobile.
- **Impact Applicatif / Utilisateur** : Frustration et inconfort d'utilisation lors des sessions de télécommande mobile.

---

## 2. Preuve & Emplacement dans le Code (Code Snippet)

```javascript
// Référence : public/js/app.js:840-860
// Ajustement partiel de height sans compensation de visualViewport.offsetTop
```

---

## 3. Analyse d'Écart & Évaluation des Risques

- **Risque de Régression** : Nul.
- **Ergonomie Mobile / A11y** : Amélioration substantielle du confort tactile.

---

## 4. Recommandation / Plan de Correction Prescrit

1. Écouter `window.visualViewport.addEventListener('resize', ...)` et `scroll`.
2. Calculer dynamiquement le décalage : `bottomOffset = window.innerHeight - visualViewport.height - visualViewport.offsetTop`.
3. Appliquer une variable CSS `--keyboard-offset` au conteneur principal.

---

## 5. Stratégie de Test E2E & Automatisation

- **Test Unitaire (Vitest)** :
  - Ajouter dans `test/unit/mobile-viewport.test.js` un scénario simulant la réduction de hauteur du viewport de 800px à 450px et valider l'ajustement du style d'ancrage.

---

## 6. Journal de Suivi / Résolution

| Date | Agent / Développeur | Action effectuée | Statut |
|---|---|---|---|
| 2026-09-15 | OmniAuditor | Diagnostic du comportement viewport et création du ticket | `OPEN` |
