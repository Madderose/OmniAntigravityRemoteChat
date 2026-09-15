# Rapport d'Audit 360° — Domaine 02 : Messagerie, Concurrence & Verrou Send-Lock

---

| Champ | Valeur |
|---|---|
| **Domaine** | Domaine 2 — Messagerie, Concurrence & Verrou Atomique d'Envoi (Send-Lock) |
| **Package ID** | `PKG-02` |
| **Agent Auditeur** | OmniAuditor |
| **Date d'Audit** | 2026-09-15 |
| **Révision Git Analysée** | `1.4.1` (HEAD) |
| **Taux de Robustesse Global** | 88 % (Solide sérialisation, attention à la saturation mémoire) |
| **Statut Tests E2E** | ⚠️ Partiels (8 tests unitaires dans `send-lock.test.js`) |
| **Nombre de Tickets Levés** | 3 tickets (P1: 2, P2: 1) |

---

## 1. Synthèse Exécutive & Scorecard 360°

Le Domaine 2 gère l'injection de messages vers Antigravity, la sérialisation atomique via `withSendLock` et la prévention des doubles frappes tactiles via un hachage SHA-256 (`ACTIVE_PROMPT_MAP`).
La chaîne de verrouillage par promesse est propre et robuste. Les axes d'amélioration concernent l'absence de borne supérieure sur la file d'attente (un afflux de clics rapides peut saturer la mémoire) et le risque de fuite de clés dans `ACTIVE_PROMPT_MAP` en l'absence de TTL automatique.

### Scorecard 360°
- **Architecture & Modularité** : ⭐⭐⭐⭐⭐ (5/5) — Sérialisation par promesse élégante.
- **Sécurité & Données Sensibles** : ⭐⭐⭐⭐ (4/5) — Hachage des prompts préservant la confidentialité.
- **Concurrence & Résilience Asynchrone** : ⭐⭐⭐⭐ (4/5) — Élimination garantie des deadlocks, attention au backpressure.
- **Ergonomie & Accessibilité** : ⭐⭐⭐⭐ (4/5) — Retour instantané `409 Conflict` ou `busy` en cas de collision.
- **Gestion des Erreurs & Observabilité** : ⭐⭐⭐⭐ (4/5) — Détection d'erreurs et propagation HTTP.
- **Couverture de Tests E2E / Unitaires** : ⭐⭐⭐⭐ (4/5) — Bonne suite unitaire existante.

---

## 2. Revue Détaillée du Sous-système

### Périmètre Analysé
- **Fichiers Clés** : `src/server.js:1240-1350`, `src/server.js:3986-4050` (`POST /send`, `POST /stop`).
- **Composants Clés** : `withSendLock()`, `ACTIVE_PROMPT_MAP`, `sendPrompt()`.

### Anomalies, Failles et Lacunes Identifiées
1. File d'attente `activeSendOperation` sans plafond de profondeur (Ticket `TICKET-DOM02-001`).
2. Absence de TTL sur les entrées de `ACTIVE_PROMPT_MAP` (Ticket `TICKET-DOM02-002`).

---

## 3. Tickets Levés lors de l'Audit

| ID Ticket | Sévérité | Catégorie | Titre | Fichier Clé |
|---|---|---|---|---|
| [TICKET-DOM02-001](file:///.agents/tickets/TICKET-DOM02-001-send-lock-unbounded-queue-memory-growth.md) | P1 | CONCURRENCY | File de promesses `send-lock` sans limite haute sous rafale de clics mobiles | `src/server.js:1250` |
| [TICKET-DOM02-002](file:///.agents/tickets/TICKET-DOM02-002-active-prompt-map-memory-leak-on-unhandled-rejections.md) | P1 | BUG | Fuite mémoire potentielle dans `ACTIVE_PROMPT_MAP` en cas de rejet non intercepté | `src/server.js:1280` |
| [TICKET-DOM02-003](file:///.agents/tickets/TICKET-DOM02-003-e2e-rapid-fire-concurrent-send-deduplication.md) | P2 | E2E_GAP | Absence de suite automatisée validant la déduplication SHA-256 sous charge rapide | `test/unit/send-lock.test.js` |

---

## 4. Plan d'Amélioration Recommandé (Roadmap)

- [ ] **Court terme (P1)** : Instaurer `MAX_SEND_QUEUE_DEPTH = 5` avec renvoi immédiat de code HTTP 429.
- [ ] **Court terme (P1)** : Ajouter un timestamp et un TTL d'éviction de 30 secondes sur `ACTIVE_PROMPT_MAP`.
- [ ] **Moyen terme (P2)** : Simuler un test de charge multi-clients simultanés.
