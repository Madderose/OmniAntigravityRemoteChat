# TICKET-DOM12-001: Abandon Silencieux des Notifications Telegram lors des Dépassements de Cadence

---

| Champ | Valeur |
|---|---|
| **ID Ticket** | `TICKET-DOM12-001` |
| **Domaine** | Domaine 12 — Bot Telegram & Notifications Déportées |
| **Package ID** | `PKG-12` |
| **Date Création** | 2026-09-15 |
| **Rapporteur (Agent)** | OmniAuditor |
| **Statut** | `OPEN` |
| **Sévérité** | `P2 (Normal / Fiabilité Notifications)` |
| **Catégorie** | `BUG` |
| **Fichier(s) Concerné(s)` | `src/utils/telegram.js:180-220` |
| **Suite(s) de Tests Liée(s)` | `test/unit/telegram.test.js` |

---

## 1. Description du Problème / Constat 360°

Dans `src/utils/telegram.js`, la méthode d'envoi de notification dispose d'une protection contre le spam Telegram (`TELEGRAM_RATE_LIMIT_MS`, par défaut 2000 ms).
Si un message est soumis alors que le délai minimal n'est pas écoulé :
```javascript
if (now - lastNotificationTime < RATE_LIMIT_MS) {
    console.log('[Telegram] Rate limited, skipping message');
    return null;
}
```
Le message est purement et simplement abandonné (`skipped`).
Si Antigravity pose une question critique demandant une approbation (`ask_question` ou plan d'action) et qu'une notification de statut a été émise 500 ms plus tôt, la notification de la question n'est jamais transmise sur Telegram ! L'utilisateur distant ne reçoit aucun avertissement et le projet reste bloqué dans l'attente d'une réponse.

- **Comportement Attendu** : Les messages soumis sous rate-limit doivent être différés dans une file tampon FIFO et dépilés dès expiration du délai de cadence.
- **Comportement Actuel** : Perte silencieuse des messages soumis en rafale.
- **Impact Applicatif / Utilisateur** : Absence d'alerte sur Telegram pour les actions requérant une décision humaine immédiate.

---

## 2. Preuve & Emplacement dans le Code (Code Snippet)

```javascript
// Référence : src/utils/telegram.js:180-195
if (now - lastMessageTime < rateLimitMs) {
    // Abandon immédiat sans enfilement
    return;
}
```

---

## 3. Analyse d'Écart & Évaluation des Risques

- **Risque de Régression** : Nul.
- **Fiabilité** : Notification garantie des événements critiques.

---

## 4. Recommandation / Plan de Correction Prescrit

1. Implémenter une file d'attente FIFO `notificationQueue = []`.
2. Planifier un timer de dépilage automatique dès que le rate limit est levé.
3. Donner une priorité absolue aux messages de type `action_required`.

---

## 5. Stratégie de Test E2E & Automatisation

- **Test Unitaire (Vitest)** :
  - Émettre 3 messages successifs en moins de 100 ms.
  - Vérifier que les 3 messages sont finalement transmis séquentiellement sans perte.

---

## 6. Journal de Suivi / Résolution

| Date | Agent / Développeur | Action effectuée | Statut |
|---|---|---|---|
| 2026-09-15 | OmniAuditor | Diagnostic de la perte de notifications et création du ticket | `OPEN` |
