# TICKET-DOM07-001: Évasion Potentielle de Workspace via Liens Symboliques (Symlink Traversal)

---

| Champ | Valeur |
|---|---|
| **ID Ticket** | `TICKET-DOM07-001` |
| **Domaine** | Domaine 7 — Espace de Travail Distant (Terminal, Fichiers, Git & Commandes) |
| **Package ID** | `PKG-07` |
| **Date Création** | 2026-09-15 |
| **Rapporteur (Agent)** | OmniAuditor |
| **Statut** | `RESOLVED` |
| **Sévérité** | `P0 (Bloquant / Sécurité Critique)` |
| **Catégorie** | `SECURITY` |
| **Fichier(s) Concerné(s)` | `src/utils/workspace.js:57-68` |
| **Suite(s) de Tests Liée(s)` | `test/unit/simulated-e2e-workflows.test.js` |

---

## 1. Description du Problème / Constat 360°

Dans `src/utils/workspace.js`, la fonction `resolveWorkspacePath(inputPath)` est le rempart censé confiner la navigation de fichiers (`/api/fs/ls`, `/api/fs/cat`) strictement à l'intérieur de `WORKSPACE_ROOT`.

L'implémentation actuelle se contente d'une résolution lexicale :
```javascript
const normalized = inputPath || '.';
const absolute = resolve(WORKSPACE_ROOT, normalized);
const rootWithSep = WORKSPACE_ROOT.endsWith(sep) ? WORKSPACE_ROOT : `${WORKSPACE_ROOT}${sep}`;

if (absolute !== WORKSPACE_ROOT && !absolute.startsWith(rootWithSep)) {
    throw new Error('Requested path escapes the configured workspace root');
}
```
Si le répertoire du workspace contient un lien symbolique pointant en dehors de celui-ci (par exemple `ln -s /etc ./etc_symlink` créé volontairement ou cloné depuis un dépôt Git externe malveillant), le chemin `absolute` sera résolu lexicalement sous `WORKSPACE_ROOT/etc_symlink/passwd`, ce qui passe le contrôle `startsWith(rootWithSep)` !
Lors de l'ouverture du fichier (`fsp.open` ou `fsp.readFile`), le système suit le lien symbolique et permet la lecture arbitraire de n'importe quel fichier de l'hôte Linux/Windows.

- **Comportement Attendu** : La cible réelle sur le système de fichiers (`fs.realpath`) doit être résolue et vérifiée avant toute lecture/écriture.
- **Comportement Actuel** : Traversée possible par symlink vers des répertoires hors-workspace.
- **Impact Applicatif / Utilisateur** : Fuite de données sensibles (clés SSH, tokens, fichiers système).

---

## 2. Preuve & Emplacement dans le Code (Code Snippet)

```javascript
// Référence : src/utils/workspace.js:57-68
export function resolveWorkspacePath(inputPath = '.') {
    const normalized = inputPath || '.';
    const absolute = resolve(WORKSPACE_ROOT, normalized);
    const rootWithSep = WORKSPACE_ROOT.endsWith(sep) ? WORKSPACE_ROOT : `${WORKSPACE_ROOT}${sep}`;

    if (absolute !== WORKSPACE_ROOT && !absolute.startsWith(rootWithSep)) {
        throw new Error('Requested path escapes the configured workspace root');
    }

    const relativePath = absolute === WORKSPACE_ROOT ? '.' : relative(WORKSPACE_ROOT, absolute) || '.';
    return { absolute, relativePath };
}
```

---

## 3. Analyse d'Écart & Évaluation des Risques

- **Risque de Régression** : Faible.
- **Concurrence & Transactions** : Non applicable.
- **Sécurité & Données** : Critique (P0).

---

## 4. Recommandation / Plan de Correction Prescrit

1. Pour les fichiers ou dossiers existants, résoudre le chemin réel via `fs.realpathSync` ou `await fsp.realpath`.
2. Vérifier que `realPath.startsWith(rootWithSep)` ou `realPath === realWorkspaceRoot`.
3. Si le fichier n'existe pas encore (création), vérifier que le `realpath` du répertoire parent réside dans le workspace.

---

## 5. Stratégie de Test E2E & Automatisation

- **Test Unitaire & E2E Simulé** :
  - Créer un symlink temporaire dans les tests pointant vers `/tmp` ou un répertoire parent.
  - Tenter d'accéder au fichier via `resolveWorkspacePath` et `GET /api/fs/cat`.
  - Confirmer la levée d'une exception explicite interdisant l'accès.

---

## 6. Journal de Suivi / Résolution

| Date | Agent / Développeur | Action effectuée | Statut |
|---|---|---|---|
| 2026-09-15 | OmniAuditor | Détection de la faille de symlink traversal et formalisation du ticket | `OPEN` |
| 2026-09-15 | Orchestrateur Squad | Correction appliquée et validée par les suites de tests unitaires et d'intégration | `RESOLVED` |
