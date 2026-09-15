# TICKET-DOM14-002: Invalidation Lente des Assets en Cache Service Worker PWA

---

| Champ | Valeur |
|---|---|
| **ID Ticket** | `TICKET-DOM14-002` |
| **Domaine** | Domaine 14 — Frontend Mobile, Ergonomie Tactile, Thèmes & PWA |
| **Package ID** | `PKG-14` |
| **Date Création** | 2026-09-15 |
| **Rapporteur (Agent)** | OmniAuditor |
| **Statut** | `RESOLVED` |
| **Sévérité** | `P2 (Normal / Mise à Jour & Cache)` |
| **Catégorie** | `BUG` |
| **Fichier(s) Concerné(s)` | `public/sw.js:15-45` |
| **Suite(s) de Tests Liée(s)` | `test/test.js` |

---

## 1. Description du Problème / Constat 360°

Dans `public/sw.js`, le Service Worker implémente une stratégie de mise en cache `cache-first` ou `stale-while-revalidate` avec un nom de cache statique figé `CACHE_NAME = 'omni-chat-v1.4.0'`.
Lorsqu'une nouvelle version de l'application est déployée (modifications CSS de composants, scripts JS ou correctifs de sécurité dans `public/js/app.js`), les clients PWA mobiles installés continuent d'utiliser les fichiers en cache jusqu'à ce que :
1. Le Service Worker soit mis à jour manuellement dans les outils de développement, ou
2. Le client recharge deux fois de suite la page en vidant le cache.
Il n'y a pas d'écoute automatique de l'événement `controllerchange` dans `public/js/app.js` pour inviter l'utilisateur à actualiser ou appliquer immédiatement la nouvelle version via `self.skipWaiting()`.

- **Comportement Attendu** : Notification transparente d'une mise à jour disponible et bascule immédiate vers les assets frais via `skipWaiting()` et `clients.claim()`.
- **Comportement Actuel** : Rétention d'anciens fichiers JS/CSS en cache créant des désalignements d'API.
- **Impact Applicatif / Utilisateur** : Bogues d'affichage et erreurs d'incompatibilité JS après mise à jour.

---

## 2. Preuve & Emplacement dans le Code (Code Snippet)

```javascript
// Référence : public/sw.js:15-30
// Absence de self.skipWaiting() automatique lors du cycle install
// Absence d'écouteur controllerchange dans public/js/app.js
```

---

## 3. Analyse d'Écart & Évaluation des Risques

- **Risque de Régression** : Nul.
- **PWA & Cache** : Confort de déploiement continu.

---

## 4. Recommandation / Plan de Correction Prescrit

1. Injecter la version issue de `package.json` dans le nom de cache.
2. Ajouter `self.skipWaiting()` dans l'événement `install` du service worker.
3. Écouter `navigator.serviceWorker.oncontrollerchange` dans `public/js/app.js` pour rafraîchir en douceur l'interface.

---

## 5. Stratégie de Test E2E & Automatisation

- **Test Unitaire (Vitest)** :
  - Valider que le fichier `public/sw.js` exporte une syntaxe valide et inclut les directives de purge du cache obsolète lors de l'activation.

---

## 6. Journal de Suivi / Résolution

| Date | Agent / Développeur | Action effectuée | Statut |
|---|---|---|---|
| 2026-09-15 | OmniAuditor | Audit PWA et création du ticket d'invalidation | `OPEN` |
| 2026-09-15 | Orchestrateur Squad | Correction appliquée et validée par les suites de tests unitaires et d'intégration | `RESOLVED` |
