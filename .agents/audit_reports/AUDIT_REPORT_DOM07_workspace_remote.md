# Rapport d'Audit 360° — Domaine 07 : Espace de Travail Distant (Terminal, Fichiers, Git & Commandes)

---

| Champ | Valeur |
|---|---|
| **Domaine** | Domaine 7 — Espace de Travail Distant (Terminal, Fichiers, Git & Commandes) |
| **Package ID** | `PKG-07` |
| **Agent Auditeur** | OmniAuditor |
| **Date d'Audit** | 2026-09-15 |
| **Révision Git Analysée** | `1.4.1` (HEAD) |
| **Taux de Robustesse Global** | 68 % (Deux failles critiques : symlink traversal P0 et zombies P1) |
| **Statut Tests E2E** | ❌ Insuffisants (Absence totale de test sur la terminaison propre de sous-processus) |
| **Nombre de Tickets Levés** | 3 tickets (P0: 1, P1: 1, P2: 1) |

---

## 1. Synthèse Exécutive & Scorecard 360°

Le Domaine 7 fournit la boîte à outils développeur à distance : explorateur de répertoires (`/api/fs/ls`, `cat`), panneau Git (`status`, `add`, `commit`, `push`), et exécution de commandes shell en streaming (`/api/terminal/run`, `stop`).
L'audit a identifié deux faiblesses graves :
1. **Évasion de workspace via liens symboliques (P0)** : `resolveWorkspacePath` valide la chaîne de chemin mais n'appelle pas `fs.realpath`, ce qui permet d'accéder à l'ensemble du disque via des symlinks.
2. **Processus zombies (P1)** : `terminalManager.stop()` émet un `SIGTERM` sur le seul shell parent, laissant les processus compilateurs ou serveurs orphelins en arrière-plan.

### Scorecard 360°
- **Architecture & Modularité** : ⭐⭐⭐⭐ (4/5) — Événements de streaming EventEmitter bien conçus.
- **Sécurité & Données Sensibles** : ⭐ (1/5) — Risque d'évasion système par symlink.
- **Concurrence & Résilience Asynchrone** : ⭐⭐ (2/5) — Fuite de processus non nettoyés.
- **Ergonomie & Accessibilité** : ⭐⭐⭐⭐ (4/5) — Terminal mobile fluide avec auto-scroll.
- **Gestion des Erreurs & Observabilité** : ⭐⭐⭐ (3/5)
- **Couverture de Tests E2E / Unitaires** : ⭐ (1/5) — Aucun test sur `workspace.js` dans la suite actuelle !

---

## 2. Tickets Levés lors de l'Audit

| ID Ticket | Sévérité | Catégorie | Titre | Fichier Clé |
|---|---|---|---|---|
| [TICKET-DOM07-001](file:///.agents/tickets/TICKET-DOM07-001-symlink-traversal-escape-workspace-path.md) | P0 | SECURITY | Risque d'évasion de workspace via liens symboliques dans `resolveWorkspacePath` | `src/utils/workspace.js:57` |
| [TICKET-DOM07-002](file:///.agents/tickets/TICKET-DOM07-002-terminal-orphan-zombie-processes-on-sigterm.md) | P1 | BUG | Fuite de sous-processus zombies dans `terminalManager.stop()` (pas de process group kill) | `src/utils/workspace.js:558` |
| [TICKET-DOM07-003](file:///.agents/tickets/TICKET-DOM07-003-e2e-terminal-lifecycle-and-git-error-propagation.md) | P2 | E2E_GAP | Absence de test E2E sur l'interruption de commande longue et gestion d'erreurs Git | `src/utils/workspace.js:210` |

---

## 3. Plan d'Amélioration Recommandé (Roadmap)

- [ ] **Immédiat (P0)** : Résoudre `fs.realpath` dans `resolveWorkspacePath` pour bloquer les symlinks hors workspace.
- [ ] **Court terme (P1)** : Utiliser `detached: true` et tuer le groupe de processus (`-pid`) dans `TerminalManager`.
- [ ] **Court terme (P2)** : Créer une suite Vitest complète pour tester unitairement `src/utils/workspace.js`.
