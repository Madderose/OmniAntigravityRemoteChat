# TICKET-DOM13-001: Persistance de Processus Tunnel Orphelins lors d'un Arrêt Brutal du Launcher

---

| Champ | Valeur |
|---|---|
| **ID Ticket** | `TICKET-DOM13-001` |
| **Domaine** | Domaine 13 — Tunnels Distants, SSL & Déploiement Hybride |
| **Package ID** | `PKG-13` |
| **Date Création** | 2026-09-15 |
| **Rapporteur (Agent)** | OmniAuditor |
| **Statut** | `RESOLVED` |
| **Sévérité** | `P1 (Majeur / Gestion de Processus)` |
| **Catégorie** | `BUG` |
| **Fichier(s) Concerné(s)` | `scripts/cloudflare-tunnel.js:75-110`, `scripts/pinggy-tunnel.js:80-120`, `launcher.js:140` |
| **Suite(s) de Tests Liée(s)` | `test/unit/simulated-e2e-workflows.test.js` |

---

## 1. Description du Problème / Constat 360°

Dans `scripts/cloudflare-tunnel.js` et `scripts/pinggy-tunnel.js`, le gestionnaire de tunnel démarre le binaire externe (`cloudflared` ou `ssh`) via `spawn`.
Lors d'une interruption normale (`SIGINT` via `Ctrl+C`), les écouteurs de `launcher.js` appellent `tunnel.stop()`.
Cependant, si le launcher subit une interruption inconditionnelle (`SIGKILL`, coupure brutale, redémarrage de terminal parent WSL), les écouteurs Node.js ne sont pas invoqués et les processus `cloudflared` ou `ssh` continuent de tourner en arrière-plan.
Au démarrage suivant, un nouveau tunnel est créé, ce qui engendre des URL de tunnel différentes ou des conflits de proxy local.

- **Comportement Attendu** : Vérifier et purger les processus tunnels orphelins résiduels avant tout nouveau lancement.
- **Comportement Actuel** : Accumulation possible d'instances fantômes de `cloudflared` ou `ssh`.
- **Impact Applicatif / Utilisateur** : Confusion sur l'URL publique active et consommation mémoire résiduelle.

---

## 2. Preuve & Emplacement dans le Code (Code Snippet)

```javascript
// Référence : scripts/cloudflare-tunnel.js:75-90
// Spawn direct sans vérification d'instances antérieures
this.process = spawn(this.binPath, args, { stdio: ['ignore', 'pipe', 'pipe'] });
```

---

## 3. Analyse d'Écart & Évaluation des Risques

- **Risque de Régression** : Nul.
- **Concurrence & Transactions** : Conflits multi-instances.

---

## 4. Recommandation / Plan de Correction Prescrit

1. Ajouter une méthode `static cleanupOrphans()` inspectant `pgrep -f cloudflared` ou `pgrep -f pinggy` avant le démarrage.
2. Écouter également `process.on('exit')` et `process.on('beforeExit')` en plus de `SIGINT` et `SIGTERM`.

---

## 5. Stratégie de Test E2E & Automatisation

- **Test Unitaire & E2E Simulé** :
  - Démarrer un processus mock simulant un tunnel orphelin.
  - Invoquer le gestionnaire et constater la détection et le nettoyage préalable de l'instance orpheline.

---

## 6. Journal de Suivi / Résolution

| Date | Agent / Développeur | Action effectuée | Statut |
|---|---|---|---|
| 2026-09-15 | OmniAuditor | Audit des scripts de tunneling et création du ticket | `OPEN` |
| 2026-09-15 | Orchestrateur Squad | Correction appliquée et validée par les suites de tests unitaires et d'intégration | `RESOLVED` |
