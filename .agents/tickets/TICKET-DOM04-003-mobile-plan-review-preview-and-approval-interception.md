# TICKET-DOM04-003: Impossibilité de réviser et valider un plan d'implémentation sur l'interface mobile

---

| Champ | Valeur |
|---|---|
| **ID Ticket** | `TICKET-DOM04-003` |
| **Domaine** | Domaine 4 — Gestion des Questions Interactives & Approbations (Action Cards) |
| **Package ID** | `PKG-04` |
| **Date Création** | 2026-09-16 |
| **Rapporteur (Agent)** | Antigravity Pair Programmer |
| **Statut** | `RESOLVED` |
| **Sévérité** | `P1 (Majeur/Bogue Fonctionnel)` |
| **Catégorie** | `BUG` / `A11Y` |
| **Fichier(s) Concerné(s)** | `src/server.js:2966-3040`, `src/utils/workspace.js:725-778`, `public/js/app.js:1050-1310` |
| **Suite(s) de Tests Liée(s)** | `test/unit/action-decision.test.js`, `test/unit/simulated-e2e-workflows.test.js` |

---

## 1. Description du Problème / Constat 360°

Lors de la génération d'un plan d'implémentation (`implementation_plan.md`) par Antigravity avec demande d'approbation (`RequestFeedback: true`), l'utilisateur sur mobile n'a pas pu visualiser ni réviser le plan d'action.

- **Comportement Attendu** :
  1. Dès qu'un plan d'implémentation est produit ou en attente d'approbation, l'interface mobile affiche la carte interactive flottante de type `plan` (`#floatingActionCard`).
  2. L'utilisateur peut appuyer sur `Preview Implementation Plan` pour ouvrir la modale plein écran (`openPlanPreviewModal`), lire le markdown complet du plan et consulter les fichiers ciblés.
  3. L'utilisateur peut soit saisir des remarques de révision (`Review`), soit cliquer sur `Proceed with Plan` pour déclencher l'exécution sans devoir retourner sur son ordinateur portable / poste fixe.
- **Comportement Actuel / Constat Réel** :
  1. Dans Antigravity IDE, le plan s'ouvre dans un onglet d'éditeur dédié (`OmniAntigravityRemoteChat - Antigravity IDE - Implementation Plan`) ou sous forme d'artefact custom, et le bouton DOM natif `Proceed` n'est pas systématiquement présent dans la liste des boutons visibles du panneau de discussion (`#cascade`).
  2. Dans `src/server.js:2967-2970`, `scanInteractivePrompts` cherche uniquement un bouton dont le texte exact est `proceed` ou commence par `proceed with plan` parmi les boutons visibles du DOM principal. Si ce bouton n'est pas présent dans le DOM interrogé, `scanInteractivePrompts` renvoie `null`.
  3. Par conséquent, aucune carte `type: 'plan'` n'est envoyée au client mobile dans le message WebSocket `snapshot_update`.
  4. L'utilisateur sur mobile se retrouve bloqué, sans moyen de lire le plan ni de valider l'étape pour que l'agent poursuive son travail.
- **Impact Applicatif / Utilisateur** :
  Rupture complète de l'expérience de pilotage autonome à distance depuis le smartphone lorsque l'agent entre en mode planification (*Planning Mode*).

---

## 2. Preuve & Emplacement dans le Code (Code Snippet)

Dans [src/server.js:2966-2980](file:///home/deck/Documents/OmniAntigravityRemoteChat/OmniAntigravityRemoteChat/src/server.js#L2966-L2980) :
```javascript
// 3. Plan Validation (Proceed button)
const proceedBtn = allBtns.find(btn => {
    const text = (btn.innerText || btn.textContent || '').trim().toLowerCase();
    return text === 'proceed' || text.startsWith('proceed with plan');
});

if (proceedBtn) {
    // If agent is actively running/generating (stop button visible), plan is not awaiting approval
    const isAgentWorking = allBtns.some(b => {
        const t = (b.innerText || b.getAttribute('aria-label') || '').trim().toLowerCase();
        return t === 'stop' || t === 'cancel' || t === 'stop generation';
    });
    if (isAgentWorking) {
        return null;
    }
    ...
```

Si le bouton n'est pas trouvé dans `allBtns` (par exemple parce que le dialogue d'artefact est dans un contexte séparé ou que le plan vient d'être écrit sur disque sans bouton DOM textuel explicite), la détection échoue silencieusement.

---

## 3. Analyse d'Écart & Évaluation des Risques

- **Risque de Régression** : Faible si l'on combine la détection DOM et la détection d'artefact sur disque.
- **Effets de Bord Possibles** : Veiller à ne pas réafficher un plan déjà approuvé ou obsolète (nécessite de vérifier l'horodatage `mtime` et le registre `actedActionIds`).
- **Concurrence & Asynchronisme** : La soumission de l'approbation `Proceed` doit rester protégée par `withSendLock`.
- **Ergonomie Mobile / A11y** : La modale `openPlanPreviewModal()` doit être parfaitement responsive, lisible avec défilement fluide, et dotée de boutons d'action toujours accessibles en bas de l'écran tactile.

---

## 4. Recommandation / Plan de Correction Prescrit

1. **Serveur / Backend (`src/server.js` & `src/utils/workspace.js`)** :
   - **Détection hybride Artefact + DOM** : Si aucun bouton DOM `proceed` n'est détecté mais qu'un fichier `implementation_plan.md` a été créé/modifié très récemment (ex: dans les 3 dernières minutes) dans le répertoire `brain/` de la conversation active ou dans le workspace, et que l'agent est inactif (`!isGenerating`), synthétiser l'action interactive `type: 'plan'`.
   - **Exécution robuste du Proceed** : Lors de la réception de `decision: 'proceed'` pour un plan, si le bouton DOM `Proceed` n'est pas trouvable directement dans la vue active, soumettre le message texte d'approbation standard `Proceed with implementation plan` via `injectMessage` pour débloquer l'agent.
2. **Frontend Mobile (`public/js/app.js` & `public/css/components.css`)** :
   - Assurer que la carte flottante `floatingActionCard` de type `plan` s'affiche immédiatement en superposition au-dessus du champ de saisie.
   - Ajouter un raccourci ou badge "Plan d'implémentation en attente" persistant dans le header mobile si l'utilisateur a fermé temporairement la carte via swipe.
   - Optimiser le rendu Markdown dans `openPlanPreviewModal()` pour mobile (police lisible, gestion des blocs de code avec défilement horizontal, bouton "Valider le plan" flottant en pied de modale).
3. **Tests de non-régression** :
   - Ajouter un test unitaire et simulé dans `test/unit/action-decision.test.js` et `test/unit/simulated-e2e-workflows.test.js`.

---

## 5. Stratégie de Test E2E & Automatisation

- **Test Unitaire (Vitest)** :
  - Simuler la présence d'un `implementation_plan.md` récent sans bouton DOM explicite.
  - Vérifier que `detectPendingPrompt` / `scanInteractivePrompts` émet une invite de type `plan`.
  - Valider que l'approbation `proceed` envoie l'action adéquate ou le message de confirmation.
- **Scénario E2E Simulé (`SIM-DOM04-03`)** :
  1. Créer un artefact de plan temporaire avec `updatedAt = Date.now()`.
  2. Interroger `/snapshot` ou la routine de détection.
  3. Vérifier que `actionData.type === 'plan'` et que `/api/plan` renvoie le contenu du fichier.
  4. Appeler `POST /api/interact-action` avec `decision: 'proceed'`.
  5. Vérifier que l'ID d'action est enregistré dans `actedActionIds`.

---

## 6. Journal de Suivi / Résolution

| Date | Agent / Développeur | Action effectuée | Statut |
|---|---|---|---|
| 2026-09-16 | Antigravity Pair Programmer | Création du ticket suite au retour utilisateur sur mobile | `OPEN` |
| 2026-09-16 | Antigravity Pair Programmer | Détection hybride (DOM + artefact 30min) dans scanInteractivePrompts, fallback injectMessage dans executeActionResponse, pill #headerPlanBtn et synchronisation modale mobile implémentés et validés par tests unitaires (147 passing). | `RESOLVED` |
