# Revue Critique d'Architecture & Contre-Expertise ("Argon 4 High")
## Durcissement Cross-Platform (Windows, macOS Darwin, Linux, Alpine Docker)

> **Rapporteur** : Principal Software Engineer & Senior Software Architect ("Argon 4 High" via `agy --model gemini-4-argon-high`)  
> **Date** : 2026-10-16  
> **Projet** : OmniAntigravity Remote Chat (`feat/native-voice-memo-attachment` / v1.7.0)

---

## 1. Contexte & Démarche de l'Audit

Suite à la proposition initiale d'un plan d'alignement cross-platform, une contre-expertise exhaustive du code source réel d'OmniAntigravity Remote Chat a été conduite avec le modèle **Gemini 4 Argon (High)** via le CLI `agy`.

L'objectif de cet audit n'était pas seulement de vérifier la viabilité théorique des changements, mais de traquer **l'ensemble des effets de bord cachés, des comportements non documentés d'OS et des risques d'exécution** dans les sous-systèmes critiques :
- Processus enfants & sockets réseau (`src/utils/process.js`)
- Gestion des chemins de fichiers & sécurité de confinement (`src/utils/workspace.js`, `public/js/components/file-browser.js`)
- Extraction de métadonnées de quota et communication inter-processus (`src/quota-service.js`)
- Tunnels distants (`scripts/pinggy-tunnel.js`, `scripts/cloudflare-tunnel.js`)
- Extension VS Code & outillage de build (`vscode-extension/`, `scripts/build-extension.js`)
- Déterminisme des suites de tests CI (`test/test.js`, `.github/workflows/ci.yml`)

---

## 2. Analyse Approfondie des 9 Failles & Angles Morts Identifiés

### 🔴 1. Risque Critique dans `killPortProcess` : Meurtre Involontaire des Processus Clients
* **Localisation** : `src/utils/process.js:36-44`
* **Mécanisme du bogue** :
  La commande POSIX `lsof -ti:${port}` recherche tous les descripteurs de fichiers associés au port réseau, **y compris les sockets TCP côté client**.
  Si le serveur écoute sur le port `4747` et que l'utilisateur a ouvert le navigateur Chrome ou Antigravity IDE, `lsof -ti:4747` liste à la fois le PID du serveur et le PID de Chrome / Antigravity IDE. L'exécution de `kill -9` tue alors l'IDE ou le navigateur de l'utilisateur !
* **Correction prescrite** :
  Restreindre la requête aux seuls sockets en écoute serveur :
  `lsof -nP -tiTCP:${safePort} -sTCP:LISTEN` et exclure impérativement `process.pid`.

---

### 🔴 2. Risque Critique dans `PinggyTunnelManager.cleanupOrphans` : Éradication des Sessions SSH sous Windows
* **Localisation** : `scripts/pinggy-tunnel.js:69-71`
* **Mécanisme du bogue** :
  Sous Windows, `spawn('taskkill', ['/F', '/IM', 'ssh.exe'])` tue brutalement **tous les processus `ssh.exe` en cours sur la machine**, détruisant les sessions VS Code Remote-SSH du développeur, les tunnels de production ou les transferts `git push/pull` en arrière-plan.
  De plus, la condition `if (import.meta.url === \`file://${process.argv[1]}\`)` échoue systématiquement sous Windows car `process.argv[1]` contient des antislashs.
* **Correction prescrite** :
  Cibler exclusivement les PIDs des processus `ssh.exe` dont la ligne de commande contient `pinggy` (via requête CIM PowerShell ciblée), et normaliser `import.meta.url` avec `pathToFileURL(process.argv[1]).href`.

---

### 🔴 3. Risque Critique dans `QuotaService.getListeningPortsForPid` : Crash non intercepté de `lsof` & Faux succès `ss`
* **Localisation** : `src/quota-service.js:181-204`
* **Mécanisme du bogue** :
  1. Si `ss -ltnp` réussit avec un code `0` mais renvoie une sortie vide `ports = []` (par exemple en environnement conteneurisé sans privilège `CAP_NET_ADMIN`), le bloc `catch` contenant le fallback `lsof` n'est **jamais déclenché**.
  2. Dans le bloc `catch`, l'appel `await execFileAsync('lsof', ...)` n'est pas protégé par son propre `try/catch`. Or, `lsof` retourne un code d'erreur `1` dès lors qu'aucun socket n'est trouvé pour ce PID, ce qui provoque le rejet de la promesse et fait planter toute la boucle `discoverCandidates()`.
* **Correction prescrite** :
  Déclencher le fallback `lsof` si `ports.length === 0` et encapsuler l'appel `lsof` dans son propre `try/catch`.

---

### 🟠 4. Risque Majeur dans `readFlagValue` : Parsing Incomplet des Arguments CLI
* **Localisation** : `src/quota-service.js:81-86`
* **Mécanisme du bogue** :
  L'expression régulière d'extraction `(?:^|\s)${flag}\s+([^\s]+)` n'accepte qu'un espace entre le drapeau et la valeur. Les arguments du type `--csrf_token=valeur` (avec `=`) ou les chemins contenant des espaces entre guillemets (`--app_data_dir="C:\Users\..."`) renvoient systématiquement une chaîne vide.
* **Correction prescrite** :
  Expression régulière robuste :
  `new RegExp('(?:^|\\s)' + escapedFlag + '(?:=|\\s+)(?:"([^"]+)"|\'([^\']+)\'|([^\\s"\']+))')`.

---

### 🟠 5. Risque Majeur dans `listProcessesWindows` : Corruption d'Encodage OEM Console
* **Localisation** : `src/quota-service.js:124-146`
* **Mécanisme du bogue** :
  PowerShell 5.1 sous Windows utilise l'encodage de la console OEM (CP850 ou CP437). Si un chemin d'accès au profil utilisateur ou au projet contient des caractères accentués (`C:\Users\Jérôme\...`), la sortie JSON est corrompue et `JSON.parse(stdout)` échoue silencieusement, rendant les quotas inaccessibles.
* **Correction prescrite** :
  Injecter explicitement `[Console]::OutputEncoding = [System.Text.Encoding]::UTF8;` et invoquer PowerShell avec `-NoProfile -NonInteractive -ExecutionPolicy Bypass`.

---

### 🟠 6. Risque Majeur dans `deriveWorkspaceNameFromPath` & `getGitSummary` : Antislashs Windows
* **Localisation** : `src/utils/workspace.js:748-763` & `280-306`
* **Mécanisme du bogue** :
  `deriveWorkspaceNameFromPath(filePath)` reçoit des chemins Windows contenant des `\`, mais cherche des correspondances avec `.includes('/OmniAntigravityRemoteChat/')` et découpe avec `.split('/')`, échouant systématiquement sur Windows. De même, `parseGitStatusLine` ne gère pas les retours chariot CRLF Windows (`\r\n`).
* **Correction prescrite** :
  Normalisation systématique en entrée via `toPosix()` et découpage `split(/\r?\n/)`.

---

### 🟠 7. Risque Majeur d'Incompatibilité Module Système (CommonJS vs ESM)
* **Localisation** : `vscode-extension/extension.js` vs `src/utils/process.js`
* **Mécanisme du bogue** :
  L'extension VS Code est compilée/exécutée dans un runtime CommonJS (`require('vscode')`), alors que `src/utils/process.js` est un module ESM (`import { PORTS } from '../config.js'`). Tenter d'importer directement `process.js` dans `extension.js` casserait le chargement de l'extension dans l'IDE.
* **Correction prescrite** :
  Conserver `vscode-extension/extension.js` autonome (en nettoyant le code mort `resolveAntigravityCli()`), et mutualiser `resolveAntigravityBinary()` en ESM entre `src/utils/process.js` et `scripts/build-extension.js`.

---

### 🟡 8. Risque de Faux Positif dans `killPortProcess` sous Windows
* **Localisation** : `src/utils/process.js:21`
* **Mécanisme du bogue** :
  `netstat -ano | findstr :4747` matche par sous-chaîne et capture aussi des ports comme `:47470` ou `:47471`.
* **Correction prescrite** :
  `execFileSync('netstat', ['-ano', '-p', 'tcp'])` sans shell, avec filtrage JavaScript strict par expression régulière `:${safePort}$` sur l'adresse locale.

---

### 🟡 9. Flakiness des Tests d'Intégration CI (`test/test.js`)
* **Localisation** : `test/test.js:259`
* **Mécanisme du bogue** :
  L'attente d'un délai fixe `setTimeout(3000)` avant de sonder le serveur provoque des faux échecs sur les runners CI `windows-latest` ou `macos-latest` lors d'un démarrage à froid.
* **Correction prescrite** :
  Boucle de readiness HTTP active (jusqu'à 10 s) avec `process.execPath`.

---

## 3. Conclusion & Ordre de Marche

Le plan d'implémentation v2 intègre l'ensemble de ces 9 garde-fous.  
Toutes les modifications sont prêtes à être déployées et validées par la suite de tests automatisés.
