# TICKET-DOM02-002: Fuite Mémoire Potentielle dans ACTIVE_PROMPT_MAP en Cas d'Erreur Précoce

---

| Champ | Valeur |
|---|---|
| **ID Ticket** | `TICKET-DOM02-002` |
| **Domaine** | Domaine 2 — Messagerie, Concurrence & Verrou Send-Lock |
| **Package ID** | `PKG-02` |
| **Date Création** | 2026-09-15 |
| **Rapporteur (Agent)** | OmniAuditor |
| **Statut** | `RESOLVED` |
| **Sévérité** | `P1 (Majeur / Fuite Mémoire & Concurrence)` |
| **Catégorie** | `BUG` |
| **Fichier(s) Concerné(s)` | `src/server.js:1280-1310` |
| **Suite(s) de Tests Liée(s)` | `test/unit/send-lock.test.js` |

---

## 1. Description du Problème / Constat 360°

Dans `src/server.js`, la table `ACTIVE_PROMPT_MAP` stocke le hash SHA-256 du prompt en cours d'envoi pour détecter les soumissions en double (double-tap mobile).
Le cycle normal prévoit l'insertion du hash au début de l'envoi et sa suppression dans un bloc `finally`.
Cependant, si le payload JSON envoyé par le client provoque une erreur de validation asynchrone avant l'entrée dans le bloc protégé ou si une interruption de socket se produit avant la résolution du hash, l'entrée peut rester indéfiniment bloquée dans la `Map`.
Toute tentative ultérieure d'envoyer exactement le même message sera rejetée comme "duplicate in-flight" avec une erreur 409 Conflict.

- **Comportement Attendu** : Garantie absolue de nettoyage de `ACTIVE_PROMPT_MAP` dans un bloc `try/finally` unifié et mise en place d'un TTL d'expiration automatique (ex: 30 secondes).
- **Comportement Actuel** : Risque d'entrée bloquée en cas de failure de transport.
- **Impact Applicatif / Utilisateur** : Impossibilité pour l'utilisateur de renvoyer son prompt après une erreur réseau.

---

## 2. Preuve & Emplacement dans le Code (Code Snippet)

```javascript
// Référence : src/server.js:1280-1300
// Enregistrement dans ACTIVE_PROMPT_MAP sans TTL ni nettoyage garanti sur transport error
```

---

## 3. Analyse d'Écart & Évaluation des Risques

- **Risque de Régression** : Nul.
- **Concurrence & Transactions** : Déblocage garanti des verrous logiques.

---

## 4. Recommandation / Plan de Correction Prescrit

1. Associer un horodatage à chaque entrée dans `ACTIVE_PROMPT_MAP`.
2. Purger automatiquement toute entrée de plus de 30 secondes lors des vérifications.

---

## 5. Stratégie de Test E2E & Automatisation

- **Test Unitaire (Vitest)** :
  - Simuler un échec réseau brutal en plein envoi.
  - Vérifier que le même prompt peut être renvoyé avec succès immédiatement après.

---

## 6. Journal de Suivi / Résolution

| Date | Agent / Développeur | Action effectuée | Statut |
|---|---|---|---|
| 2026-09-15 | OmniAuditor | Audit de concurrence et création du ticket | `OPEN` |
| 2026-09-15 | Orchestrateur Squad | Correction appliquée et validée par les suites de tests unitaires et d'intégration | `RESOLVED` |
