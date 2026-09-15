# TICKET-DOM07-002: Fuite de Sous-Processus Zombies dans TerminalManager lors de SIGTERM

---

| Champ | Valeur |
|---|---|
| **ID Ticket** | `TICKET-DOM07-002` |
| **Domaine** | Domaine 7 — Espace de Travail Distant (Terminal, Fichiers, Git & Commandes) |
| **Package ID** | `PKG-07` |
| **Date Création** | 2026-09-15 |
| **Rapporteur (Agent)** | OmniAuditor |
| **Statut** | `RESOLVED` |
| **Sévérité** | `P1 (Majeur / Bogue Applicatif)` |
| **Catégorie** | `BUG` |
| **Fichier(s) Concerné(s)` | `src/utils/workspace.js:527-566` |
| **Suite(s) de Tests Liée(s)` | `test/unit/simulated-e2e-workflows.test.js` |

---

## 1. Description du Problème / Constat 360°

Dans `src/utils/workspace.js`, la classe `TerminalManager` lance les commandes de terminal demandées par le client mobile via `spawn(shell, args, { cwd: WORKSPACE_ROOT, ... })`.
Lorsque le client clique sur le bouton "Stop Terminal" ou envoie `POST /api/terminal/stop`, la méthode `stop()` s'exécute :
```javascript
async stop() {
    if (!this.process) {
        return { success: true };
    }
    this.process.kill('SIGTERM');
    this.pushLog('system', 'Termination requested by mobile client');
    return { success: true };
}
```
Sous Linux et macOS, `this.process` est le shell parent (`bash`). Envoyer `SIGTERM` au seul shell tue ce dernier, mais ne transmet pas automatiquement le signal aux processus enfants qu'il a engendrés (par exemple `npm run dev`, `python server.py`, `vite`, `docker build`). Ces processus fils deviennent orphelins, sont rattachés au processus `init`/`systemd` (PID 1) et continuent de tourner en arrière-plan en consommant du CPU, de la RAM et en bloquant les ports réseau.

- **Comportement Attendu** : La terminaison d'une session de terminal doit nettoyer l'intégralité de l'arborescence des processus (process group kill).
- **Comportement Actuel** : Les sous-processus restent actifs en mémoire comme processus fantômes/zombies.
- **Impact Applicatif / Utilisateur** : Épuisement des ressources système, conflits de ports lors des relances ultérieures.

---

## 2. Preuve & Emplacement dans le Code (Code Snippet)

```javascript
// Référence : src/utils/workspace.js:527-532 & 558-566
const shell = process.platform === 'win32' ? (process.env.ComSpec || 'cmd.exe') : (process.env.SHELL || 'bash');
const args = process.platform === 'win32' ? ['/d', '/s', '/c', this.command] : ['-lc', this.command];
this.process = spawn(shell, args, {
    cwd: WORKSPACE_ROOT,
    env: { ...process.env, FORCE_COLOR: '0' }
});

// ...
async stop() {
    if (!this.process) {
        return { success: true };
    }
    this.process.kill('SIGTERM');
    return { success: true };
}
```

---

## 3. Analyse d'Écart & Évaluation des Risques

- **Risque de Régression** : Faible.
- **Concurrence & Transactions** : Risque de blocage lors du spawn de commandes concurrentes.
- **Sécurité & Données** : Fuite de ressources CPU/RAM.

---

## 4. Recommandation / Plan de Correction Prescrit

1. Spawner le processus dans son propre groupe de processus via l'option `detached: true` sous Unix :
   ```javascript
   this.process = spawn(shell, args, {
       cwd: WORKSPACE_ROOT,
       detached: process.platform !== 'win32',
       env: { ...process.env, FORCE_COLOR: '0' }
   });
   ```
2. Lors du `stop()` :
   - Sous Unix : tuer le groupe de processus complet via `process.kill(-this.process.pid, 'SIGTERM')` avec fallback `SIGKILL` après un délai de 2 secondes.
   - Sous Windows : exécuter `taskkill /pid ${this.process.pid} /T /F`.

---

## 5. Stratégie de Test E2E & Automatisation

- **Test Unitaire & E2E Simulé** :
  - Spawner une commande bash créant un sous-processus `sleep 100`.
  - Invoquer `stop()`.
  - Vérifier par `pgrep` ou inspection de PID que le sous-processus `sleep` a bien été éliminé.

---

## 6. Journal de Suivi / Résolution

| Date | Agent / Développeur | Action effectuée | Statut |
|---|---|---|---|
| 2026-09-15 | OmniAuditor | Constat de la fuite de sous-processus et rédaction du ticket | `OPEN` |
| 2026-09-15 | Orchestrateur Squad | Correction appliquée et validée par les suites de tests unitaires et d'intégration | `RESOLVED` |
