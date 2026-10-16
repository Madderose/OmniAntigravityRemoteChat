Voici ma revue critique d'architecture en tant que **Principal Software Engineer (PSE)** et **Architecte Logiciel Senior**, fondée sur l'inspection croisée du plan [PLAN_RENAISSANCE_OMNIANTIGRAVITY_V2.md](file:///C:/Users/hoppj/SynologyDrive/01_Projets/OmniAntigravityRemoteChat/docs/PLAN_RENAISSANCE_OMNIANTIGRAVITY_V2.md) et de l'état réel du code source sur le socle `v1.6.0`.

---

## 1. Évaluation Globale de la Stratégie (Socle v1.6.0 & Propriété `Madderose`)

### ✅ Pertinence du retour au socle `feat/native-voice-memo-attachment` (`77d8fd6`)
La décision d'abandonner le *Big Bang Merge* (`feat/omni-v2-unified-merge`) au profit d'une approche **Strangler Fig / Intégration Incrémentale** sur la base `v1.6.0` est **irréprochable** :
- Le socle `v1.6.0` intègre déjà 100 % des correctifs d'audit sécurité P0/P1, l'isolation multi-fenêtres par `localStorage`, le compteur de non-lus $O(1)$ et le pipeline complet de mémos vocaux ([test/unit/upload-audio.test.js](file:///C:/Users/hoppj/SynologyDrive/01_Projets/OmniAntigravityRemoteChat/test/unit/upload-audio.test.js#L6-L38)).
- Réintroduire les briques v2.0 (Zero-CDP, pont CLI `agy`, extension VS Code) sous forme de plugins/services découplés garantit qu'aucune fonctionnalité existante ne subira de régression silencieuse.

### ⚠️ Points de gouvernance à compléter sur la reprise `Madderose`
1. **Métadonnées orphelines dans [package.json](file:///C:/Users/hoppj/SynologyDrive/01_Projets/OmniAntigravityRemoteChat/package.json#L18-L25) :** Les champs `homepage`, `repository.url` et `bugs.url` pointent toujours vers `https://github.com/diegosouzapw/OmniAntigravityRemoteChat`. Ils doivent être réalignés sur `Madderose/OmniAntigravityRemoteChat`.
2. **Stratégie SemVer :** Le passage d'une architecture exclusivement dépendante de CDP à une architecture hybride (Zero-CDP + `agy` CLI + Extension VS Code) doit suivre un jalonnement SemVer strict :
   - `v1.6.1` : Fix CI + Harnais Vitest + Suite E2E du socle (Tickets 1 & 2).
   - `v1.7.0` : Services découplés `TranscriptWatcher` & `AgyBridge` + UI Progressive Disclosure (Tickets 3, 4, 5).
   - `v2.0.0` : Activation complète du moteur hybride `ExecutionEngine` et du cockpit VS Code (Ticket 6).

---

## 2. Analyse de la Conformité SOLID & Découplage (`services` vs `server.js`)

### 🔴 Constat sur la dette structurelle actuelle
L'inspection de [src/server.js](file:///C:/Users/hoppj/SynologyDrive/01_Projets/OmniAntigravityRemoteChat/src/server.js#L1-L120) révèle que le fichier atteint déjà **6 289 lignes** sur le socle `v1.6.0`. Pire : les lignes [84 à 105 de src/server.js](file:///C:/Users/hoppj/SynologyDrive/01_Projets/OmniAntigravityRemoteChat/src/server.js#L84-L105) redéclarent localement les variables mutables (`let cdpConnection`, `let lastSnapshot`, `let availableTargets`, etc.) déjà définies dans [src/state.js](file:///C:/Users/hoppj/SynologyDrive/01_Projets/OmniAntigravityRemoteChat/src/state.js#L40-L60).

### 🛠️ Exigences d'Architecture SOLID pour la v2.0
1. **Single Responsibility Principle (SRP) — Plafond strict sur [src/server.js](file:///C:/Users/hoppj/SynologyDrive/01_Projets/OmniAntigravityRemoteChat/src/server.js) :**
   - **Règle d'or pour les sous-agents :** Aucun sous-agent n'est autorisé à ajouter plus de **30 lignes** dans [src/server.js](file:///C:/Users/hoppj/SynologyDrive/01_Projets/OmniAntigravityRemoteChat/src/server.js) (uniquement l'import et le montage des routes/services).
   - Créer un répertoire `src/services/` contenant des modules autonomes testables unitairement sans démarrer Express.
2. **Open/Closed Principle (OCP) — Formaliser le contrat `ExecutionEngine` :**
   - Le plan mentionne `ExecutionEngine` ([PLAN_RENAISSANCE_OMNIANTIGRAVITY_V2.md](file:///C:/Users/hoppj/SynologyDrive/01_Projets/OmniAntigravityRemoteChat/docs/PLAN_RENAISSANCE_OMNIANTIGRAVITY_V2.md#L70)), mais **aucun ticket ne le crée**.
   - Si cette abstraction n'est pas codée avant le Ticket 4, le sous-agent polluera les routes `/send`, `/stop` et `/set-model` avec des `if (mode === 'direct_agy')`.
   - Il faut définir une interface/classe de base `src/services/execution-engine.js` exposant un contrat uniforme :
     - `sendMessage(payload, options)`
     - `stopExecution(targetId)`
     - `setModelAndEffort(modelId, effortLevel)`
     - `getHealthStatus()`
3. **Dependency Inversion Principle (DIP) & Éradication des mutations ESM :**
   - Les services `TranscriptWatcherService` et `AgyBridgeService` doivent hériter de `EventEmitter` (ou recevoir un bus d'événements injecté au constructeur) et émettre des événements normalisés (`transcript:delta`, `transcript:unread`, `agy:chunk`, `agy:exit`, `agy:error`).
   - [src/server.js](file:///C:/Users/hoppj/SynologyDrive/01_Projets/OmniAntigravityRemoteChat/src/server.js) s'abonne à ces événements pour diffuser via WebSocket (`broadcast()`), exactement comme il le fait déjà proprement avec `suggestionQueueUnsubscribe` et `timelineUnsubscribe` ([lignes 110-116 de src/server.js](file:///C:/Users/hoppj/SynologyDrive/01_Projets/OmniAntigravityRemoteChat/src/server.js#L110-L116)).

---

## 3. Critique UI/UX & Progressive Disclosure

### A. Conflit Mémo Vocal Natif vs Dictée Web Speech API
Dans [public/index.html](file:///C:/Users/hoppj/SynologyDrive/01_Projets/OmniAntigravityRemoteChat/public/index.html#L328-L345), la barre de saisie contient déjà `#voiceMemoBtn` et `#voiceRecordingBar`, ainsi qu'un interrupteur `#voiceMemoSettingBtn` dans le menu overflow ([lignes 119-125](file:///C:/Users/hoppj/SynologyDrive/01_Projets/OmniAntigravityRemoteChat/public/index.html#L119-L125)).

* **Critique de la proposition du Ticket 5 ("Appui court = dictée, Appui long = mémo audio") :**
  - ⚠️ **Anti-pattern tactile mobile :** Sur iOS Safari (PWA) et Chrome Android, un `touchstart` prolongé entre en conflit avec la loupe de sélection native, le menu contextuel de l'OS et la gestion des permissions micro (`getUserMedia` vs `webkitSpeechRecognition`). De plus, l'utilisateur ne devine jamais l'existence d'un appui long sans repère visuel.
  - ⚠️ **Support navigateur asymétrique :** `MediaRecorder` (mémo vocal natif) fonctionne partout, tandis que `SpeechRecognition` (Web Speech API) échoue souvent sur iOS PWA ou sous Firefox/Linux.
* **Solution Progressive Disclosure recommandée :**
  1. **Un seul bouton micro (`#voiceMemoBtn`)** dans `.input-wrapper`. Jamais deux boutons côte à côte.
  2. **Sélecteur de mode vocal explicite dans `#voiceMemoSettingBtn` ([public/index.html](file:///C:/Users/hoppj/SynologyDrive/01_Projets/OmniAntigravityRemoteChat/public/index.html#L119-L125)) :** Faire évoluer le toggle actuel (`On / Off`) vers un cycle 3 états persisté dans `localStorage` : **`Audio Memo` (défaut) → `Live Dictation` (si supporté) → `Off`**, avec changement d'icône subtil sur `#voiceMemoBtn` (micro onde vs micro texte).
  3. Si l'utilisateur souhaite changer à la volée, un **glisser-vers-le-haut (ou mini-pill flottant au-dessus du bouton pendant l'enregistrement)** permet de basculer sans encombrer la barre de saisie au repos.

### B. Sélecteur d'Effort de Réflexion (`Thinking Tier`)
L'inspection de `.settings-bar` dans [public/index.html](file:///C:/Users/hoppj/SynologyDrive/01_Projets/OmniAntigravityRemoteChat/public/index.html#L175-L197) montre que **5 chips** occupent déjà toute la largeur d'un viewport mobile de `375px` (`#modelBtn`, `#workspaceToggleBtn`, `#suggestionsBtn`, `#quotaBtn`, `#syncStatusChip`).
- Remarquez la ligne [176 de public/index.html](file:///C:/Users/hoppj/SynologyDrive/01_Projets/OmniAntigravityRemoteChat/public/index.html#L176) : `<button class="setting-chip" id="modelBtn" title="Switch AI Model & Thinking Tier">`. L'emplacement avait déjà été anticipé !
- **Directive UI ferme :** Zéro nouveau chip et zéro `.effort-pills` dans `.settings-bar`. Le choix du niveau d'effort (`Low` / `Medium` / `High`) doit être logé **en en-tête de la modale de sélection de modèle (`#modalOverlay`)** déclenchée par `#modelBtn`, et résumé de manière ultra-compacte dans `#modelText` (ex: `Claude 3.7 · High` ou badge `H`).

---

## 4. Analyse de la Stratégie de Test E2E (Lisibilité, Résilience, Couverture)

### A. Risque du "Faux E2E" et Architecture du Harnais
Dans [vitest.config.js](file:///C:/Users/hoppj/SynologyDrive/01_Projets/OmniAntigravityRemoteChat/vitest.config.js#L6-L7), Vitest n'inclut actuellement que `test/unit/**/*.test.js`.
Pour que `test/e2e/user-journeys.e2e.test.js` soit réellement à **haute lisibilité** et **100 % déterministe en CI Ubuntu/Windows** :
1. **Pattern DSL Given/When/Then :** Interdire les appels `fetch()` et WebSocket bruts de 50 lignes au milieu des blocs `it()`. Créer un helper `test/e2e/harness/journey-client.js` permettant d'écrire :
   ```js
   await scenario('Parcours Vocal : Enregistrement et émission d’un mémo natif')
     .given.authenticatedMobileClient()
     .when.userUploadsVoiceMemo({ mimeType: 'audio/webm;codecs=opus', durationSeconds: 8 })
     .and.userSendsStagedPrompt('Analyse ce mémo vocal')
     .then.chatReceivesAttachment('.webm')
     .and.sessionStatsReflectUpload(1);
   ```
2. **Couverture dans [vitest.config.js](file:///C:/Users/hoppj/SynologyDrive/01_Projets/OmniAntigravityRemoteChat/vitest.config.js#L14-L24) :** Ajouter `src/services/**/*.js` et `src/utils/workspace.js` dans la liste `coverage.include` qui est actuellement figée en dur.

### B. Scénario E2E manquant dans le Plan
Le Ticket 2 ([PLAN_RENAISSANCE_OMNIANTIGRAVITY_V2.md](file:///C:/Users/hoppj/SynologyDrive/01_Projets/OmniAntigravityRemoteChat/docs/PLAN_RENAISSANCE_OMNIANTIGRAVITY_V2.md#L100-L106)) couvre 4 parcours de la `v1.6.0`, mais **omet de tester les nouvelles briques v2.0** ! Il faut ajouter un **5e scénario obligatoire** (activé dès la fin des Tickets 3 & 4) :
- **Scénario 5 — *Parcours Zero-CDP & Pont `agy`*** : *Écriture incrémentale dans un fichier `transcript.jsonl` + stream stdout JSON simulé de `agy` $\rightarrow$ détection $O(1)$ par `TranscriptWatcherService` $\rightarrow$ diffusion WebSocket au client mobile $\rightarrow$ incrémentation du badge non-lu sur l'onglet inactif.*

---

## 5. Examen Critique des 6 Tickets Proposés

| Ticket | Analyse des Risques & Lacunes | Critères d'Acceptation (DoD) à Ajouter |
| :--- | :--- | :--- |
| **TICKET-01**<br>Fix Harnais Vitest & CI | **Cause racine confirmée :** La ligne [1 de src/server.js](file:///C:/Users/hoppj/SynologyDrive/01_Projets/OmniAntigravityRemoteChat/src/server.js#L1) contient `#!/usr/bin/env node` (requis par le binaire `"omni-chat"` dans [package.json](file:///C:/Users/hoppj/SynologyDrive/01_Projets/OmniAntigravityRemoteChat/package.json#L26-L28)), ce qui fait planter Vite/Rollup lors d'un import direct dans Vitest.<br>⚠️ Dans [.github/workflows/ci.yml](file:///C:/Users/hoppj/SynologyDrive/01_Projets/OmniAntigravityRemoteChat/.github/workflows/ci.yml#L37-L45), la suite E2E n'est pas encore appelée. | - Plugin Vite `stripShebang` actif dans [vitest.config.js](file:///C:/Users/hoppj/SynologyDrive/01_Projets/OmniAntigravityRemoteChat/vitest.config.js).<br>- Ajout du script `"test:e2e"` dans [package.json](file:///C:/Users/hoppj/SynologyDrive/01_Projets/OmniAntigravityRemoteChat/package.json#L39-L51) et dans [.github/workflows/ci.yml](file:///C:/Users/hoppj/SynologyDrive/01_Projets/OmniAntigravityRemoteChat/.github/workflows/ci.yml).<br>- Mise à jour des URLs GitHub vers `Madderose` dans [package.json](file:///C:/Users/hoppj/SynologyDrive/01_Projets/OmniAntigravityRemoteChat/package.json#L18-L25). |
| **TICKET-02**<br>Suite E2E Haute Lisibilité | **Risque :** Couplage aux ports par défaut (`4747` / `7800`) provoquant des `EADDRINUSE` si un serveur tourne déjà en local. | - Serveur de test instancié sur port éphémère (`port: 0`).<br>- Nettoyage strict des fichiers créés dans `data/uploads/` après chaque test.<br>- Séparation entre `test/e2e/harness/` et `test/e2e/user-journeys.e2e.test.js`. |
| **TICKET-03**<br>`TranscriptWatcherService` | **Risque critique Windows :** `fs.watch` sur Windows déclenche des événements dupliqués, et la lecture complète d'un gros `transcript.jsonl` viole la complexité $O(1)$. De plus, un descripteur de fichier laissé ouvert bloque l'écriture par l'IDE (`EBUSY`). | - Lecture par **offset d'octets (`bytesRead`)** via `fs.open` / `read` (vrai $O(1)$ en tailing).<br>- Gestion de la troncature/rotation du fichier (`stat.size < lastOffset`).<br>- Tolérance aux lignes JSONL partielles (bufferisation jusqu'au `\n`) et aux lignes corrompues (`try/catch` par ligne sans crasher le watcher).<br>- Méthode `close()` / `dispose()` fermant proprement tous les watchers. |
| **TICKET-04**<br>`AgyBridgeService` | **Risques Sécurité & OS :**<br>1. Injection de commande si le prompt est passé via un shell.<br>2. Processus zombies sous Windows si le client mobile clique sur `#stopBtn` (`SIGKILL` ne tue pas l'arbre de sous-processus sur Windows sans `taskkill /T /F` ou gestion explicite). | - Utilisation exclusive de `child_process.spawn` avec `shell: false` (arguments en tableau).<br>- Parseur NDJSON (`--stream-json`) résilient aux chunks TCP/pipe fragmentés.<br>- Timeout d'exécution configurable + méthode `abort()` tuant proprement l'arbre de processus.<br>- Implémentation du contrat `ExecutionEngine`. |
| **TICKET-05**<br>UI & Progressive Disclosure | **Risque CSP :** Le projet applique une politique CSP stricte dans [public/index.html](file:///C:/Users/hoppj/SynologyDrive/01_Projets/OmniAntigravityRemoteChat/public/index.html#L6-L8) (`script-src 'self'`, zéro JS inline, `style.css`). | - Zéro attribut `onclick` ou `<script>` inline.<br>- Sélecteur d'effort intégré dans la modale de `#modelBtn` (aucune `.effort-pills` dans `.settings-bar`).<br>- Détection de capacité (`'SpeechRecognition' in window || 'webkitSpeechRecognition' in window`) avec fallback silencieux sur le mémo vocal natif.<br>- Test de non-débordement horizontal (`scrollWidth <= clientWidth`) sur viewport `375x667`. |
| **TICKET-06**<br>Extension VS Code | **Risque de pollution du repo racine :** Mélanger les dépendances TypeScript/VS Code de l'extension avec le `package.json` léger (`node:22-alpine`) du serveur principal. | - Isolation totale dans `vscode-extension/package.json`.<br>- Ajout de `vscode-extension/` dans `.dockerignore` et exclusion du bundle npm principal ([package.json](file:///C:/Users/hoppj/SynologyDrive/01_Projets/OmniAntigravityRemoteChat/package.json#L29-L38)).<br>- Authentification vers le serveur via header/token sécurisé (pas de contournement de l'auth existante). |

---

## 6. Recommandations Fermes & Décision d'Exécution (Sous-Agents)

### 🟢 Décision : **FEU VERT CONDITIONNEL (Go avec Garde-Fous d'Orchestration)**

La stratégie du plan [PLAN_RENAISSANCE_OMNIANTIGRAVITY_V2.md](file:///C:/Users/hoppj/SynologyDrive/01_Projets/OmniAntigravityRemoteChat/docs/PLAN_RENAISSANCE_OMNIANTIGRAVITY_V2.md) est validée. Toutefois, pour que les **2 sous-agents `gemini-3.8-flash-high`** exécutent ce plan sans reproduire les effets de bord d'hier, vous (en tant qu'Orchestrateur Principal) devez leur imposer les **4 règles d'engagement suivantes** :

1. **Verrouillage des Périmètres de Fichiers (File Ownership) pour éviter tout conflit Git :**
   - **Sous-Agent 1 (Backend & Services) :** Autorisé uniquement sur [vitest.config.js](file:///C:/Users/hoppj/SynologyDrive/01_Projets/OmniAntigravityRemoteChat/vitest.config.js), [.github/workflows/ci.yml](file:///C:/Users/hoppj/SynologyDrive/01_Projets/OmniAntigravityRemoteChat/.github/workflows/ci.yml), `src/services/*.js`, `test/unit/*.test.js` et `vscode-extension/**`. **Interdiction de modifier `public/**`.**
   - **Sous-Agent 2 (Quality E2E & UI Mobile) :** Autorisé uniquement sur `test/e2e/**`, [public/index.html](file:///C:/Users/hoppj/SynologyDrive/01_Projets/OmniAntigravityRemoteChat/public/index.html), `public/js/**` et `public/css/**`. **Interdiction de modifier `src/server.js`.**
2. **Séquencement par Barrière de Synchronisation (Phases Gates) :**
   - **Vague 1 :** Le **Sous-Agent 1** exécute **TICKET-01** en premier (durée très courte) afin que le harnais Vitest soit opérationnel, puis enchaîne immédiatement sur **TICKET-03** (`TranscriptWatcherService`) et **TICKET-04** (`AgyBridgeService`) avec leurs tests unitaires dédiés (`test/unit/transcript-watcher.test.js` et `test/unit/agy-bridge.test.js`).
   - En parallèle de T3/T4, le **Sous-Agent 2** développe **TICKET-02** (`test/e2e/user-journeys.e2e.test.js`) sur le socle `v1.6.0`.
   - **Vague 2 (après validation Vague 1) :** Le **Sous-Agent 2** réalise **TICKET-05** (UI Progressive Disclosure) pendant que le **Sous-Agent 1** réalise **TICKET-06** (`vscode-extension/`) et le câblage minimal (≤ 30 lignes) dans [src/server.js](file:///C:/Users/hoppj/SynologyDrive/01_Projets/OmniAntigravityRemoteChat/src/server.js).
3. **Contrat de Test Unitaire par Service :**
   - Les Tickets 3 et 4 ne peuvent pas être déclarés terminés sans leurs fichiers de tests unitaires respectifs dans `test/unit/` atteignant **> 90 % de couverture de branches** (incluant la gestion d'erreurs JSONL malformé, rotation de fichier, et arrêt forcé de processus `agy`).
4. **Validation finale par l'Orchestrateur :**
   - Exécution systématique de `npm run test:all` + `npm run test:e2e` + vérification `git diff --stat src/server.js` à chaque fin de vague.

Souhaitez-vous que je mette à jour [docs/PLAN_RENAISSANCE_OMNIANTIGRAVITY_V2.md](file:///C:/Users/hoppj/SynologyDrive/01_Projets/OmniAntigravityRemoteChat/docs/PLAN_RENAISSANCE_OMNIANTIGRAVITY_V2.md) avec ces critères d'acceptation renforcés et le contrat `ExecutionEngine`, ou que nous lancions directement la **Vague 1** selon ce protocole ?
