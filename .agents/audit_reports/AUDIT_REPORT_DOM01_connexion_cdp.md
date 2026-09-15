# Rapport d'Audit 360° — Domaine 01 : Connexion CDP, Multi-fenêtres & Cycle de Vie Antigravity

---

| Champ | Valeur |
|---|---|
| **Domaine** | Domaine 1 — Connexion CDP, Multi-fenêtres & Cycle de Vie Antigravity |
| **Package ID** | `PKG-01` |
| **Agent Auditeur** | OmniAuditor |
| **Date d'Audit** | 2026-09-15 |
| **Révision Git Analysée** | `1.4.1` (HEAD) |
| **Taux de Robustesse Global** | 82 % (Fonctionnel avec dette de routage) |
| **Statut Tests E2E** | ⚠️ Partiels (Suites unitaires présentes, manque bascule dynamique) |
| **Nombre de Tickets Levés** | 3 tickets (P1: 2, P2: 1) |

---

## 1. Synthèse Exécutive & Scorecard 360°

Le Domaine 1 orchestre la communication avec le cœur d'Antigravity via le protocole Chrome DevTools Protocol (CDP).
L'architecture de découverte multi-ports (7800-7803) et la gestion des contextes de fenêtres multiples (`discoverAllCDP()`) sont opérationnelles.
Cependant, l'audit a mis en évidence une dette d'intégration majeure : plusieurs endpoints vitaux (`/cdp-targets`, `/select-target`, `/api/launch-window`) sont déclarés dans `main()` en dehors de `createServer()`, privant les suites de tests d'intégration de ces routes. De plus, les cibles CDP figées ne sont pas validées par un ping actif avant connexion.

### Scorecard 360°
- **Architecture & Modularité** : ⭐⭐⭐ (3/5) — Routage morcelé entre `createServer()` et `main()`.
- **Sécurité & Données Sensibles** : ⭐⭐⭐⭐ (4/5) — Filtrage correct des cibles launchpad et settings.
- **Concurrence & Résilience Asynchrone** : ⭐⭐⭐⭐ (4/5) — Bon support des reconnexions WebSocket.
- **Ergonomie & Accessibilité** : ⭐⭐⭐⭐ (4/5) — Sélecteur de fenêtre mobile fonctionnel.
- **Gestion des Erreurs & Observabilité** : ⭐⭐⭐ (3/5) — Manque de ping de santé sur port figé.
- **Couverture de Tests E2E / Unitaires** : ⭐⭐⭐ (3/5) — Pas de test E2E simulant la bascule dynamique.

---

## 2. Revue Détaillée du Sous-système

### Périmètre Analysé
- **Fichiers Clés** : `src/cdp/connection.js`, `src/utils/process.js`, `src/server.js:5082-5285`.
- **Endpoints Associés** : `GET /cdp-targets`, `POST /select-target`, `POST /api/launch-window`, `GET /app-state`.

### Points Forts Constatés
- Balayage dynamique paramétrable via `CDP_PORTS`.
- Détection fine des cibles workbench grâce au titre de document et filtrage des vues annexes.
- Gestion du contexte de frame et injection sécurisée de scripts dans le runtime V8.

### Anomalies, Failles et Lacunes Identifiées
1. `src/server.js:5088-5130` : Montage hors fonction usine (`createServer()`), empêchant le test des endpoints de fenêtres.
2. `src/cdp/connection.js:45` : Risque de sélection d'une instance fantôme sans handshake de ping V8.

---

## 3. Analyse Technique Approfondie 360°

### 3.1 Concurrence & Reconnexion
Le polling d'arrière-plan tente de reconnecter le WebSocket CDP en cas de rupture de socket. Cependant, pendant la phase de négociation, les requêtes entrantes `/remote-click` renvoient un code HTTP 503 sans file de réessai.

---

## 4. Évaluation de la Couverture de Tests

- **Suites Existantes** : `test/unit/send-lock.test.js` teste la découverte de base.
- **Gaps Identifiés** : Aucun test ne valide le basculement dynamique d'une fenêtre IDE A vers une fenêtre IDE B en cours d'exécution.

---

## 5. Tickets Levés lors de l'Audit

| ID Ticket | Sévérité | Catégorie | Titre | Fichier Clé |
|---|---|---|---|---|
| [TICKET-DOM01-001](file:///.agents/tickets/TICKET-DOM01-001-candidats-cdp-stale-sans-ping.md) | P1 | BUG | Risque d'interception d'un port CDP orphelin sans vérification active de ping | `src/cdp/connection.js:45` |
| [TICKET-DOM01-002](file:///.agents/tickets/TICKET-DOM01-002-cdp-routes-unmounted-in-createserver.md) | P1 | BUG | Routes `/cdp-targets`, `/select-target` montées dans `main()` au lieu de `createServer()` | `src/server.js:5088` |
| [TICKET-DOM01-003](file:///.agents/tickets/TICKET-DOM01-003-e2e-target-switch-and-disconnect-resilience.md) | P2 | E2E_GAP | Absence de test E2E simulé sur la bascule dynamique de fenêtre et reconnexion | `test/unit/` |

---

## 6. Plan d'Amélioration Recommandé (Roadmap)

- [ ] **Court terme (P1)** : Rapatrier les routes CDP dans `createServer()`.
- [ ] **Court terme (P1)** : Ajouter un probe de santé ping V8 sur port CDP (`1+1`).
- [ ] **Moyen terme (P2)** : Écrire le test E2E simulé de changement de cible de fenêtre.
