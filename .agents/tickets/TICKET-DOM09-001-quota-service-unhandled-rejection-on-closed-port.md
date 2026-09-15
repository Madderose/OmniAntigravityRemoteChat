# TICKET-DOM09-001: Risque de Rejet de Promesse Non Géré lors de la Fermeture Inopinée de Language Server

---

| Champ | Valeur |
|---|---|
| **ID Ticket** | `TICKET-DOM09-001` |
| **Domaine** | Domaine 9 — Surveillance des Quotas & Découverte Language Server |
| **Package ID** | `PKG-09` |
| **Date Création** | 2026-09-15 |
| **Rapporteur (Agent)** | OmniAuditor |
| **Statut** | `RESOLVED` |
| **Sévérité** | `P2 (Normal / Robustesse Quota)` |
| **Catégorie** | `BUG` |
| **Fichier(s) Concerné(s)` | `src/quota-service.js:280-320` |
| **Suite(s) de Tests Liée(s)` | `test/unit/quota-service.test.js` |

---

## 1. Description du Problème / Constat 360°

Dans `src/quota-service.js`, la découverte de l'endpoint HTTPS du `language_server` local scanne les sockets en écoute.
Lorsque le port est identifié, une requête HTTPS `probeLanguageServer(port)` est initiée pour récupérer les données de quota des modèles d'IA (Gemini Flash/Pro, Claude).
Si le processus `language_server` est redémarré ou arrêté par Antigravity au moment précis où le client HTTPS établit le socket TLS (erreur `ECONNRESET` ou `ERR_SSL_PROTOCOL_ERROR`), certains gestionnaires d'événements de bas niveau sur l'agent HTTPS peuvent ne pas être interceptés dans le scope de la promesse parente.

- **Comportement Attendu** : Toute anomalie de communication avec le `language_server` doit se résoudre silencieusement en mode dégradé (`{ available: false, cached: true }`) sans lever d'exception non gérée.
- **Comportement Actuel** : Risque d'erreur de transport remontant au journal des erreurs serveur.
- **Impact Applicatif / Utilisateur** : Bruit dans les logs et affichage temporaire d'une erreur 500 sur `/api/quota`.

---

## 2. Preuve & Emplacement dans le Code (Code Snippet)

```javascript
// Référence : src/quota-service.js:280-305
// Sonde HTTPS avec agent TLS customisé
```

---

## 3. Analyse d'Écart & Évaluation des Risques

- **Risque de Régression** : Nul.
- **Gestion des Erreurs** : Confort d'observabilité.

---

## 4. Recommandation / Plan de Correction Prescrit

1. Envelopper l'instanciation de `https.request` dans un bloc `try/catch` synchrone en plus des écouteurs `req.on('error')`.
2. Attacher un écouteur d'erreur sur le socket lui-même (`req.on('socket', s => s.on('error', ...))`).

---

## 5. Stratégie de Test E2E & Automatisation

- **Test Unitaire (Vitest)** :
  - Simuler un serveur fermant la socket immédiatement après le handshake TCP.
  - Vérifier que `getQuota()` renvoie les valeurs de secours sans lever d'exception.

---

## 6. Journal de Suivi / Résolution

| Date | Agent / Développeur | Action effectuée | Statut |
|---|---|---|---|
| 2026-09-15 | OmniAuditor | Diagnostic de la sonde quota et formalisation du ticket | `OPEN` |
| 2026-09-15 | Orchestrateur Squad | Correction appliquée et validée par les suites de tests unitaires et d'intégration | `RESOLVED` |
