# TICKET-DOM01-001: Risque d'Interception d'un Port CDP Orphelin ou Figé sans Vérification Active de Ping

---

| Champ | Valeur |
|---|---|
| **ID Ticket** | `TICKET-DOM01-001` |
| **Domaine** | Domaine 1 — Connexion CDP, Multi-fenêtres & Cycle de Vie Antigravity |
| **Package ID** | `PKG-01` |
| **Date Création** | 2026-09-15 |
| **Rapporteur (Agent)** | OmniAuditor |
| **Statut** | `RESOLVED` |
| **Sévérité** | `P1 (Majeur / Résilience & Découverte)` |
| **Catégorie** | `BUG` |
| **Fichier(s) Concerné(s)` | `src/cdp/connection.js:45-80` |
| **Suite(s) de Tests Liée(s)` | `test/unit/send-lock.test.js`, `test/unit/simulated-e2e-workflows.test.js` |

---

## 1. Description du Problème / Constat 360°

Dans `src/cdp/connection.js`, la découverte des cibles Antigravity effectue une requête HTTP GET sur `http://127.0.0.1:${port}/json/list`.
Lorsqu'un port répond avec une liste JSON contenant une cible `workbench`, la connexion WebSocket est initiée.
Cependant, si une instance antérieure d'Antigravity ou un processus tiers Chromium est figé (deadlocked, zombie ou en arrêt forcé sans libération du socket), la requête `/json/list` peut répondre mais la connexion WebSocket ne traitera aucun message entrant ou échouera silencieusement sans que la découverte ne bascule immédiatement vers les ports suivants.

- **Comportement Attendu** : La validation d'une cible CDP doit comporter un handshake ping/pong ou l'évaluation immédiate d'une expression basique (`Runtime.evaluate(1+1)`) avec un timeout court (1000ms).
- **Comportement Actuel** : Verrouillage sur la première cible découverte même si son moteur V8/CDP ne répond plus.
- **Impact Applicatif / Utilisateur** : Écran blanc sur le mobile et blocage de toute interaction.

---

## 2. Preuve & Emplacement dans le Code (Code Snippet)

```javascript
// Référence : src/cdp/connection.js:45-65
for (const port of PORTS) {
    try {
        const targets = await getJson(`http://127.0.0.1:${port}/json/list`);
        const workbenchTarget = targets.find(t => t.type === 'page' && !EXCLUDED_TARGET_TITLES.some(title => t.title.toLowerCase().includes(title)));
        if (workbenchTarget && workbenchTarget.webSocketDebuggerUrl) {
            return await connectWebSocket(workbenchTarget.webSocketDebuggerUrl);
        }
    } catch (_) {}
}
```

---

## 3. Analyse d'Écart & Évaluation des Risques

- **Risque de Régression** : Faible.
- **Concurrence & Transactions** : Découverte séquentielle multi-ports.

---

## 4. Recommandation / Plan de Correction Prescrit

1. Implémenter une sonde active `probeTargetHealth(wsUrl, timeoutMs = 1500)` envoyant `{"id":1,"method":"Runtime.evaluate","params":{"expression":"1+1"}}`.
2. Rejeter la cible et continuer la boucle sur les ports suivants si la sonde ne répond pas dans le délai imparti.

---

## 5. Stratégie de Test E2E & Automatisation

- **Test Unitaire (Vitest)** :
  - Simuler un serveur HTTP mock répondant sur port 7800 avec une cible WS qui ne répond pas au handshake.
  - Vérifier que la boucle de découverte bascule avec succès sur le port 7801.

---

## 6. Journal de Suivi / Résolution

| Date | Agent / Développeur | Action effectuée | Statut |
|---|---|---|---|
| 2026-09-15 | OmniAuditor | Création du ticket lors de l'audit 360° | `OPEN` |
| 2026-09-15 | Orchestrateur Squad | Correction appliquée et validée par les suites de tests unitaires et d'intégration | `RESOLVED` |
