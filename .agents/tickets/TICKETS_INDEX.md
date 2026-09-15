# Index Central des Tickets d'Audit — OmniAntigravity Remote Chat

> **Registre exhaustif des anomalies, vulnérabilités, dettes techniques et lacunes de tests (E2E Gaps)**  
> Dernière mise à jour : 2026-09-15 23:05 · Source : Audit 360° Squad

---

## 📊 Synthèse Globale

| Total Tickets | Ouverts (`OPEN`) | En cours (`IN_PROGRESS`) | Résolus (`RESOLVED`) | Classés sans suite (`WONTFIX`) |
|:---:|:---:|:---:|:---:|:---:|
| **36** | **11** | **0** | **25** | **0** |

### Répartition par Sévérité
- **P0 (Bloquant / Sécurité Critique)** : 3 tickets (3 résolus)
- **P1 (Majeur / Bogue Applicatif / Concurrence)** : 13 tickets (13 résolus)
- **P2 (Normal / Lacune Test E2E / Ergonomie)** : 16 tickets (7 résolus, 9 ouverts)
- **P3 (Mineur / Polish / Dette Technique)** : 4 tickets (2 résolus, 2 ouverts)

### Répartition par Catégorie
- **`SECURITY`** : 5 tickets (5 résolus)
- **`BUG`** : 8 tickets (8 résolus)
- **`CONCURRENCY`** : 5 tickets (5 résolus)
- **`E2E_GAP`** : 14 tickets (4 résolus, 10 ouverts)
- **`A11Y`** : 2 tickets (1 résolu, 1 ouvert)
- **`PERF`** : 1 ticket (1 résolu)
- **`TECH_DEBT`** : 1 ticket (1 résolu)

---

## 📋 Tableau Complet des 36 Tickets d'Audit

| ID Ticket | Domaine | Titre de l'Anomalie | Sév. | Cat. | Statut | Fichier Clé | Fichier Ticket |
|---|---|---|:---:|:---:|:---:|---|---|
| `TICKET-DOM01-001` | Domaine 1 — Connexion CDP | Risque d'interception d'un port CDP orphelin sans vérification active de ping | P1 | BUG | `RESOLVED` | `src/cdp/connection.js:45` | [TICKET-DOM01-001](file:///.agents/tickets/TICKET-DOM01-001-candidats-cdp-stale-sans-ping.md) |
| `TICKET-DOM01-002` | Domaine 1 — Connexion CDP | Routes `/cdp-targets`, `/select-target` montées dans `main()` au lieu de `createServer()` | P1 | BUG | `RESOLVED` | `src/server.js:5088` | [TICKET-DOM01-002](file:///.agents/tickets/TICKET-DOM01-002-cdp-routes-unmounted-in-createserver.md) |
| `TICKET-DOM01-003` | Domaine 1 — Connexion CDP | Absence de test E2E simulé sur la bascule dynamique de fenêtre et reconnexion | P2 | E2E_GAP | `OPEN` | `test/unit/` | [TICKET-DOM01-003](file:///.agents/tickets/TICKET-DOM01-003-e2e-target-switch-and-disconnect-resilience.md) |
| `TICKET-DOM02-001` | Domaine 2 — Messagerie & Concurrence | File de promesses `send-lock` sans limite haute sous rafale de clics mobiles | P1 | CONCURRENCY | `RESOLVED` | `src/server.js:1250` | [TICKET-DOM02-001](file:///.agents/tickets/TICKET-DOM02-001-send-lock-unbounded-queue-memory-growth.md) |
| `TICKET-DOM02-002` | Domaine 2 — Messagerie & Concurrence | Fuite mémoire potentielle dans `ACTIVE_PROMPT_MAP` en cas de rejet non intercepté | P1 | BUG | `RESOLVED` | `src/server.js:1280` | [TICKET-DOM02-002](file:///.agents/tickets/TICKET-DOM02-002-active-prompt-map-memory-leak-on-unhandled-rejections.md) |
| `TICKET-DOM02-003` | Domaine 2 — Messagerie & Concurrence | Absence de suite automatisée validant la déduplication SHA-256 sous charge rapide | P2 | E2E_GAP | `OPEN` | `test/unit/send-lock.test.js` | [TICKET-DOM02-003](file:///.agents/tickets/TICKET-DOM02-003-e2e-rapid-fire-concurrent-send-deduplication.md) |
| `TICKET-DOM03-001` | Domaine 3 — Éditeur Lexical | Désynchronisation potentielle des sauts de ligne multi-paragraphes dans l'arbre Lexical | P1 | BUG | `RESOLVED` | `src/server.js:1840` | [TICKET-DOM03-001](file:///.agents/tickets/TICKET-DOM03-001-lexical-multiline-shift-enter-dom-desync.md) |
| `TICKET-DOM03-002` | Domaine 3 — Éditeur Lexical | Manque de couverture E2E sur la validation des limites de staging avant soumission | P2 | E2E_GAP | `RESOLVED` | `src/server.js:1920` | [TICKET-DOM03-002](file:///.agents/tickets/TICKET-DOM03-002-e2e-lexical-staging-boundary-validation.md) |
| `TICKET-DOM04-001` | Domaine 4 — Questions & Approbations | Absence de validation stricte sur l'index d'option soumis dans `/api/interact-action` | P1 | BUG | `RESOLVED` | `src/server.js:3767` | [TICKET-DOM04-001](file:///.agents/tickets/TICKET-DOM04-001-interact-action-unvalidated-option-index.md) |
| `TICKET-DOM04-002` | Domaine 4 — Questions & Approbations | Couverture E2E incomplète sur l'interception `ask_question` et verrous de grâce | P2 | E2E_GAP | `OPEN` | `test/unit/action-decision.test.js` | [TICKET-DOM04-002](file:///.agents/tickets/TICKET-DOM04-002-e2e-ask-question-optimistic-tap-and-grace-lock.md) |
| `TICKET-DOM05-001` | Domaine 5 — Snapshot & WebSocket | Absence de contrôle de contre-pression (backpressure) et purge des sockets lents | P1 | PERF | `RESOLVED` | `src/server.js:4980` | [TICKET-DOM05-001](file:///.agents/tickets/TICKET-DOM05-001-websocket-broadcast-backpressure-and-dead-client-prune.md) |
| `TICKET-DOM05-002` | Domaine 5 — Snapshot & WebSocket | Lacune de test E2E simulant la réconciliation morphdom-lite et reconnexion WS | P2 | E2E_GAP | `OPEN` | `public/js/vendor/morphdom-lite.js` | [TICKET-DOM05-002](file:///.agents/tickets/TICKET-DOM05-002-e2e-snapshot-hash-diff-and-reconnection.md) |
| `TICKET-DOM06-001` | Domaine 6 — Authentification & Sécurité | Faille P0 dans `isLocalRequest` autorisant par erreur les blocs IP publics `172.x` | P0 | SECURITY | `RESOLVED` | `src/utils/network.js:59` | [TICKET-DOM06-001](file:///.agents/tickets/TICKET-DOM06-001-lan-auth-bypass-ip-cidr-leak.md) |
| `TICKET-DOM06-002` | Domaine 6 — Authentification & Sécurité | `AUTH_TOKEN` recalculé avec `Date.now()` à chaque relance serveur (déconnexion mobile) | P1 | BUG | `RESOLVED` | `src/server.js:3389` | [TICKET-DOM06-002](file:///.agents/tickets/TICKET-DOM06-002-auth-token-invalidation-on-server-reboot.md) |
| `TICKET-DOM06-003` | Domaine 6 — Authentification & Sécurité | Comparaison de mot de passe vulnérable aux attaques par timing (`===` vs `timingSafeEqual`) | P1 | SECURITY | `RESOLVED` | `src/server.js:3480` | [TICKET-DOM06-003](file:///.agents/tickets/TICKET-DOM06-003-timing-attack-vulnerability-app-password.md) |
| `TICKET-DOM06-004` | Domaine 6 — Authentification & Sécurité | Couverture E2E insuffisante sur la protection uniforme des 60+ routes | P2 | E2E_GAP | `RESOLVED` | `src/server.js:3420` | [TICKET-DOM06-004](file:///.agents/tickets/TICKET-DOM06-004-e2e-auth-middleware-and-csrf-protection.md) |
| `TICKET-DOM07-001` | Domaine 7 — Workspace & Terminal | Risque d'évasion de workspace via liens symboliques dans `resolveWorkspacePath` | P0 | SECURITY | `RESOLVED` | `src/utils/workspace.js:57` | [TICKET-DOM07-001](file:///.agents/tickets/TICKET-DOM07-001-symlink-traversal-escape-workspace-path.md) |
| `TICKET-DOM07-002` | Domaine 7 — Workspace & Terminal | Fuite de sous-processus zombies dans `terminalManager.stop()` (pas de process group kill) | P1 | BUG | `RESOLVED` | `src/utils/workspace.js:558` | [TICKET-DOM07-002](file:///.agents/tickets/TICKET-DOM07-002-terminal-orphan-zombie-processes-on-sigterm.md) |
| `TICKET-DOM07-003` | Domaine 7 — Workspace & Terminal | Absence de test E2E sur l'interruption de commande longue et gestion d'erreurs Git | P2 | E2E_GAP | `OPEN` | `src/utils/workspace.js:210` | [TICKET-DOM07-003](file:///.agents/tickets/TICKET-DOM07-003-e2e-terminal-lifecycle-and-git-error-propagation.md) |
| `TICKET-DOM08-001` | Domaine 8 — Multimédia & Uploads | Absence de rétention et purge automatique sur le répertoire `data/uploads/` | P2 | TECH_DEBT | `RESOLVED` | `src/utils/workspace.js:362` | [TICKET-DOM08-001](file:///.agents/tickets/TICKET-DOM08-001-upload-disk-storage-unbounded-accumulation.md) |
| `TICKET-DOM08-002` | Domaine 8 — Multimédia & Uploads | Manque de test E2E vérifiant le rejet des payloads audio/image invalides ou > 15MB | P2 | E2E_GAP | `RESOLVED` | `src/utils/workspace.js:402` | [TICKET-DOM08-002](file:///.agents/tickets/TICKET-DOM08-002-e2e-media-upload-size-limit-and-mime-enforcement.md) |
| `TICKET-DOM09-001` | Domaine 9 — Quotas & Language Server | Risque de promesse rejetée non interceptée si `language_server` se ferme en cours de sonde | P2 | BUG | `RESOLVED` | `src/quota-service.js:280` | [TICKET-DOM09-001](file:///.agents/tickets/TICKET-DOM09-001-quota-service-unhandled-rejection-on-closed-port.md) |
| `TICKET-DOM09-002` | Domaine 9 — Quotas & Language Server | Test E2E manquant sur la dégradation gracieuse du quota en l'absence de language server | P3 | E2E_GAP | `OPEN` | `test/unit/quota-service.test.js` | [TICKET-DOM09-002](file:///.agents/tickets/TICKET-DOM09-002-e2e-quota-polling-retry-and-offline-grace.md) |
| `TICKET-DOM10-001` | Domaine 10 — Timeline de Captures | Concurrence d'écritures asynchrones sur `manifest.json` lors de captures d'écran proches | P1 | CONCURRENCY | `RESOLVED` | `src/screenshot-timeline.js:145` | [TICKET-DOM10-001](file:///.agents/tickets/TICKET-DOM10-001-screenshot-timeline-manifest-concurrent-write-hazard.md) |
| `TICKET-DOM10-002` | Domaine 10 — Timeline de Captures | Couverture E2E absente pour valider la purge FIFO au seuil configuré | P2 | E2E_GAP | `OPEN` | `test/unit/screenshot-timeline.test.js` | [TICKET-DOM10-002](file:///.agents/tickets/TICKET-DOM10-002-e2e-timeline-fifo-pruning-and-cleanup.md) |
| `TICKET-DOM11-001` | Domaine 11 — Superviseur IA | Risque de contournement des heuristiques de sécurité sur commandes bash obfusquées | P1 | SECURITY | `RESOLVED` | `src/supervisor.js:320` | [TICKET-DOM11-001](file:///.agents/tickets/TICKET-DOM11-001-supervisor-destructive-command-heuristic-bypass.md) |
| `TICKET-DOM11-002` | Domaine 11 — Superviseur IA | Lacune E2E sur l'approbation/rejet des suggestions sous instabilité réseau | P2 | E2E_GAP | `OPEN` | `test/unit/supervisor.test.js` | [TICKET-DOM11-002](file:///.agents/tickets/TICKET-DOM11-002-e2e-supervisor-suggest-queue-and-approval-flow.md) |
| `TICKET-DOM12-001` | Domaine 12 — Bot Telegram | Abandon silencieux des notifications en cas de dépassement de cadence (rate-limiting) | P2 | BUG | `RESOLVED` | `src/utils/telegram.js:180` | [TICKET-DOM12-001](file:///.agents/tickets/TICKET-DOM12-001-telegram-bot-rate-limit-message-drop-without-queue.md) |
| `TICKET-DOM12-002` | Domaine 12 — Bot Telegram | Tests E2E manquants sur la restriction stricte des commandes aux `TELEGRAM_ALLOWED_USERS` | P2 | SECURITY | `RESOLVED` | `test/unit/telegram.test.js` | [TICKET-DOM12-002](file:///.agents/tickets/TICKET-DOM12-002-e2e-telegram-command-dispatch-and-auth-guard.md) |
| `TICKET-DOM13-001` | Domaine 13 — Tunnels & SSL | Processus tunnel résiduel en arrière-plan lors de l'arrêt inattendu de Node.js | P1 | BUG | `RESOLVED` | `scripts/cloudflare-tunnel.js:80` | [TICKET-DOM13-001](file:///.agents/tickets/TICKET-DOM13-001-tunnel-process-spawn-cleanup-on-abrupt-exit.md) |
| `TICKET-DOM13-002` | Domaine 13 — Tunnels & SSL | Manque de test automatisé simulant la bascule failover Cloudflare vers Pinggy | P2 | E2E_GAP | `OPEN` | `launcher.js:140` | [TICKET-DOM13-002](file:///.agents/tickets/TICKET-DOM13-002-e2e-tunnel-failover-and-health-probe.md) |
| `TICKET-DOM14-001` | Domaine 14 — Frontend Mobile & PWA | Glissement de vue mobile et masquage d'input lors de l'ouverture du clavier virtuel | P1 | A11Y | `RESOLVED` | `public/js/app.js:840` | [TICKET-DOM14-001](file:///.agents/tickets/TICKET-DOM14-001-mobile-virtual-keyboard-viewport-resizing-desync.md) |
| `TICKET-DOM14-002` | Domaine 14 — Frontend Mobile & PWA | Invalidation lente des assets en cache PWA (`sw.js`) lors d'une mise à jour | P2 | BUG | `RESOLVED` | `public/sw.js:15` | [TICKET-DOM14-002](file:///.agents/tickets/TICKET-DOM14-002-service-worker-cache-stale-asset-invalidation.md) |
| `TICKET-DOM14-003` | Domaine 14 — Frontend Mobile & PWA | Absence de test automatisé validant la taille des cibles tactiles et le changement de thème | P2 | A11Y | `OPEN` | `public/css/themes.css` | [TICKET-DOM14-003](file:///.agents/tickets/TICKET-DOM14-003-e2e-mobile-viewport-touch-targets-and-theme-switch.md) |
| `TICKET-DOM15-001` | Domaine 15 — Panneau Admin | Croissance non bornée des logs serveur en mémoire dans `serverLogs` | P2 | PERF | `RESOLVED` | `src/server.js:4600` | [TICKET-DOM15-001](file:///.agents/tickets/TICKET-DOM15-001-admin-panel-unprotected-log-memory-accumulation.md) |
| `TICKET-DOM15-002` | Domaine 15 — Panneau Admin | Lacune de test E2E vérifiant l'exactitude des métriques et le contrôle du tunnel | P3 | E2E_GAP | `OPEN` | `public/js/admin.js` | [TICKET-DOM15-002](file:///.agents/tickets/TICKET-DOM15-002-e2e-admin-metrics-and-tunnel-toggle.md) |
