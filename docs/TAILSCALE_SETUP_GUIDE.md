# Configuration Tailscale — OmniAntigravity Remote Chat

> **Accès distant sécurisé de bout en bout (Zero Trust / WireGuard) pour votre smartphone.**

---

## 🌟 Pourquoi Tailscale est la solution idéale pour OmniAntigravity

Par rapport aux tunnels publics classiques (*Cloudflare Tunnel*, *Pinggy*, *ngrok*), Tailscale offre des avantages majeurs :

| Critère | Tailscale WireGuard 🔒 | Cloudflare / Pinggy 🌐 | Wi-Fi Local 📶 |
|---|---|---|---|
| **Exposition Internet** | **Zéro** (accessible uniquement par vos appareils) | Publique (URL indexable / scannable) | Aucune (LAN uniquement) |
| **Chiffrement** | **WireGuard de bout en bout** | Terminé sur les serveurs du proxy | WPA2 / WPA3 local |
| **Stabilité de l'URL** | **Fixe et permanente** (`younas.tailbac3fa.ts.net`) | Éphémère (change à chaque redémarrage) | IP locale (DHCP) |
| **Certificat SSL / HTTPS** | **Let's Encrypt officiel automatique** via `serve` | Géré par Cloudflare | Auto-signé (alerte navigateur) |
| **PWA & Voice Dictation** | **100% compatibles** (reconnu comme HTTPS de confiance) | Compatible | Bloqué sur mobile si HTTP |
| **Latence (4G / 5G)** | **Minimale** (connexion directe P2P UDP) | Relais tiers | N/A hors du domicile |

---

## 🗺️ Votre Topologie Détectée

Votre machine hôte et vos appareils sont déjà configurés sur votre tailnet :

- **Machine Hôte (Antigravity IDE) :** `younas`
  - **IPv4 Tailscale :** `100.101.243.1`
  - **MagicDNS :** `younas.tailbac3fa.ts.net`
- **Smartphone Client :** `fairphone-jonas` (`100.89.190.30`)

Lorsque l'application Tailscale est active sur votre Fairphone, vous pouvez joindre `younas` depuis n'importe quel réseau (4G/5G, Wi-Fi public, bureau) comme si vous étiez en direct sur le même réseau local.

---

## 🚀 Activation en 1 Clic depuis Antigravity IDE

L'extension **`OmniAntigravity Remote Chat`** intègre Tailscale en natif :

1. Ouvrez le **Dashboard Omni Remote** (`Ctrl+Shift+P` ➔ `OmniAntigravity: Open Remote Control Dashboard` ou icône dans la barre latérale).
2. Cliquez sur **`▶ Start`**.
3. Dans la section QR Code, cliquez sur le bouton **`🔒 Tailscale`** :
   - Le QR code s'ajuste instantanément sur votre adresse Tailscale.
   - Flashez avec votre Fairphone : la connexion s'établit via WireGuard.
4. *(Recommandé)* Dans le bloc **Tailscale Remote Access**, cliquez sur **`🔒 Enable HTTPS (Serve)`** :
   - Tailscale active son reverse-proxy local sécurisé sur le port 4747.
   - Votre URL devient **`https://younas.tailbac3fa.ts.net`**.
   - Vous bénéficiez d'un certificat HTTPS officiel sans avertissement de sécurité sur votre téléphone, ce qui débloque la **synthèse/dictée vocale Web Speech** et les **notifications push PWA**.

---

## 💻 Commandes Manuelles (PowerShell)

Si vous préférez gérer Tailscale directement en ligne de commande :

### 1. Activer le mode HTTPS Serve automatique
```powershell
tailscale serve --bg 4747
```
*Votre serveur est alors accessible de manière chiffrée sur `https://younas.tailbac3fa.ts.net` depuis tous vos appareils Tailscale.*

### 2. Vérifier le statut de l'exposition
```powershell
tailscale serve status
```

### 3. Désactiver / Réinitialiser Serve
```powershell
tailscale serve reset
```

---

## 🔒 Sécurité & Filtrage IP

Le serveur OmniAntigravity intègre la validation native de la plage CGNAT RFC 6598 (`100.64.0.0/10`) et des domaines `*.ts.net` dans son module réseau [`src/utils/network.js`](file:///c:/Users/hoppj/SynologyDrive/01_Projets/OmniAntigravityRemoteChat/src/utils/network.js) :

- Les requêtes issues de vos nœuds Tailscale sont reconnues comme des requêtes de confiance pair-à-pair.
- Les attaques de type DNS rebinding et les connexions depuis des proxys publics non autorisés restent strictement bloquées.
