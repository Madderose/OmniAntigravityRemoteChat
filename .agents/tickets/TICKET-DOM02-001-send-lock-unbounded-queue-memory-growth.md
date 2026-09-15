# TICKET-DOM02-001: File d'Attente send-lock Non Bornée et Risque de Saturation Mémoire

---

| Champ | Valeur |
|---|---|
| **ID Ticket** | `TICKET-DOM02-001` |
| **Domaine** | Domaine 2 — Messagerie, Concurrence & Verrou Send-Lock |
| **Package ID** | `PKG-02` |
| **Date Création** | 2026-09-15 |
| **Rapporteur (Agent)** | OmniAuditor |
| **Statut** | `OPEN` |
| **Sévérité** | `P1 (Majeur / Concurrence & Saturation)` |
| **Catégorie** | `CONCURRENCY` |
| **Fichier(s) Concerné(s)` | `src/server.js:1240-1285` |
| **Suite(s) de Tests Liée(s)` | `test/unit/send-lock.test.js`, `test/unit/simulated-e2e-workflows.test.js` |

---

## 1. Description du Problème / Constat 360°

Dans `src/server.js`, la sérialisation atomique des envois vers Antigravity est orchestrée par la fonction `withSendLock(fn)`.
Cette fonction enchaîne les promesses sur une variable mutable `activeSendOperation = activeSendOperation.then(run).catch(run)`.

Bien que ce mécanisme garantisse l'exécution séquentielle, il ne dispose d'**aucun plafond de saturation** (queue backpressure).
Si un client mobile avec une connexion instable ou un script automatisé envoie 50 ou 100 requêtes consécutives sur `/send`, toutes les promesses s'accumulent en mémoire dans la chaîne `.then()`.
Chaque promesse retient ses closures de portée (`req`, `res`, `prompt`, tampons), créant une élévation de l'empreinte mémoire et retardant indéfiniment les réponses HTTP qui risquent de tomber en timeout côté client.

- **Comportement Attendu** : La file d'attente doit rejeter immédiatement avec un code HTTP 429 ou 503 (Busy) si la profondeur de file dépasse une limite raisonnable (ex: 5 messages en attente).
- **Comportement Actuel** : Chaîne de promesses infinie sans garde-fou de capacité.
- **Impact Applicatif / Utilisateur** : Risque de blocage prolongé de la session et de consommation excessive de mémoire Node.js.

---

## 2. Preuve & Emplacement dans le Code (Code Snippet)

```javascript
// Référence : src/server.js:1240-1260
let activeSendOperation = Promise.resolve();

export function withSendLock(operation) {
    const run = async () => {
        try {
            return await operation();
        } finally {
            // cleanup
        }
    };
    const promise = activeSendOperation.then(run).catch(run);
    activeSendOperation = promise;
    return promise;
}
```

---

## 3. Analyse d'Écart & Évaluation des Risques

- **Risque de Régression** : Faible.
- **Concurrence & Transactions** : Condition de surcharge concurrente.

---

## 4. Recommandation / Plan de Correction Prescrit

1. Maintenir un compteur `pendingSendCount`.
2. Si `pendingSendCount >= MAX_SEND_QUEUE_DEPTH` (ex: 5), rejeter immédiatement l'appel avec une erreur `SendQueueFullError` (HTTP 429 / 503).
3. Décrémenter le compteur dans le bloc `finally` de l'opération.

---

## 5. Stratégie de Test E2E & Automatisation

- **Test Unitaire (Vitest)** :
  - Déclencher 10 opérations lentes en parallèle.
  - Vérifier que les requêtes au-delà du seuil sont immédiatement rejetées sans bloquer la chaîne principale.

---

## 6. Journal de Suivi / Résolution

| Date | Agent / Développeur | Action effectuée | Statut |
|---|---|---|---|
| 2026-09-15 | OmniAuditor | Analyse de concurrence et création du ticket | `OPEN` |
