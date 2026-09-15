# TICKET-DOM01-002: Routes CDP Critiques Définies Hors de createServer()

---

| Champ | Valeur |
|---|---|
| **ID Ticket** | `TICKET-DOM01-002` |
| **Domaine** | Domaine 1 — Connexion CDP, Multi-fenêtres & Cycle de Vie Antigravity |
| **Package ID** | `PKG-01` |
| **Date Création** | 2026-09-15 |
| **Rapporteur (Agent)** | OmniAuditor |
| **Statut** | `OPEN` |
| **Sévérité** | `P1 (Majeur / Architecture & Bogue)` |
| **Catégorie** | `BUG` |
| **Fichier(s) Concerné(s)` | `src/server.js:5082-5285` |
| **Suite(s) de Tests Liée(s)` | `test/test.js`, `test/unit/simulated-e2e-workflows.test.js` |

---

## 1. Description du Problème / Constat 360°

Dans `src/server.js`, la fonction `createServer()` configure l'instance Express, applique les middlewares (CSP, cookies, auth) et monte la grande majorité des routes d'API.
Cependant, 7 routes critiques ont été codées directement à l'intérieur du corps de la fonction `main()` :
- `POST /remote-click`
- `GET /cdp-targets`
- `POST /select-target`
- `POST /remote-scroll`
- `POST /new-chat`
- `POST /select-chat`
- `POST /api/launch-window`

Conséquences :
1. Lorsque `createServer()` est importé dans un script de test unitaire, d'intégration ou un runner externe sans exécuter `main()`, ces 7 routes sont totalement absentes de l'application Express (renvoyant une 404).
2. Ces routes échappent en partie à la structure modulaire et compliquent les tests automatisés en environnement simulé (mock).

- **Comportement Attendu** : L'ensemble des routes de l'application doit être monté de façon unifiée à l'intérieur de `createServer()` ou de routeurs Express modulaires.
- **Comportement Actuel** : Fragmentation du routage entre `createServer()` et `main()`.
- **Impact Applicatif / Utilisateur** : Impossibilité de tester unitairement les endpoints multi-cibles et risque de comportement divergent entre environnements.

---

## 2. Preuve & Emplacement dans le Code (Code Snippet)

```javascript
// Référence : src/server.js:5082-5095
const { server, wss, app, hasSSL } = await createServer();

// Start background polling (it will now handle reconnections)
startPolling(wss);

// Remote Click
app.post('/remote-click', async (req, res) => {
    const { selector, index, textContent, omniIndex } = req.body;
    if (!cdpConnection) return res.status(503).json({ error: 'CDP disconnected' });
    const result = await clickElement(cdpConnection, { selector, index, textContent, omniIndex });
    res.json(result);
});

// Multi-Window: List all available CDP targets
app.get('/cdp-targets', async (req, res) => {
    // ...
```

---

## 3. Analyse d'Écart & Évaluation des Risques

- **Risque de Régression** : Faible (simple déplacement dans `createServer()`).
- **Sécurité & Données** : Pas de brèche directe, mais faille de testabilité.

---

## 4. Recommandation / Plan de Correction Prescrit

1. Déplacer la définition de ces 7 endpoints à l'intérieur de `createServer()` avant `return { server, wss, app, hasSSL }`.
2. Conserver `main()` purement comme point d'entrée d'initialisation (connexion initiale CDP, démarrage de l'écoute réseau `server.listen`, lancement du polling).

---

## 5. Stratégie de Test E2E & Automatisation

- **Test Unitaire & E2E Simulé** :
  - Instancier l'application via `createServer()`.
  - Appeler `GET /cdp-targets` et `POST /select-target`.
  - Vérifier que la réponse n'est pas une 404.

---

## 6. Journal de Suivi / Résolution

| Date | Agent / Développeur | Action effectuée | Statut |
|---|---|---|---|
| 2026-09-15 | OmniAuditor | Signalement de la dette architecturale et création du ticket | `OPEN` |
