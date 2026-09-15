# TICKET-DOM05-001: Absence de Contrôle de Contre-Pression (Backpressure) et Sockets Lents sur la Diffusion WebSocket

---

| Champ | Valeur |
|---|---|
| **ID Ticket** | `TICKET-DOM05-001` |
| **Domaine** | Domaine 5 — Snapshot Polling, Hash Djb2 & Diffusion WebSocket |
| **Package ID** | `PKG-05` |
| **Date Création** | 2026-09-15 |
| **Rapporteur (Agent)** | OmniAuditor |
| **Statut** | `RESOLVED` |
| **Sévérité** | `P1 (Majeur / Performance & Fuite Mémoire)` |
| **Catégorie** | `PERF` |
| **Fichier(s) Concerné(s)` | `src/server.js:4980-5020` |
| **Suite(s) de Tests Liée(s)` | `test/unit/simulated-e2e-workflows.test.js` |

---

## 1. Description du Problème / Constat 360°

Dans `src/server.js`, la boucle de polling `startSnapshotPolling(wss)` capture à intervalles réguliers (toutes les secondes) l'état DOM de l'IDE. Lorsque le hash djb2 change, le snapshot complet est sérialisé en JSON et diffusé à tous les clients connectés :
```javascript
wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
        client.send(payload);
    }
});
```
Sur un réseau mobile 3G/4G instable ou en situation de latence élevée, un client mobile peut accuser un retard de réception important.
En l'absence de vérification de la contre-pression (`client.bufferedAmount`), les messages volumineux s'accumulent dans le tampon réseau de Node.js pour ce client lent.
Si le tampon dépasse plusieurs mégaoctets, cela provoque un engorgement mémoire sur le serveur hôte et un déphasage temporel massif côté mobile (l'utilisateur voit défiler avec plusieurs dizaines de secondes de retard des événements passés).

- **Comportement Attendu** : Si `client.bufferedAmount > MAX_BUFFER_THRESHOLD` (ex: 1 Mo), le serveur doit sauter l'envoi des snapshots intermédiaires pour ce client et ne lui pousser que le snapshot le plus récent dès que le tampon se vide.
- **Comportement Actuel** : Poussée inconditionnelle de chaque frame dans le tampon réseau.
- **Impact Applicatif / Utilisateur** : Latence exponentielle et instabilité mémoire sur le serveur.

---

## 2. Preuve & Emplacement dans le Code (Code Snippet)

```javascript
// Référence : src/server.js:4980-5000
wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
        // Envoi direct sans vérification de client.bufferedAmount
        client.send(message);
    }
});
```

---

## 3. Analyse d'Écart & Évaluation des Risques

- **Risque de Régression** : Nul.
- **Concurrence & Asynchronisme** : Protection contre la saturation I/O.

---

## 4. Recommandation / Plan de Correction Prescrit

1. Vérifier `if (client.bufferedAmount > 512 * 1024) continue;` avant `client.send()`.
2. Si un socket conserve un tampon saturé pendant plus de 15 secondes, forcer la fermeture propre (`client.terminate()`).

---

## 5. Stratégie de Test E2E & Automatisation

- **Test E2E Simulé** :
  - Simuler un client WebSocket artificiellement ralenti avec un mock de socket.
  - Vérifier que les messages intermédiaires sont sautés pour préserver le temps réel et l'empreinte mémoire.

---

## 6. Journal de Suivi / Résolution

| Date | Agent / Développeur | Action effectuée | Statut |
|---|---|---|---|
| 2026-09-15 | OmniAuditor | Analyse de charge WebSocket et création du ticket | `OPEN` |
| 2026-09-15 | Orchestrateur Squad | Correction appliquée et validée par les suites de tests unitaires et d'intégration | `RESOLVED` |
