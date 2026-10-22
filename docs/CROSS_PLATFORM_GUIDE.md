# Guide d'Architecture & Compatibilité Cross-Platform

> **OmniAntigravity Remote Chat**  
> Ce document formalise les règles d'architecture, les conventions de chemins, la découverte des processus et les bonnes pratiques pour garantir un fonctionnement identique sur **Windows**, **Linux**, **macOS (Darwin)** et en conteneur **Alpine Docker**.

---

## 1. Principes Directeurs Cross-Platform

1. **Aucun `require()` dans le serveur** : Le projet utilise exclusivement l'ESM standard Node.js (`"type": "module"`). L'extension VS Code conserve son isolation CommonJS sans mélange direct.
2. **Normalisation POSIX des Chemins dans les APIs** : Tous les chemins relatifs échangés en JSON via HTTP ou WebSocket utilisent des slashs `/` (`toPosix()`), quel que soit l'OS hôte. Les modules internes de manipulation de fichiers utilisent `path.resolve` et `path.join` pour la compatibilité avec le système de fichiers sous-jacent.
3. **Isolation et Respect du Workspace Root** : Tout accès au système de fichiers vérifie à la fois le chemin logique (`resolve`) et le chemin réel après déréférencement des liens symboliques (`fs.realpathSync`) pour éviter les traversées malveillantes. La casse des lettres de lecteur sous Windows (`C:` vs `c:`) est normalisée pour éviter les faux positifs d'évasion.
4. **Gestion Propre des Processus Enfants** :
   - Sous Windows : terminaison d'arbre via `taskkill /PID <pid> /T /F`.
   - Sous POSIX (Linux, macOS) : exécution détachée (`detached: true`) et terminaison de groupe de processus via `process.kill(-pid, 'SIGTERM')` avec repli sur `proc.kill('SIGTERM')`.

---

## 2. Spécificités par Système d'Exploitation

### 2.1 🪟 Windows (`win32`)

* **Shell par défaut** : `%ComSpec%` (en général `cmd.exe`) avec arguments `['/d', '/s', '/c', command]`.
* **Sécurité Spawn & Lancement Antigravity (CVE-2024-27980)** :
  * Pour lancer une instance Antigravity GUI, le résolveur canonique `resolveAntigravityBinary({ preferCliWrapper: false })` privilégie l'exécutable PE natif (`Antigravity IDE.exe` ou `Antigravity.exe`).
  * Si un script batch (`.cmd` ou `.bat`) doit être exécuté, l'usage de `shell: true` avec des arguments arbitraires est proscrit (vulnérabilité BatBadBut). On invoque explicitement `%ComSpec%` avec `['/d', '/s', '/c', '""chemin" "arg""']` et `windowsVerbatimArguments: true, windowsHide: true`.
* **Recherche de ports et processus** :
  * Ports ouverts : `netstat -ano -p tcp` sans shell, filtré en JavaScript sur l'adresse locale `:${safePort}` et l'état `LISTENING` en excluant `process.pid`.
  * Processus Quota/Language Server : PowerShell avec `[Console]::OutputEncoding = [System.Text.Encoding]::UTF8;` et `-NoProfile -NonInteractive -ExecutionPolicy Bypass`.
* **Données utilisateur & Machine ID** :
  * `%APPDATA%\Antigravity\User\machineid` ou `~/.antigravity/data/machineid`.

### 2.2 🐧 Linux (`linux`) & Conteneur Alpine

* **Shell par défaut** : `$SHELL` (ou `/bin/bash` par défaut) avec arguments `['-lc', command]`.
* **Binaires CLI Antigravity** :
  * Emplacements standards : `/usr/bin/antigravity-ide`, `/usr/local/bin/antigravity-ide`, `~/.local/bin/antigravity-ide`, `/snap/bin/antigravity-ide`.
* **Recherche de ports et processus** :
  * Processus : `ps -eo pid=,args=` avec filtrage regex `language_server`.
  * Libération de port : `lsof -nP -tiTCP:${safePort} -sTCP:LISTEN` (stricte pour ne pas tuer les sockets clients), avec repli sur `ss -ltnp "sport = :${safePort}"` et `fuser -k -n tcp ${safePort}`.
  * *Image Docker Alpine* : Le `Dockerfile` installe explicitement `lsof` et `iproute2` (`RUN apk add --no-cache lsof iproute2`).
* **Données utilisateur & Machine ID** :
  * `$XDG_CONFIG_HOME/Antigravity/User/machineid` ou `~/.config/Antigravity/User/machineid` ou `~/.antigravity/data/machineid`.

### 2.3 🍏 macOS (`darwin`)

* **Shell par défaut** : `$SHELL` (typiquement `/bin/zsh` ou `/bin/bash`) avec arguments `['-lc', command]`.
* **Binaires CLI Antigravity** :
  * Applications dans des bundles : `/Applications/Antigravity IDE.app/Contents/Resources/app/bin/antigravity-ide` ou `/Applications/Antigravity.app/Contents/Resources/app/bin/antigravity`.
  * Emplacements utilisateurs : `~/Applications/...`, `/opt/homebrew/bin/antigravity`, ou `/usr/local/bin/antigravity`.
* **Recherche de ports et processus** :
  * Processus : BSD `ps -eo pid=,command= -ww` (l'option `-ww` est impérative pour empêcher la troncature des arguments de ligne de commande par la largeur de terminal).
  * Ports écouteurs : `lsof -Pan -p <pid> -iTCP -sTCP:LISTEN`.
  * Nettoyage de port : `lsof -nP -tiTCP:<port> -sTCP:LISTEN` puis `kill -9 <pid>`.
* **Données utilisateur & Machine ID** :
  * `~/Library/Application Support/Antigravity/User/machineid`
  * `~/Library/Application Support/Antigravity IDE/User/machineid`
  * `~/Library/Application Support/Google/Antigravity/User/machineid`

---

## 3. Matrice des Outils Réseau et Tunnels

| Outil | Windows | Linux | macOS | Repli / Mécanisme |
|---|---|---|---|---|
| **Certificats SSL (`setup-ssl.js`)** | Chocolatey / Scoop | Apt / Pacman / Dnf | Homebrew | Repli sur script Node.js crypto sans dépendance externe |
| **Cloudflare Tunnel (`cloudflared`)** | `taskkill /IM cloudflared.exe` | `pkill -f 'cloudflared.*tunnel'` | `pkill -f 'cloudflared.*tunnel'` | Tunnels temporaires TryCloudflare |
| **Pinggy SSH Tunnel (`ssh`)** | PowerShell ciblant `ssh.exe` avec filtre `pinggy` | `pkill -f 'ssh.*a.pinggy.io'` | `pkill -f 'ssh.*a.pinggy.io'` | Option `UserKnownHostsFile=/dev/null` compatible |

---

## 4. Intégration Continue (CI) Multi-Plateformes

Le workflow `.github/workflows/ci.yml` garantit le non-régression grâce à une matrice d'exécution sur les 3 systèmes d'exploitation :
* `ubuntu-latest` (Linux) avec Node 22 et Node 24
* `windows-latest` (Windows) avec Node 22
* `macos-latest` (macOS Apple Silicon) avec Node 22

---

## 5. Guide de Dépannage Cross-Platform

### Problème : Le File Browser ne remonte pas dans l'arborescence (bouton "Up")
* **Cause** : Le chemin relatif contient des antislashs sous Windows (`src\utils`), alors que le code client découpe avec `/`.
* **Solution** : Toujours normaliser en sortie d'API (`toPosix`) et utiliser une regex `split(/[\\/]+/)` côté frontend.

### Problème : Erreur `ENOENT` lors de l'ouverture d'une nouvelle fenêtre Antigravity
* **Cause** : Antigravity est installé sous forme de bundle `.app` (macOS) ou de script `.cmd` (Windows) hors du `PATH` direct de Node.
* **Solution** : Utiliser la fonction de résolution `resolveAntigravityBinary()` qui teste les chemins d'installation standards par OS.

### Problème : Impossible de lire les quotas de modèles sur macOS
* **Cause** : Le fichier `machineid` stockant le token CSRF est logé dans `~/Library/Application Support/...`.
* **Solution** : Inclure les chemins `~/Library/...` dans la liste de recherche `getCsrfTokenCandidatePaths()`.
