# 🤖 Step-by-Step Telegram Bot Setup Guide for OmniAntigravity Remote Chat

> **Get lock-screen notifications and approve AI actions directly from Telegram!**  
> With the Telegram integration, your phone will alert you the moment Antigravity IDE finishes a task, requests diff approval, or runs a command. You can even reply `/approve`, `/reject`, or `/status` directly in Telegram.

---

## 📋 What You Need
- A free **Telegram** account (on iOS, Android, Desktop, or Web).
- 2 minutes of setup.

---

## 🛠️ Step 1: Create Your Bot with @BotFather

1. Open Telegram and search for **`@BotFather`** (ensure it has the official blue verification checkmark).
2. Press **Start** (or send `/start`).
3. Send the command:
   ```text
   /newbot
   ```
4. **Choose a display name** for your bot:
   *Example:* `Antigravity Companion`
5. **Choose a unique username** ending in `bot`:
   *Example:* `my_antigravity_remote_bot`
6. **Copy your API Token**:
   BotFather will reply with a congratulatory message containing your HTTP API Token:
   ```text
   Use this token to access the HTTP API:
   7123456789:AAFlkBx...your_token_here...
   ```
   Keep this token confidential.

---

## 🚀 Step 2: Start a Conversation with Your Bot

> [!IMPORTANT]
> **Telegram bots cannot initiate contact with you first.**  
> You must send at least one message or press **Start** in your new bot's chat before it can send you alerts.

1. Click the link provided by BotFather (e.g. `t.me/my_antigravity_remote_bot`).
2. Click **Start** (or type `/start`).

---

## 🆔 Step 3: Find Your Telegram Chat ID

Your `Chat ID` is your unique numeric Telegram user identifier. Here are two easy ways to find it:

### Method A: Via @userinfobot (Fastest)
1. In Telegram, search for **`@userinfobot`**.
2. Press **Start**.
3. It will instantly reply with your profile info:
   ```text
   @userinfobot:
   Id: 123456789   <-- This is your Chat ID!
   First: Jonas
   ```
4. Copy the numeric **`Id`**.

### Method B: Via the Official Telegram API in your browser
1. In your web browser, navigate to:
   ```text
   https://api.telegram.org/bot<YOUR_BOT_TOKEN>/getUpdates
   ```
   *(Replace `<YOUR_BOT_TOKEN>` with the token from Step 1)*
2. Look for the `"chat":{"id": 123456789}` field in the JSON response.
3. Copy the numeric `id`.

---

## ⚙️ Step 4: Configure OmniAntigravity Remote Chat

You can configure your bot using any of the following 3 methods:

### Option 1: Right Inside the Extension Sidebar (Easiest)
1. Open Antigravity IDE and click the **Omni Remote** icon in the Activity Bar.
2. Expand the **Security &amp; Telegram Notifications** accordion.
3. Paste your **Bot Token** and **Chat ID**.
4. Click **`Save Telegram`**.
5. Click **`Send Test Alert`** — your phone will immediately vibrate with a confirmation notification!

### Option 2: Via Antigravity IDE Settings GUI
1. Press <kbd>Ctrl</kbd> + <kbd>,</kbd> (or <kbd>Cmd</kbd> + <kbd>,</kbd>).
2. Search for **`omniAntigravity.telegram`**.
3. Fill in:
   - **`omniAntigravity.telegramBotToken`**: your HTTP API Token.
   - **`omniAntigravity.telegramChatId`**: your numeric Chat ID.

### Option 3: In `.env` File (For CLI / Headless Server)
Add these two lines to your `C:\Users\hoppj\SynologyDrive\01_Projets\OmniAntigravityRemoteChat\.env` file:
```env
TELEGRAM_BOT_TOKEN=7123456789:AAFlkBx...
TELEGRAM_CHAT_ID=123456789
```

---

## 🎮 Interactive Commands You Can Send From Telegram

Once connected, you can chat with your bot anytime:

| Command | Action |
| :--- | :--- |
| **`/status`** | Checks if Antigravity IDE is connected, active window title, and model info |
| **`/approve`** | 1-tap approval of pending code diff or terminal execution |
| **`/reject`** | Rejects the pending action |
| **`/screenshot`**| Captures workstation desktop and sends a photo directly in chat |
| **`/help`** | Shows available bot commands |

---

## 🔒 Security Best Practices
- **Never commit `.env` with your real bot token to Git.** (The repository's `.gitignore` already protects `.env`).
- Only your configured `TELEGRAM_CHAT_ID` has access to execute `/approve` or `/reject` commands; unauthorized users messaging your bot will be ignored.
- As per workspace governance, store your Bot Token in **Bitwarden** under `Services - Telegram - OmniAntigravity Bot`.
