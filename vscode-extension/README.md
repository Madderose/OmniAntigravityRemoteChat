# 📱 OmniAntigravity Remote Chat (v1.4.0)

> **Your mobile AI cockpit for Antigravity IDE.**  
> Command your AI coding sessions from the couch, kitchen, or anywhere in the world over **Tailscale WireGuard** or **Local Wi-Fi** — with real-time CDP mirroring, Antigravity 2.0 reasoning control, 1-tap diff approvals, and voice dictation.

---

## 🛡️ Why Tailscale-First?

Most remote coding tools force you through slow, rate-limited, third-party public reverse tunnels (`*.trycloudflare.com`, `*.ngrok.io`) that expose your workstation to the public internet.

**OmniAntigravity Remote v1.4 is engineered Tailscale-First & Local-First:**

| Capability | 🔒 Tailscale Mesh (Priority 1) | 📶 Local Wi-Fi (Priority 2) | 🌐 Public Reverse Tunnels (Legacy) |
| :--- | :--- | :--- | :--- |
| **Network Path** | Peer-to-peer WireGuard VPN (`100.x.y.z`) | Direct Local Router Subnet (`192.168.x.x`) | Public Internet Relay Proxy |
| **Public Exposure** | **Zero open ports** (100% private tailnet) | **Zero internet exposure** (LAN only) | Publicly routable URL |
| **Encryption** | End-to-end Noise Protocol (WireGuard) + Let's Encrypt TLS | Local LAN HTTP / mkcert TLS | Terminated at third-party edge |
| **Cellular 4G / 5G** | **Yes — works worldwide** | No (same Wi-Fi router only) | Yes (higher latency) |
| **Latency** | **~5–20 ms (Direct P2P)** | **< 5 ms (Local LAN)** | 80–300 ms (Relay hop) |

---

## ⚡ 60-Second Quick Start

### 1. Enable Antigravity CDP Port (`7800`)
Click the **Omni Remote** icon in the Antigravity IDE Activity Bar to open the **Mobile Companion** sidebar:
- Click **`⚙️ Configure argv.json`** (one-time setup that adds `"remote-debugging-port": 7800` to `~/.antigravity-ide/argv.json`), or
- Click **`🚀 Launch with CDP`** to immediately open a CDP-enabled workbench window.

### 2. Start the Companion Server
Click **`▶ Start`** in the compact top power bar.
- The extension automatically detects your **Tailscale IP (`100.x.y.z`)**, **MagicDNS (`*.ts.net`)**, and **Local Wi-Fi IP (`192.168.x.x`)**.

### 3. Scan the QR Code & Code from Anywhere
Select **`🔒 Tailscale (Remote)`** or **`📶 Local Wi-Fi`**, point your smartphone camera at the high-contrast QR code, and your live Antigravity AI session opens instantly on your phone.

---

## ✨ Feature Highlights

### 🔄 Real-Time Mobile CDP Mirroring
- Connects directly to Antigravity IDE's Chrome DevTools Protocol (`127.0.0.1:7800`).
- Streams live DOM snapshots over WebSocket with `< 100ms` delta synchronization.
- Switch between multiple open Antigravity IDE windows directly from your phone.

### 🧠 Antigravity 2.0 Reasoning & Diff Approvals
- **Model & Reasoning Switcher:** Switch between **Gemini 4 Argon**, **Claude**, and **GPT** models and adjust reasoning effort (`low`, `medium`, `high`, `max`) on the fly.
- **Interactive Action Cards:** Review pending file diffs and terminal command executions on your phone with **SHA-256 payload integrity verification** before tapping **Approve** or **Reject**.

### 🎙️ Voice Dictation & Lock-Screen Alerts
- **Hands-Free Prompting:** Use built-in Web Speech API voice recognition to dictate complex architectural instructions from across the room.
- **Push Notifications:** Receive instant mobile alerts when a long-running agent task completes or pauses for human approval.

### 🖼️ Screen Timeline & Remote Workspace
- **7 Built-in Mobile Panels:** Chat, Files (syntax-highlighted browser), Terminal (live stream), Git (status, stage, commit, push), Assist (AI supervisor), Stats (quota & token analytics), and Screen Timeline (visual history).

---

## 🔒 Step-by-Step Tailscale Setup Guide

Want seamless cellular 4G/5G access from anywhere in the world with zero router configuration?

1. **Install Tailscale** on your workstation ([tailscale.com/download](https://tailscale.com/download)) and sign in.
2. **Install the Tailscale App** on your iOS or Android phone and sign in to the same account.
3. **Automatic Detection:** OmniAntigravity Remote automatically detects your `100.x.y.z` WireGuard IP and `*.ts.net` MagicDNS hostname via `tailscale status --json`.
4. **Optional 1-Click Let's Encrypt HTTPS (`tailscale serve`):**
   - Click **`🔒 Enable HTTPS (Serve)`** inside the Tailscale card in the sidebar.
   - OmniAntigravity runs `tailscale serve --bg 4747`, provisioning an automated Let's Encrypt TLS certificate on `https://<your-machine>.<your-tailnet>.ts.net` — unlocking browser features that require a secure context (such as Web Speech voice dictation and PWA installation).

---

## ⚙️ Configuration Reference

Open VS Code / Antigravity IDE Settings (`Ctrl+,` / `Cmd+,`) and search for **`OmniAntigravity`**:

| Setting | Type | Default | Description |
| :--- | :---: | :---: | :--- |
| `omniAntigravity.serverPort` | `number` | `4747` | HTTP port for the local OmniAntigravity companion server. |
| `omniAntigravity.password` | `string` | `""` | Custom authentication password for the mobile web interface (defaults to `antigravity`). |
| `omniAntigravity.telegramBotToken` | `string` | `""` | Telegram Bot Token from `@BotFather` for push notifications and `/approve` commands. |
| `omniAntigravity.telegramChatId` | `string` | `""` | Numeric Telegram Chat ID (from `@userinfobot` or `@RawDataBot`) to receive alerts. |
| `omniAntigravity.autoStart` | `boolean` | `false` | Automatically start the companion server when Antigravity IDE launches. |
| `omniAntigravity.cdpPort` | `number` | `7800` | Chrome DevTools Protocol (CDP) port for the Antigravity IDE workbench (`7800–7803` scanned). |
| `omniAntigravity.tunnelProvider` | `string` | `"none"` | Optional legacy public tunnel (`"none"`, `"cloudflare"`, `"pinggy"`, `"ngrok"`). Keep `"none"` for Tailscale/LAN. |

---

## 🤖 Step-by-Step Telegram Bot Setup

Want real-time push alerts on your lock-screen when an AI agent finishes a task or requires diff approval? Follow this 2-minute setup:

1. **Create the Bot with [@BotFather](https://t.me/BotFather):**
   - Open Telegram and search for `@BotFather`.
   - Send `/newbot`.
   - Give it a name (e.g. `Antigravity Companion`) and a unique username ending in `bot` (e.g. `my_antigravity_alert_bot`).
   - Copy the HTTP API token provided by BotFather (`123456789:ABCdef...`).
2. **Start the Bot:**
   - Tap the link to your new bot (e.g. `t.me/my_antigravity_alert_bot`) and press **`Start`** (or send `/start`).
   - *Note:* Telegram bots cannot message you first; pressing Start grants permission.
3. **Find your Telegram Chat ID:**
   - Search for **`@userinfobot`** on Telegram and press **Start**.
   - Copy the numeric **`Id`** it returns (e.g. `123456789`).
4. **Configure in Antigravity IDE:**
   - In the sidebar, expand **`Security & Notifications`**, paste your **Bot Token** and **Chat ID**, and click **`Save`**.
   - Click **`🔔 Send Test Alert`** to verify your phone receives notifications!
5. **Interactive Remote Commands:**
   - Send `/status` to check IDE status and active AI models.
   - Send `/approve` or `/reject` to approve file diffs from your pocket.
   - Send `/screenshot` to receive a photo of your desktop screen.

*(For detailed troubleshooting, see the [Full Telegram Bot Guide](TELEGRAM_BOT_GUIDE.md)).*


---

## ⌨️ Command Palette Reference

Press `Ctrl+Shift+P` (`Cmd+Shift+P` on macOS) and type **`OmniAntigravity`**:

| Command | Description |
| :--- | :--- |
| `OmniAntigravity: Open Remote Control Dashboard` | Opens the unified hero dashboard in a full editor tab |
| `OmniAntigravity: Start Server` | Starts the companion server on `omniAntigravity.serverPort` |
| `OmniAntigravity: Stop Server` | Gracefully stops the running companion server |
| `OmniAntigravity: Restart Server` | Restarts the companion server |
| `OmniAntigravity: Copy Tailscale Remote URL` | Copies the active Tailscale URL (`https://*.ts.net` or `http://100.x.y.z:4747`) |
| `OmniAntigravity: Copy Local Wi-Fi URL` | Copies the local LAN URL (`http://192.168.x.x:4747`) |
| `OmniAntigravity: Enable Tailscale HTTPS Serve` | Runs `tailscale serve --bg <port>` for automated Let's Encrypt TLS |
| `OmniAntigravity: Enable Remote Debugging Port (7800) in argv.json` | Configures `~/.antigravity-ide/argv.json` for persistent CDP access |
| `OmniAntigravity: Launch Antigravity Window with Debug Port` | Launches a new Antigravity IDE window with `--remote-debugging-port=7800` |

---

## 🛠️ Troubleshooting & FAQ

<details>
<summary><strong>1. Why does the sidebar say "Port 7800 Not Detected"?</strong></summary>

Antigravity IDE must be started with the Chrome DevTools Protocol port enabled so the companion server can mirror the chat DOM. Click **`⚙️ Configure argv.json`** in the sidebar and reload the window, or click **`🚀 Launch with CDP`** to spawn a ready-to-use window immediately.
</details>

<details>
<summary><strong>2. My phone cannot reach the Local Wi-Fi URL (<code>192.168.x.x:4747</code>).</strong></summary>

- Verify that your phone and PC are connected to the **same Wi-Fi router** (not a guest network with AP client isolation).
- Check that Windows Defender Firewall / macOS Firewall allows incoming connections for Node.js on TCP port `4747`.
- Or switch to the **`🔒 Tailscale (Remote)`** tab, which bypasses local Wi-Fi AP isolation entirely.
</details>

<details>
<summary><strong>3. How do I enable HTTPS for voice dictation on mobile?</strong></summary>

Mobile browsers require `https://` for microphone access. In the **`🔒 Tailscale (Remote)`** tab, click **`Enable HTTPS (Serve)`** to provision an automatic Let's Encrypt certificate via `tailscale serve`.
</details>

<details>
<summary><strong>4. When should I use Legacy Public Tunnels?</strong></summary>

Only use the collapsed **Legacy Public Tunnels** section if you are on a restricted corporate or guest device where Tailscale cannot be installed. For all standard workflows, Tailscale or Local Wi-Fi is faster, private, and requires zero third-party relays.
</details>

---

## 📄 License

GPL-3.0-only — Built for the Antigravity IDE community.
