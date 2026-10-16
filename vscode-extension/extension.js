// @ts-check
const vscode = require('vscode');
const { spawn, execSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const http = require('http');
const https = require('https');
const os = require('os');

/** @type {any} */
let QRCode;
try {
  QRCode = require('qrcode');
} catch (_) {
  try {
    QRCode = require(path.join(__dirname, 'node_modules', 'qrcode'));
  } catch (__) {
    try {
      QRCode = require(path.join(__dirname, '..', 'node_modules', 'qrcode'));
    } catch (___) {
      QRCode = null;
    }
  }
}

// ─── State ───────────────────────────────────────────────────────────

const state = {
  status: 'stopped', // 'stopped' | 'starting' | 'running' | 'error'
  port: 4747,
  cdpPort: 7800,
  telemetryMode: '',
  localIp: '',
  localUrl: '',
  tunnelUrl: '',
  tunnelProvider: 'none',
  tailscaleDetected: false,
  tailscaleIp: '',
  tailscaleDns: '',
  tailscaleUrl: '',
  tailscaleServeActive: false,
  activeQrSource: 'tailscale', // 'tailscale' | 'local' | 'tunnel'
  userSelectedSource: false,
  cdpListening: false,
  cdpTarget: '',
  qrSvg: '',
  /** @type {import('child_process').ChildProcess | null} */
  process: null,
  /** @type {vscode.OutputChannel | null} */
  outputChannel: null,
  /** @type {vscode.StatusBarItem | null} */
  statusBarItem: null,
  /** @type {vscode.WebviewPanel | null} */
  dashboardPanel: null,
  /** @type {vscode.WebviewView | null} */
  sidebarView: null,
  /** @type {NodeJS.Timeout | null} */
  pollTimer: null,
  /** @type {string | null} */
  customPassword: null,
  /** @type {string | null} */
  telegramBotToken: null,
  /** @type {string | null} */
  telegramChatId: null,
  /** @type {vscode.ExtensionContext | null} */
  extensionContext: null
};

// ─── Network & Portability Helpers ───────────────────────────────────

/**
 * Check if an IPv4 address belongs to the Tailscale CGNAT subnet (100.64.0.0/10).
 * @param {string} ip
 * @returns {boolean}
 */
function isTailscaleCgnat(ip) {
  if (!ip) return false;
  const m = String(ip).trim().match(/^100\.(\d{1,3})\.\d{1,3}\.\d{1,3}$/);
  if (!m) return false;
  const secondOctet = Number(m[1]);
  return secondOctet >= 64 && secondOctet <= 127;
}

/**
 * Get the primary local subnet IPv4 address (e.g., 192.168.x.x or 10.x.x.x).
 * Prioritizes physical Wi-Fi/Ethernet adapters over virtual switches (WSL, Docker, Tailscale).
 * @returns {string}
 */
function getLocalIpAddress() {
  const interfaces = os.networkInterfaces();
  /** @type {Array<{address: string, priority: number}>} */
  const candidates = [];

  for (const name of Object.keys(interfaces)) {
    const lowerName = name.toLowerCase();
    if (
      lowerName.includes('docker') ||
      lowerName.includes('vethernet') ||
      lowerName.includes('wsl') ||
      lowerName.includes('tailscale') ||
      lowerName.includes('tun') ||
      lowerName.includes('tap')
    ) {
      continue;
    }

    for (const iface of interfaces[name] || []) {
      if (iface.family !== 'IPv4' || iface.internal) continue;
      if (isTailscaleCgnat(iface.address)) continue;

      const priority = iface.address.startsWith('192.168.')
        ? 1
        : iface.address.startsWith('10.')
          ? 2
          : iface.address.startsWith('172.')
            ? 3
            : 4;

      candidates.push({ address: iface.address, priority });
    }
  }

  candidates.sort((a, b) => a.priority - b.priority);
  return candidates.length > 0 ? candidates[0].address : '127.0.0.1';
}

// ─── Environment & Persistence Helpers ───────────────────────────────

function getEnvFilePath() {
  const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || path.dirname(__dirname);
  return path.join(root, '.env');
}

/**
 * @returns {Record<string, string>}
 */
function readEnvFile() {
  try {
    const envPath = getEnvFilePath();
    if (fs.existsSync(envPath)) {
      const content = fs.readFileSync(envPath, 'utf8');
      /** @type {Record<string, string>} */
      const result = {};
      for (const line of content.split(/\r?\n/)) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const eqIdx = trimmed.indexOf('=');
        if (eqIdx > 0) {
          const k = trimmed.slice(0, eqIdx).trim();
          let v = trimmed.slice(eqIdx + 1).trim();
          if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
            v = v.slice(1, -1);
          }
          result[k] = v;
        }
      }
      return result;
    }
  } catch (_) {}
  return {};
}

/**
 * @param {string} key
 * @param {string} value
 */
function writeEnvKey(key, value) {
  try {
    const envPath = getEnvFilePath();
    let lines = [];
    if (fs.existsSync(envPath)) {
      lines = fs.readFileSync(envPath, 'utf8').split(/\r?\n/);
    }
    let found = false;
    const newLines = lines.map((line) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) return line;
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx > 0 && trimmed.slice(0, eqIdx).trim() === key) {
        found = true;
        return `${key}="${value}"`;
      }
      return line;
    });
    if (!found) {
      newLines.push(`${key}="${value}"`);
    }
    fs.writeFileSync(envPath, newLines.join('\n'), 'utf8');
  } catch (e) {
    console.warn(`[Extension] Failed to write to .env: ${e.message}`);
  }
}

/**
 * Locate the OmniAntigravity Remote Chat server entry point portably.
 * Checks embedded extension bundle, development root, and active workspace folders.
 * @param {vscode.ExtensionContext} context
 * @returns {string | null}
 */
function findServerScript(context) {
  const candidates = [
    // 1. Embedded inside packaged VSIX extension
    path.join(context.extensionPath, 'server', 'src', 'server.js'),
    // 2. Relative to extension development root
    path.join(context.extensionPath, '..', 'src', 'server.js')
  ];

  // 3. Active workspace folders
  if (vscode.workspace.workspaceFolders) {
    for (const folder of vscode.workspace.workspaceFolders) {
      candidates.push(path.join(folder.uri.fsPath, 'src', 'server.js'));
      candidates.push(path.join(folder.uri.fsPath, 'OmniAntigravityRemoteChat', 'src', 'server.js'));
    }
  }

  for (const p of candidates) {
    if (fs.existsSync(p)) {
      return path.resolve(p);
    }
  }
  return null;
}

/**
 * Resolve the user's home directory portably across Windows, macOS, and Linux.
 * @returns {string}
 */
function getHomeDir() {
  return os.homedir() || process.env.USERPROFILE || process.env.HOME || '';
}

/**
 * Resolve the Antigravity IDE CLI binary portably across platforms.
 * @returns {string}
 */
function resolveAntigravityCli() {
  const home = getHomeDir();
  const localAppData = process.env.LOCALAPPDATA || (home ? path.join(home, 'AppData', 'Local') : '');

  const candidates = [];
  if (process.platform === 'win32' && localAppData) {
    candidates.push(
      path.join(localAppData, 'Programs', 'Antigravity IDE', 'bin', 'antigravity-ide.cmd'),
      path.join(localAppData, 'Programs', 'Antigravity', 'bin', 'antigravity.cmd')
    );
  } else if (process.platform === 'darwin') {
    candidates.push(
      '/Applications/Antigravity IDE.app/Contents/Resources/app/bin/antigravity-ide',
      '/Applications/Antigravity.app/Contents/Resources/app/bin/antigravity',
      path.join(home, 'Applications', 'Antigravity IDE.app', 'Contents', 'Resources', 'app', 'bin', 'antigravity-ide')
    );
  } else {
    candidates.push(
      '/usr/bin/antigravity-ide',
      '/usr/local/bin/antigravity-ide',
      path.join(home, '.local', 'bin', 'antigravity-ide')
    );
  }

  for (const candidate of candidates) {
    if (candidate && fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return 'antigravity-ide';
}

/**
 * Generate a high-contrast SVG QR code from a target URL.
 * @param {string} url
 * @returns {Promise<string>}
 */
async function generateQrSvg(url) {
  if (!url) return '';
  if (QRCode && typeof QRCode.toString === 'function') {
    try {
      return await QRCode.toString(url, {
        type: 'svg',
        margin: 1,
        color: {
          dark: '#090d16',
          light: '#ffffff'
        }
      });
    } catch (e) {
      console.error('Failed to generate QR code with qrcode module:', e);
    }
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100%" height="100%">
    <rect width="100" height="100" fill="#ffffff" />
    <text x="50" y="50" font-size="9" text-anchor="middle" fill="#090d16">QR Ready</text>
  </svg>`;
}

/**
 * Dynamically detect Tailscale status, IPv4, MagicDNS (*.ts.net), and Serve HTTPS configuration.
 * Uses `tailscale ip -4`, `tailscale status --json`, `tailscale serve status --json`, and network interface fallback.
 */
function detectTailscale() {
  try {
    const config = vscode.workspace.getConfiguration('omniAntigravity');
    state.port = config.get('serverPort') || state.port || 4747;
    state.cdpPort = config.get('cdpPort') || state.cdpPort || 7800;

    state.localIp = getLocalIpAddress();
    state.localUrl = `http://${state.localIp}:${state.port}`;

    let foundIp = '';
    let foundDns = '';
    let isServing = false;

    // 1. Try `tailscale ip -4`
    try {
      const ipOut = execSync('tailscale ip -4', {
        encoding: 'utf8',
        timeout: 1200,
        stdio: ['ignore', 'pipe', 'ignore']
      }).trim();
      const firstLine = ipOut.split(/\r?\n/)[0]?.trim() || '';
      if (isTailscaleCgnat(firstLine)) {
        foundIp = firstLine;
      }
    } catch (_) {}

    // 2. Try `tailscale status --json` for MagicDNS & peer state
    try {
      const statusOut = execSync('tailscale status --json', {
        encoding: 'utf8',
        timeout: 1500,
        stdio: ['ignore', 'pipe', 'ignore']
      });
      const status = JSON.parse(statusOut);
      if (status && status.Self) {
        foundDns = (status.Self.DNSName || '').replace(/\.$/, '');
        if (!foundIp && Array.isArray(status.Self.TailscaleIPs)) {
          const v4 = status.Self.TailscaleIPs.find((ip) => isTailscaleCgnat(ip));
          if (v4) foundIp = v4;
        }
      }
    } catch (_) {}

    // 3. Fallback to OS network interfaces if CLI was not in PATH
    if (!foundIp) {
      const interfaces = os.networkInterfaces();
      for (const name of Object.keys(interfaces)) {
        for (const iface of interfaces[name] || []) {
          if (iface.family === 'IPv4' && !iface.internal && isTailscaleCgnat(iface.address)) {
            foundIp = iface.address;
            break;
          }
        }
        if (foundIp) break;
      }
    }

    // 4. Check `tailscale serve status --json` if Tailscale is active
    if (foundIp || foundDns) {
      try {
        const serveOut = execSync('tailscale serve status --json', {
          encoding: 'utf8',
          timeout: 1200,
          stdio: ['ignore', 'pipe', 'ignore']
        });
        const serve = JSON.parse(serveOut || '{}');
        isServing = Boolean(
          (serve.Web && Object.keys(serve.Web).length > 0) ||
          (serve.TCP && Object.keys(serve.TCP).length > 0)
        );
      } catch (_) {}
    }

    state.tailscaleIp = foundIp;
    state.tailscaleDns = foundDns;
    state.tailscaleServeActive = isServing;
    state.tailscaleDetected = Boolean(foundIp || foundDns);

    if (isServing && foundDns) {
      state.tailscaleUrl = `https://${foundDns}`;
    } else if (foundDns) {
      state.tailscaleUrl = `http://${foundDns}:${state.port}`;
    } else if (foundIp) {
      state.tailscaleUrl = `http://${foundIp}:${state.port}`;
    } else {
      state.tailscaleUrl = '';
    }

    // Default to Tailscale if detected and user hasn't manually overridden
    if (!state.userSelectedSource) {
      state.activeQrSource = state.tailscaleDetected ? 'tailscale' : 'local';
    }
  } catch (_) {}
}

/**
 * Return the currently active connection URL based on selected mode.
 * @returns {string}
 */
function getActiveConnectionUrl() {
  if (state.activeQrSource === 'tailscale') {
    if (state.tailscaleUrl) return state.tailscaleUrl;
    if (state.tailscaleIp) return `http://${state.tailscaleIp}:${state.port}`;
  }
  if (state.activeQrSource === 'tunnel' && state.tunnelUrl) {
    return state.tunnelUrl;
  }
  return state.localUrl || `http://${getLocalIpAddress()}:${state.port}`;
}

/**
 * Enable Tailscale HTTPS Serve on the server port.
 */
function enableTailscaleServe() {
  try {
    execSync(`tailscale serve --bg ${state.port}`, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe']
    });
    detectTailscale();
    state.activeQrSource = 'tailscale';
    updateQrCode().then(() => {
      broadcastState();
      vscode.window.showInformationMessage(
        `Tailscale HTTPS Serve enabled: ${state.tailscaleUrl || `Port ${state.port}`}`
      );
    });
  } catch (err) {
    vscode.window.showErrorMessage(`Failed to enable Tailscale Serve: ${err.message}`);
  }
}

/**
 * Reset Tailscale Serve configuration back to direct HTTP.
 */
function disableTailscaleServe() {
  try {
    execSync('tailscale serve reset', {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe']
    });
    detectTailscale();
    updateQrCode().then(() => {
      broadcastState();
      vscode.window.showInformationMessage('Tailscale Serve reset to direct WireGuard HTTP.');
    });
  } catch (err) {
    vscode.window.showErrorMessage(`Failed to reset Tailscale Serve: ${err.message}`);
  }
}

/**
 * Generate QR code SVG for the active connection mode.
 */
async function updateQrCode() {
  const targetUrl = getActiveConnectionUrl();
  if (targetUrl) {
    state.qrSvg = await generateQrSvg(targetUrl);
  } else {
    state.qrSvg = '';
  }
}

/**
 * Check if Antigravity's CDP port (default 7800) is open and listening.
 * @returns {Promise<{open: boolean, title: string, port: number}>}
 */
function checkCdpPort() {
  return new Promise((resolve) => {
    const config = vscode.workspace.getConfiguration('omniAntigravity');
    const port = config.get('cdpPort') || 7800;
    state.cdpPort = port;

    const req = http.get(`http://127.0.0.1:${port}/json/version`, { timeout: 1500 }, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          resolve({ open: true, title: json.Browser || 'Antigravity IDE', port });
        } catch (_) {
          resolve({ open: true, title: 'Antigravity IDE', port });
        }
      });
    });

    req.on('error', () => {
      resolve({ open: false, title: '', port });
    });
    req.on('timeout', () => {
      req.destroy();
      resolve({ open: false, title: '', port });
    });
  });
}

/**
 * Check Antigravity CDP status and query /app-state for Zero-CDP telemetry mode.
 * @returns {Promise<{cdpInfo: {open: boolean, title: string, port: number}, telemetryMode: string}>}
 */
async function pollCdpStatus() {
  const cdpInfo = await checkCdpPort();
  state.cdpListening = cdpInfo.open;
  state.cdpTarget = cdpInfo.title;

  const port = state.port || 4747;
  const baseProtocol = state.localUrl && state.localUrl.startsWith('https') ? 'https' : 'http';
  const client = baseProtocol === 'https' ? https : http;

  try {
    const data = await new Promise((resolve) => {
      const req = client.get(`${baseProtocol}://127.0.0.1:${port}/app-state`, {
        timeout: 1500,
        rejectUnauthorized: false
      }, (res) => {
        let raw = '';
        res.on('data', (chunk) => {
          raw += chunk;
        });
        res.on('end', () => {
          try {
            resolve(JSON.parse(raw));
          } catch (_) {
            resolve(null);
          }
        });
      });
      req.on('error', () => resolve(null));
      req.on('timeout', () => {
        req.destroy();
        resolve(null);
      });
    });

    if (data && (data.activeDataSource === 'transcript' || data.activeDataSource === 'agy')) {
      state.telemetryMode = data.activeDataSource;
    } else if (data && data.activeDataSource === 'cdp') {
      state.telemetryMode = 'cdp';
    } else if (!state.cdpListening) {
      state.telemetryMode = '';
    }
  } catch (_) {
    if (!state.cdpListening) {
      state.telemetryMode = '';
    }
  }

  return { cdpInfo, telemetryMode: state.telemetryMode };
}

// ─── Status Updates & Broadcasts ─────────────────────────────────────

function updateStatusBar() {
  if (!state.statusBarItem) return;

  if (state.status === 'running') {
    const modeTag = state.tailscaleDetected ? 'Tailscale' : 'LAN';
    state.statusBarItem.text = `$(device-mobile) Omni :${state.port} (${modeTag})`;
    state.statusBarItem.tooltip = `OmniAntigravity Remote: Running on port ${state.port}\nActive URL: ${getActiveConnectionUrl()}\nClick to open Dashboard & QR Code`;
    state.statusBarItem.backgroundColor = undefined;
  } else if (state.status === 'starting') {
    state.statusBarItem.text = `$(sync~spin) Omni: Starting...`;
    state.statusBarItem.tooltip = `OmniAntigravity Remote Server is starting...`;
    state.statusBarItem.backgroundColor = undefined;
  } else if (state.status === 'error') {
    state.statusBarItem.text = `$(error) Omni: Error`;
    state.statusBarItem.tooltip = `OmniAntigravity encountered an error. Click for details.`;
    state.statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground');
  } else {
    state.statusBarItem.text = `$(device-mobile) Omni: Off`;
    state.statusBarItem.tooltip = `OmniAntigravity Remote: Stopped. Click to open Companion.`;
    state.statusBarItem.backgroundColor = undefined;
  }
  state.statusBarItem.show();
}

function broadcastState() {
  updateStatusBar();

  const config = vscode.workspace.getConfiguration('omniAntigravity');
  const envVars = readEnvFile();
  const globalToken = state.extensionContext?.globalState?.get('omniAntigravity.telegramBotToken') || '';
  const globalChatId = state.extensionContext?.globalState?.get('omniAntigravity.telegramChatId') || '';
  const globalPassword = state.extensionContext?.globalState?.get('omniAntigravity.password') || '';

  const configuredPassword = state.customPassword !== null
    ? state.customPassword
    : (config.get('password') || globalPassword || envVars.APP_PASSWORD || '');
  const activePassword = configuredPassword || process.env.APP_PASSWORD || 'antigravity';
  const isCustomPassword = Boolean(configuredPassword || process.env.APP_PASSWORD);
  const telegramBotToken = state.telegramBotToken !== null
    ? state.telegramBotToken
    : (config.get('telegramBotToken') || globalToken || envVars.TELEGRAM_BOT_TOKEN || process.env.TELEGRAM_BOT_TOKEN || '');
  const telegramChatId = state.telegramChatId !== null
    ? state.telegramChatId
    : (config.get('telegramChatId') || globalChatId || envVars.TELEGRAM_CHAT_ID || process.env.TELEGRAM_CHAT_ID || '');
  const isTelegramConfigured = Boolean(telegramBotToken && telegramChatId);

  const payload = {
    status: state.status,
    port: state.port,
    cdpPort: state.cdpPort,
    telemetryMode: state.telemetryMode,
    localIp: state.localIp,
    localUrl: state.localUrl,
    tunnelUrl: state.tunnelUrl,
    tunnelProvider: state.tunnelProvider,
    tailscaleDetected: state.tailscaleDetected,
    tailscaleIp: state.tailscaleIp,
    tailscaleDns: state.tailscaleDns,
    tailscaleUrl: state.tailscaleUrl,
    tailscaleServeActive: state.tailscaleServeActive,
    activeQrSource: state.activeQrSource,
    activeUrl: getActiveConnectionUrl(),
    cdpListening: state.cdpListening,
    cdpTarget: state.cdpTarget,
    qrSvg: state.qrSvg,
    configuredPassword,
    activePassword,
    isCustomPassword,
    telegramBotToken,
    telegramChatId,
    isTelegramConfigured
  };

  if (state.dashboardPanel) {
    state.dashboardPanel.webview.postMessage({ type: 'state', payload });
  }
  if (state.sidebarView) {
    state.sidebarView.webview.postMessage({ type: 'state', payload });
  }
}

function broadcastLog(line) {
  if (state.outputChannel) {
    state.outputChannel.appendLine(line);
  }
  if (state.dashboardPanel) {
    state.dashboardPanel.webview.postMessage({ type: 'log', text: line });
  }
  if (state.sidebarView) {
    state.sidebarView.webview.postMessage({ type: 'log', text: line });
  }
}

// ─── Server Process Lifecycle ────────────────────────────────────────

/**
 * Start the OmniAntigravity Remote Chat server process.
 * @param {vscode.ExtensionContext} context
 */
async function startServerProcess(context) {
  if (state.status === 'running' || state.status === 'starting') {
    vscode.window.showInformationMessage('OmniAntigravity server is already running.');
    return;
  }

  const serverScript = findServerScript(context);
  if (!serverScript) {
    vscode.window.showErrorMessage('Could not locate OmniAntigravity server script (src/server.js).');
    return;
  }

  const config = vscode.workspace.getConfiguration('omniAntigravity');
  const port = config.get('serverPort') || 4747;
  const cdpPort = config.get('cdpPort') || 7800;
  const tunnelProvider = config.get('tunnelProvider') || 'none';
  const envVars = readEnvFile();
  const globalToken = state.extensionContext?.globalState?.get('omniAntigravity.telegramBotToken') || '';
  const globalChatId = state.extensionContext?.globalState?.get('omniAntigravity.telegramChatId') || '';
  const globalPassword = state.extensionContext?.globalState?.get('omniAntigravity.password') || '';

  const customPassword = state.customPassword !== null
    ? state.customPassword
    : (config.get('password') || globalPassword || envVars.APP_PASSWORD || '');
  const telegramBotToken = state.telegramBotToken !== null
    ? state.telegramBotToken
    : (config.get('telegramBotToken') || globalToken || envVars.TELEGRAM_BOT_TOKEN || process.env.TELEGRAM_BOT_TOKEN || '');
  const telegramChatId = state.telegramChatId !== null
    ? state.telegramChatId
    : (config.get('telegramChatId') || globalChatId || envVars.TELEGRAM_CHAT_ID || process.env.TELEGRAM_CHAT_ID || '');

  state.status = 'starting';
  state.port = port;
  state.cdpPort = cdpPort;
  state.tunnelProvider = tunnelProvider;
  state.tunnelUrl = '';
  detectTailscale();
  await updateQrCode();
  broadcastState();

  broadcastLog(`[Extension] Starting OmniAntigravity server...`);
  broadcastLog(`[Extension] Script: ${serverScript}`);
  broadcastLog(`[Extension] Server Port: ${port} | CDP Port: ${cdpPort}`);

  const activeWorkspace =
    vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || path.dirname(path.dirname(serverScript));

  const defaultAgyPath = process.platform === 'win32'
    ? path.join(os.homedir(), 'AppData', 'Local', 'agy', 'bin', 'agy.exe')
    : 'agy';
  const agyCliPath = process.env.AGY_CLI_PATH || defaultAgyPath;

  const env = {
    ...process.env,
    PORT: String(port),
    WORKSPACE_ROOT: activeWorkspace,
    CDP_PORTS: `${cdpPort},${cdpPort + 1},${cdpPort + 2},${cdpPort + 3}`,
    AUTO_TUNNEL_PROVIDER: tunnelProvider === 'none' ? '' : tunnelProvider,
    AGY_CLI_PATH: agyCliPath,
    ...(customPassword ? { APP_PASSWORD: String(customPassword) } : {}),
    ...(telegramBotToken ? { TELEGRAM_BOT_TOKEN: String(telegramBotToken) } : {}),
    ...(telegramChatId ? { TELEGRAM_CHAT_ID: String(telegramChatId) } : {})
  };

  try {
    const child = spawn(process.execPath || 'node', [serverScript], {
      cwd: path.dirname(path.dirname(serverScript)),
      env,
      stdio: ['pipe', 'pipe', 'pipe']
    });

    state.process = child;

    child.stdout.on('data', async (chunk) => {
      const text = chunk.toString();
      for (const line of text.split(/\r?\n/)) {
        if (!line.trim()) continue;
        broadcastLog(line);

        const localMatch = line.match(/(https?:\/\/[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+:\d+)/);
        if (localMatch && !state.localUrl) {
          state.localUrl = localMatch[1];
        }

        const tunnelMatch = line.match(
          /(https:\/\/[a-zA-Z0-9-]+\.(trycloudflare\.com|pinggy\.link|ngrok-free\.app|ngrok\.io|loca\.lt))/
        );
        if (tunnelMatch) {
          state.tunnelUrl = tunnelMatch[1];
          if (state.activeQrSource === 'tunnel') {
            await updateQrCode();
          }
          broadcastState();
        }
      }
    });

    child.stderr.on('data', (chunk) => {
      const text = chunk.toString();
      text.split(/\r?\n/).forEach((line) => {
        if (line.trim()) broadcastLog(`[Error] ${line}`);
      });
    });

    child.on('error', (err) => {
      broadcastLog(`[Extension Error] Failed to spawn server: ${err.message}`);
      state.status = 'error';
      state.process = null;
      state.telemetryMode = '';
      broadcastState();
    });

    child.on('close', (code) => {
      broadcastLog(`[Extension] Server process exited (code ${code})`);
      state.status = 'stopped';
      state.process = null;
      state.tunnelUrl = '';
      state.telemetryMode = '';
      broadcastState();
    });

    setTimeout(async () => {
      if (state.process) {
        state.status = 'running';
        detectTailscale();
        await updateQrCode();

        await pollCdpStatus();
        broadcastState();
      }
    }, 1500);
  } catch (err) {
    broadcastLog(`[Extension Error] ${err.message}`);
    state.status = 'error';
    broadcastState();
  }
}

const startServer = startServerProcess;

/**
 * Stop the OmniAntigravity server process.
 */
function stopServer() {
  state.telemetryMode = '';
  if (!state.process) {
    state.status = 'stopped';
    broadcastState();
    return;
  }

  broadcastLog(`[Extension] Stopping server process...`);
  try {
    state.process.kill('SIGTERM');
  } catch (_) {}

  setTimeout(() => {
    if (state.process) {
      try {
        state.process.kill('SIGKILL');
      } catch (_) {}
    }
    state.status = 'stopped';
    state.process = null;
    state.telemetryMode = '';
    broadcastState();
  }, 800);
}

/**
 * Restart the OmniAntigravity server.
 * @param {vscode.ExtensionContext} context
 */
async function restartServer(context) {
  stopServer();
  await new Promise((r) => setTimeout(r, 1100));
  await startServer(context);
}

/**
 * Switch legacy public tunnel provider at runtime.
 * @param {string} provider
 */
function changeTunnelProvider(provider) {
  state.tunnelProvider = provider;
  if (provider !== 'none') {
    state.activeQrSource = 'tunnel';
    state.userSelectedSource = true;
  } else if (state.activeQrSource === 'tunnel') {
    state.activeQrSource = state.tailscaleDetected ? 'tailscale' : 'local';
  }

  if (!state.process || state.status !== 'running') {
    updateQrCode().then(() => broadcastState());
    return;
  }

  const endpoint = provider === 'none' ? '/api/admin/tunnel/stop' : '/api/admin/tunnel/start';
  const postData = JSON.stringify({ provider });

  const req = http.request(
    {
      hostname: '127.0.0.1',
      port: state.port,
      path: endpoint,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      }
    },
    (res) => {
      let raw = '';
      res.on('data', (chunk) => {
        raw += chunk;
      });
      res.on('end', async () => {
        try {
          const json = JSON.parse(raw);
          if (json.url) {
            state.tunnelUrl = json.url;
          } else if (provider === 'none') {
            state.tunnelUrl = '';
          }
          await updateQrCode();
          broadcastState();
        } catch (_) {}
      });
    }
  );

  req.on('error', (err) => {
    broadcastLog(`[Tunnel Error] ${err.message}`);
  });

  req.write(postData);
  req.end();
}

/**
 * Configure ~/.antigravity-ide/argv.json (or ~/.antigravity/argv.json) with remote-debugging-port.
 */
async function enableCdpInArgv() {
  const home = getHomeDir();
  if (!home) {
    vscode.window.showErrorMessage('Unable to resolve user home directory.');
    return;
  }

  const config = vscode.workspace.getConfiguration('omniAntigravity');
  const cdpPort = config.get('cdpPort') || 7800;

  const candidates = [
    path.join(home, '.antigravity-ide', 'argv.json'),
    path.join(home, '.antigravity', 'argv.json')
  ];

  const argvPath = candidates.find((p) => fs.existsSync(p)) || candidates[0];

  if (!fs.existsSync(argvPath)) {
    vscode.window.showErrorMessage(`Antigravity configuration file not found at: ${argvPath}`);
    return;
  }

  try {
    const content = fs.readFileSync(argvPath, 'utf8');
    if (content.includes('"remote-debugging-port"')) {
      vscode.window.showInformationMessage(`remote-debugging-port is already configured in ${path.basename(argvPath)}.`);
      return;
    }

    const modified = content.replace(
      /\{/,
      `{\n\t// Chrome DevTools Protocol debugging port for OmniAntigravity Remote Chat\n\t"remote-debugging-port": ${cdpPort},`
    );
    fs.writeFileSync(argvPath, modified, 'utf8');

    const choice = await vscode.window.showInformationMessage(
      `Configured "remote-debugging-port": ${cdpPort} in argv.json. Restart Antigravity IDE to activate CDP.`,
      'Reload Window',
      'Later'
    );

    if (choice === 'Reload Window') {
      vscode.commands.executeCommand('workbench.action.reloadWindow');
    }
  } catch (err) {
    vscode.window.showErrorMessage(`Failed to update argv.json: ${err.message}`);
  }
}

/**
 * Launch an Antigravity IDE window with --remote-debugging-port=7800 portably.
 */
function launchDebugWindow() {
  try {
    const config = vscode.workspace.getConfiguration('omniAntigravity');
    const cdpPort = config.get('cdpPort') || 7800;
    const cmdPath = resolveAntigravityCli();

    const sub = spawn(cmdPath, [`--remote-debugging-port=${cdpPort}`, '--new-window'], {
      detached: true,
      stdio: 'ignore',
      shell: process.platform === 'win32'
    });
    sub.unref();
    vscode.window.showInformationMessage(
      `Launched new Antigravity IDE window with --remote-debugging-port=${cdpPort}.`
    );
  } catch (err) {
    vscode.window.showErrorMessage(`Failed to launch window with CDP: ${err.message}`);
  }
}

// ─── Webview HTML Template (Sleek Unified Hero Architecture) ─────────

function getWebviewHtml(webview, context) {
  const cssUri = webview.asWebviewUri(vscode.Uri.file(path.join(context.extensionPath, 'media', 'dashboard.css')));
  const jsUri = webview.asWebviewUri(vscode.Uri.file(path.join(context.extensionPath, 'media', 'dashboard.js')));

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>OmniAntigravity Remote</title>
  <link rel="stylesheet" href="${cssUri}">
</head>
<body>
  <div class="cockpit-shell">
    <!-- Unified Hero Card -->
    <section class="hero-card">
      <!-- 1. Compact Power Bar Header -->
      <header class="power-bar">
        <div class="power-status">
          <div id="statusPill" class="status-pill stopped" title="Server Lifecycle Status">
            <span class="status-dot"></span>
            <span id="statusText">Stopped</span>
          </div>
          <span id="portBadge" class="port-badge">:4747</span>
        </div>
        <div class="power-actions">
          <button id="btnStart" class="pill-btn pill-start" title="Start Companion Server">▶ Start</button>
          <button id="btnStop" class="pill-btn pill-stop" title="Stop Companion Server" disabled>⏹ Stop</button>
          <button id="btnRestart" class="pill-btn pill-restart" title="Restart Companion Server" disabled>↻</button>
        </div>
      </header>

      <!-- 2. Segmented Connection Mode Switcher -->
      <div class="segmented-tabs" role="tablist" aria-label="Connection Mode">
        <button id="btnSetQrTailscale" class="seg-tab active" role="tab" aria-selected="true">
          <span class="tab-icon">🔒</span>
          <span>Tailscale (Remote)</span>
          <span id="tailscaleBadge" class="tab-pill">Mesh</span>
        </button>
        <button id="btnSetQrLocal" class="seg-tab" role="tab" aria-selected="false">
          <span class="tab-icon">📶</span>
          <span>Local Wi-Fi</span>
        </button>
      </div>

      <!-- 3. Centered High-Contrast QR Code Stage -->
      <div class="qr-stage">
        <div id="qrBox" class="qr-box">
          <div class="qr-placeholder"><span>Generating QR...</span></div>
        </div>
        <div class="qr-caption">
          <span id="qrSourceLabel" class="qr-mode-tag">Tailscale WireGuard Mesh</span>
          <code id="activeUrlDisplay" class="qr-url-code">—</code>
        </div>
      </div>

      <!-- 4. Quick Action Toolbar Under QR -->
      <div class="quick-toolbar">
        <button id="btnCopyActiveUrl" class="action-btn action-primary" title="Copy active connection URL">
          <span>📋 Copy Link</span>
        </button>
        <button id="btnOpenBrowser" class="action-btn action-secondary" title="Open mobile companion in browser">
          <span>🌐 Open Web</span>
        </button>
      </div>

      <!-- 5. Contextual Connection Status Card -->
      <div id="contextTailscale" class="context-card context-tailscale">
        <div class="context-header">
          <span class="context-title">Tailscale Remote Access (4G/5G &amp; Wi-Fi)</span>
          <span id="tailscaleServeBadge" class="security-badge">WireGuard P2P</span>
        </div>

        <div class="kv-grid">
          <div class="kv-row">
            <span class="kv-key">MagicDNS</span>
            <div class="kv-val-wrap">
              <span id="tailscaleDnsText" class="kv-val">—</span>
              <button class="mini-copy" data-copy-target="tailscaleDnsText" title="Copy MagicDNS hostname">Copy</button>
            </div>
          </div>
          <div class="kv-row">
            <span class="kv-key">Direct IP</span>
            <div class="kv-val-wrap">
              <span id="tailscaleUrlText" class="kv-val">—</span>
              <button class="mini-copy" data-copy-target="tailscaleUrlText" title="Copy Tailscale URL">Copy</button>
            </div>
          </div>
        </div>

        <div class="serve-bar">
          <span id="tailscaleServeStatus" class="serve-hint">Zero open ports • End-to-end encrypted</span>
          <div class="serve-actions">
            <button id="btnTailscaleServe" class="micro-btn micro-accent" title="Enable Let's Encrypt HTTPS via tailscale serve">Enable HTTPS (Serve)</button>
            <button id="btnTailscaleReset" class="micro-btn micro-muted" title="Reset tailscale serve" style="display: none;">Reset</button>
          </div>
        </div>
      </div>

      <div id="contextLocal" class="context-card context-local" style="display: none;">
        <div class="context-header">
          <span class="context-title">Local Wi-Fi / Subnet LAN</span>
          <span class="security-badge badge-lan">Same Router</span>
        </div>

        <div class="kv-grid">
          <div class="kv-row">
            <span class="kv-key">LAN URL</span>
            <div class="kv-val-wrap">
              <span id="localUrlText" class="kv-val">—</span>
              <button class="mini-copy" data-copy-target="localUrlText" title="Copy Local Wi-Fi URL">Copy</button>
            </div>
          </div>
        </div>

        <div class="serve-bar">
          <span class="serve-hint">Direct HTTP over local subnet — zero configuration required.</span>
        </div>
      </div>

      <!-- 6. Antigravity CDP Workbench Status Bar -->
      <div class="cdp-card">
        <div class="cdp-status-row">
          <span class="cdp-label">CDP Workbench</span>
          <div id="cdpStatusText" class="cdp-indicator">
            <span class="cdp-dot pending"></span>
            <span>Checking port 7800...</span>
          </div>
        </div>
        <div class="cdp-actions">
          <button id="btnEnableCdp" class="micro-btn" title="Add remote-debugging-port: 7800 to ~/.antigravity-ide/argv.json">⚙️ Configure argv.json</button>
          <button id="btnLaunchDebug" class="micro-btn" title="Spawn a new Antigravity IDE window with --remote-debugging-port=7800">🚀 Launch with CDP</button>
        </div>
      </div>
    </section>

    <!-- 7. Security & Telegram Notifications -->
    <details id="securityAccordion" class="accordion-card">
      <summary class="accordion-summary">
        <div class="summary-left">
          <span class="chevron">▸</span>
          <span>Security &amp; Notifications</span>
        </div>
        <div class="summary-badges">
          <span id="passwordBadge" class="legacy-tag">Password: Default</span>
          <span id="telegramBadge" class="legacy-tag">Telegram: Off</span>
        </div>
      </summary>
      <div class="legacy-body">
        <!-- App Password -->
        <div class="form-row">
          <label class="form-label" for="inputPassword">Password</label>
          <div class="input-with-actions">
            <input type="password" id="inputPassword" class="form-input" placeholder="antigravity" autocomplete="off" />
            <button id="btnTogglePassword" class="mini-copy" type="button" title="Show/Hide Password">👁</button>
            <button id="btnSavePassword" class="mini-copy primary-mini" type="button" title="Save Password">Save</button>
          </div>
        </div>

        <div class="accordion-divider"></div>

        <!-- Telegram Notifications -->
        <div class="section-subhead">
          <span style="font-weight: 600; font-size: 0.73rem;">Telegram Push Alerts</span>
          <button id="btnOpenTelegramGuide" class="link-btn" type="button" title="Open step-by-step bot creation guide">📖 Bot Guide</button>
        </div>

        <div class="form-row">
          <label class="form-label" for="inputTelegramToken">Bot Token</label>
          <div class="input-with-actions">
            <input type="password" id="inputTelegramToken" class="form-input" placeholder="123456:ABC-DEF..." autocomplete="off" />
            <button id="btnToggleTelegramToken" class="mini-copy" type="button" title="Show/Hide Token">👁</button>
          </div>
        </div>

        <div class="form-row">
          <label class="form-label" for="inputTelegramChatId">Chat ID</label>
          <div class="input-with-actions">
            <input type="text" id="inputTelegramChatId" class="form-input" placeholder="e.g. 123456789" autocomplete="off" />
          </div>
        </div>

        <div class="form-actions-row">
          <button id="btnSaveTelegram" class="micro-btn micro-accent" type="button" title="Save Telegram Settings">💾 Save Telegram</button>
          <button id="btnTestTelegram" class="micro-btn" type="button" title="Send a test notification to your phone">🔔 Send Test Alert</button>
          <span id="telegramStatusHint" class="serve-hint">Lock-screen alerts &amp; /approve commands</span>
        </div>
      </div>
    </details>

    <!-- 8. Collapsible Live Server Log Console -->
    <details id="logsAccordion" class="accordion-card">
      <summary class="accordion-summary">
        <div class="summary-left">
          <span class="chevron">▸</span>
          <span>Show/Hide Logs</span>
          <span id="logCountBadge" class="count-badge">0</span>
        </div>
        <button id="btnClearLogs" class="micro-btn micro-muted" type="button" title="Clear log output">Clear</button>
      </summary>
      <div id="logContainer" class="log-box"></div>
    </details>

    <!-- 8. Optional Collapsed Legacy Public Tunnels -->
    <details id="legacyTunnelsAccordion" class="accordion-card">
      <summary class="accordion-summary">
        <div class="summary-left">
          <span class="chevron">▸</span>
          <span>Legacy Public Tunnels (Optional)</span>
        </div>
        <span class="legacy-tag">Cloudflare / Pinggy</span>
      </summary>
      <div class="legacy-body">
        <p class="legacy-note">For environments where Tailscale cannot be installed. Public tunnels route traffic through third-party relays.</p>
        <div class="form-row">
          <label class="form-label" for="tunnelSelect">Provider</label>
          <select id="tunnelSelect">
            <option value="none">Disabled (Tailscale / Local Only)</option>
            <option value="cloudflare">Cloudflare Quick Tunnel</option>
            <option value="pinggy">Pinggy SSH Tunnel</option>
            <option value="ngrok">ngrok</option>
          </select>
        </div>
        <div class="kv-row" style="margin-top: 6px;">
          <span class="kv-key">Public URL</span>
          <div class="kv-val-wrap">
            <span id="tunnelUrlText" class="kv-val">Disabled</span>
            <button id="btnSetQrTunnel" class="mini-copy" title="Show QR for Public Tunnel">QR</button>
            <button class="mini-copy" data-copy-target="tunnelUrlText" title="Copy Tunnel URL">Copy</button>
          </div>
        </div>
      </div>
    </details>
  </div>

  <script src="${jsUri}"></script>
</body>
</html>`;
}

// ─── Webview Message Handler ─────────────────────────────────────────

/**
 * Handle incoming messages from either the Dashboard WebviewPanel or Sidebar WebviewView.
 * @param {any} msg
 * @param {vscode.ExtensionContext} context
 */
async function handleWebviewMessage(msg, context) {
  switch (msg.command) {
    case 'ready':
      detectTailscale();
      await updateQrCode();
      pollCdpStatus().then(() => {
        broadcastState();
      });
      broadcastState();
      break;
    case 'start':
      await startServer(context);
      break;
    case 'stop':
      stopServer();
      break;
    case 'restart':
      await restartServer(context);
      break;
    case 'openWeb': {
      const targetUrl = getActiveConnectionUrl();
      if (targetUrl) {
        vscode.env.openExternal(vscode.Uri.parse(targetUrl));
      }
      break;
    }
    case 'copyActiveUrl': {
      const targetUrl = getActiveConnectionUrl();
      if (targetUrl) {
        await vscode.env.clipboard.writeText(targetUrl);
        vscode.window.showInformationMessage(`Copied link: ${targetUrl}`);
      }
      break;
    }
    case 'copy':
      if (msg.text) {
        await vscode.env.clipboard.writeText(msg.text);
        vscode.window.showInformationMessage(`Copied to clipboard: ${msg.text}`);
      }
      break;
    case 'setQrTarget':
      state.activeQrSource = msg.target;
      state.userSelectedSource = true;
      await updateQrCode();
      broadcastState();
      break;
    case 'enableTailscaleServe':
      enableTailscaleServe();
      break;
    case 'disableTailscaleServe':
      disableTailscaleServe();
      break;
    case 'changeTunnel':
      changeTunnelProvider(msg.provider);
      break;
    case 'enableCdpInArgv':
      await enableCdpInArgv();
      break;
    case 'launchDebugWindow':
      launchDebugWindow();
      break;
    case 'savePassword': {
      try {
        const newPwd = typeof msg.password === 'string' ? msg.password.trim() : '';
        state.customPassword = newPwd;
        const config = vscode.workspace.getConfiguration('omniAntigravity');
        await config.update('password', newPwd, vscode.ConfigurationTarget.Global);
        broadcastState();

        if (state.status === 'running') {
          vscode.window.showInformationMessage(
            newPwd
              ? 'OmniAntigravity password saved! Restart server to apply.'
              : 'OmniAntigravity password reset to default (antigravity). Restart server to apply.',
            'Restart Server Now'
          ).then(async (action) => {
            if (action === 'Restart Server Now') {
              await restartServer(context);
            }
          });
        } else {
          vscode.window.showInformationMessage(
            newPwd
              ? 'OmniAntigravity password saved!'
              : 'OmniAntigravity password reset to default (antigravity).'
          );
        }
      } catch (err) {
        vscode.window.showErrorMessage(`Failed to save password: ${err.message}`);
      }
      break;
    }
    case 'saveTelegram': {
      try {
        const token = typeof msg.token === 'string' ? msg.token.trim() : '';
        const chatId = typeof msg.chatId === 'string' ? msg.chatId.trim() : '';
        state.telegramBotToken = token;
        state.telegramChatId = chatId;

        if (state.extensionContext?.globalState) {
          await state.extensionContext.globalState.update('omniAntigravity.telegramBotToken', token);
          await state.extensionContext.globalState.update('omniAntigravity.telegramChatId', chatId);
        }

        const config = vscode.workspace.getConfiguration('omniAntigravity');
        try {
          await config.update('telegramBotToken', token, vscode.ConfigurationTarget.Global);
          await config.update('telegramChatId', chatId, vscode.ConfigurationTarget.Global);
        } catch (_) {
          try {
            await config.update('telegramBotToken', token, vscode.ConfigurationTarget.Workspace);
            await config.update('telegramChatId', chatId, vscode.ConfigurationTarget.Workspace);
          } catch (__) {}
        }

        if (token && chatId) {
          writeEnvKey('TELEGRAM_BOT_TOKEN', token);
          writeEnvKey('TELEGRAM_CHAT_ID', chatId);
        }

        broadcastState();

        if (state.status === 'running') {
          vscode.window.showInformationMessage(
            token && chatId
              ? 'Telegram settings saved & active! Restart server to activate live bot.'
              : 'Telegram settings updated! Restart server to apply.',
            'Restart Server Now'
          ).then(async (action) => {
            if (action === 'Restart Server Now') {
              await restartServer(context);
            }
          });
        } else {
          vscode.window.showInformationMessage(
            token && chatId
              ? 'Telegram Bot Token and Chat ID saved! (Status: Active)'
              : 'Telegram settings updated.'
          );
        }
      } catch (err) {
        vscode.window.showErrorMessage(`Failed to save Telegram settings: ${err.message}`);
      }
      break;
    }
    case 'sendTestTelegram': {
      const config = vscode.workspace.getConfiguration('omniAntigravity');
      const envVars = readEnvFile();
      const globalToken = state.extensionContext?.globalState?.get('omniAntigravity.telegramBotToken') || '';
      const globalChatId = state.extensionContext?.globalState?.get('omniAntigravity.telegramChatId') || '';

      const token = (typeof msg.token === 'string' && msg.token.trim()) ||
                    (state.telegramBotToken !== null ? state.telegramBotToken : config.get('telegramBotToken')) ||
                    globalToken || envVars.TELEGRAM_BOT_TOKEN || process.env.TELEGRAM_BOT_TOKEN;
      const chatId = (typeof msg.chatId === 'string' && msg.chatId.trim()) ||
                     (state.telegramChatId !== null ? state.telegramChatId : config.get('telegramChatId')) ||
                     globalChatId || envVars.TELEGRAM_CHAT_ID || process.env.TELEGRAM_CHAT_ID;
      if (!token || !chatId) {
        vscode.window.showWarningMessage('Please configure both Bot Token and Chat ID first.');
        break;
      }
      try {
        const httpsMod = require('https');
        const text = encodeURIComponent('🚀 *OmniAntigravity Test Alert*\n\nYour Telegram bot is successfully connected to Antigravity IDE!\nYou will receive push notifications when long-running agent tasks complete or require human approval.');
        const url = `https://api.telegram.org/bot${token}/sendMessage?chat_id=${chatId}&text=${text}&parse_mode=Markdown`;
        httpsMod.get(url, (res) => {
          let data = '';
          res.on('data', chunk => { data += chunk; });
          res.on('end', async () => {
            try {
              const json = JSON.parse(data);
              if (json.ok) {
                // Auto-save verified working credentials so status immediately turns Active!
                state.telegramBotToken = token;
                state.telegramChatId = chatId;
                if (state.extensionContext?.globalState) {
                  await state.extensionContext.globalState.update('omniAntigravity.telegramBotToken', token);
                  await state.extensionContext.globalState.update('omniAntigravity.telegramChatId', chatId);
                }
                try {
                  await config.update('telegramBotToken', token, vscode.ConfigurationTarget.Global);
                  await config.update('telegramChatId', chatId, vscode.ConfigurationTarget.Global);
                } catch (_) {}
                writeEnvKey('TELEGRAM_BOT_TOKEN', token);
                writeEnvKey('TELEGRAM_CHAT_ID', chatId);
                broadcastState();

                vscode.window.showInformationMessage('✅ Telegram test message sent & credentials saved as Active! Check your Telegram app.');
              } else {
                vscode.window.showErrorMessage(`Telegram error: ${json.description || 'Unknown error'}`);
              }
            } catch (e) {
              vscode.window.showErrorMessage(`Failed to parse Telegram response: ${e.message}`);
            }
          });
        }).on('error', (err) => {
          vscode.window.showErrorMessage(`Failed to send Telegram message: ${err.message}`);
        });
      } catch (err) {
        vscode.window.showErrorMessage(`Telegram test error: ${err.message}`);
      }
      break;
    }
    case 'openTelegramGuide': {
      const guidePath = path.join(context.extensionPath, 'TELEGRAM_BOT_GUIDE.md');
      const docPath = path.join(context.extensionPath, '..', 'docs', 'TELEGRAM_BOT_GUIDE.md');
      const target = fs.existsSync(guidePath) ? guidePath : (fs.existsSync(docPath) ? docPath : null);
      if (target) {
        const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(target));
        await vscode.window.showTextDocument(doc, { preview: true });
      } else {
        vscode.env.openExternal(vscode.Uri.parse('https://core.telegram.org/bots#how-do-i-create-a-bot'));
      }
      break;
    }
  }
}

// ─── Webview Providers ───────────────────────────────────────────────

/**
 * Open or reveal the full editor-tab Dashboard webview.
 * @param {vscode.ExtensionContext} context
 */
function showDashboard(context) {
  if (state.dashboardPanel) {
    state.dashboardPanel.reveal(vscode.ViewColumn.One);
    broadcastState();
    return;
  }

  const panel = vscode.window.createWebviewPanel(
    'omniAntigravityDashboard',
    'OmniAntigravity Remote',
    vscode.ViewColumn.One,
    {
      enableScripts: true,
      retainContextWhenHidden: true,
      localResourceRoots: [vscode.Uri.file(path.join(context.extensionPath, 'media'))]
    }
  );

  state.dashboardPanel = panel;
  panel.iconPath = vscode.Uri.file(path.join(context.extensionPath, 'media', 'icon.svg'));
  panel.webview.html = getWebviewHtml(panel.webview, context);

  panel.webview.onDidReceiveMessage((msg) => handleWebviewMessage(msg, context));

  panel.onDidDispose(() => {
    state.dashboardPanel = null;
  });
}

class OmniSidebarProvider {
  /**
   * @param {vscode.ExtensionContext} context
   */
  constructor(context) {
    this.context = context;
  }

  /**
   * @param {vscode.WebviewView} webviewView
   */
  resolveWebviewView(webviewView) {
    state.sidebarView = webviewView;
    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.file(path.join(this.context.extensionPath, 'media'))]
    };

    webviewView.webview.html = getWebviewHtml(webviewView.webview, this.context);
    webviewView.webview.onDidReceiveMessage((msg) => handleWebviewMessage(msg, this.context));

    webviewView.onDidDispose(() => {
      state.sidebarView = null;
    });
  }
}

// ─── Activation ──────────────────────────────────────────────────────

/**
 * @param {vscode.ExtensionContext} context
 */
function activate(context) {
  state.extensionContext = context;
  state.outputChannel = vscode.window.createOutputChannel('OmniAntigravity Remote');
  context.subscriptions.push(state.outputChannel);

  state.statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  state.statusBarItem.command = 'omniAntigravity.showDashboard';
  context.subscriptions.push(state.statusBarItem);

  detectTailscale();
  updateQrCode().then(() => updateStatusBar());

  const sidebarProvider = new OmniSidebarProvider(context);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider('omniAntigravity.sidebarView', sidebarProvider)
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('omniAntigravity.showDashboard', () => showDashboard(context)),
    vscode.commands.registerCommand('omniAntigravity.startServer', () => startServer(context)),
    vscode.commands.registerCommand('omniAntigravity.stopServer', () => stopServer()),
    vscode.commands.registerCommand('omniAntigravity.restartServer', () => restartServer(context)),
    vscode.commands.registerCommand('omniAntigravity.openWeb', () => {
      const url = getActiveConnectionUrl();
      if (url) {
        vscode.env.openExternal(vscode.Uri.parse(url));
      } else {
        vscode.window.showInformationMessage('OmniAntigravity server is not running.');
      }
    }),
    vscode.commands.registerCommand('omniAntigravity.copyLocalUrl', async () => {
      detectTailscale();
      if (state.localUrl) {
        await vscode.env.clipboard.writeText(state.localUrl);
        vscode.window.showInformationMessage(`Copied local Wi-Fi URL: ${state.localUrl}`);
      }
    }),
    vscode.commands.registerCommand('omniAntigravity.copyTailscaleUrl', async () => {
      detectTailscale();
      if (state.tailscaleUrl) {
        await vscode.env.clipboard.writeText(state.tailscaleUrl);
        vscode.window.showInformationMessage(`Copied Tailscale URL: ${state.tailscaleUrl}`);
      } else {
        vscode.window.showWarningMessage('Tailscale IP / URL not detected on this machine.');
      }
    }),
    vscode.commands.registerCommand('omniAntigravity.copyTunnelUrl', async () => {
      if (state.tunnelUrl) {
        await vscode.env.clipboard.writeText(state.tunnelUrl);
        vscode.window.showInformationMessage(`Copied public tunnel URL: ${state.tunnelUrl}`);
      } else {
        vscode.window.showInformationMessage('No active public tunnel URL.');
      }
    }),
    vscode.commands.registerCommand('omniAntigravity.enableTailscaleServe', enableTailscaleServe),
    vscode.commands.registerCommand('omniAntigravity.disableTailscaleServe', disableTailscaleServe),
    vscode.commands.registerCommand('omniAntigravity.enableCdpInArgv', enableCdpInArgv),
    vscode.commands.registerCommand('omniAntigravity.launchDebugWindow', launchDebugWindow)
  );

  // Periodic CDP & network check every 5s
  state.pollTimer = setInterval(async () => {
    const prevTailscale = state.tailscaleUrl;
    const prevLocal = state.localUrl;
    const prevTelemetryMode = state.telemetryMode;
    detectTailscale();
    if (prevTailscale !== state.tailscaleUrl || prevLocal !== state.localUrl) {
      await updateQrCode();
    }
    const { cdpInfo, telemetryMode } = await pollCdpStatus();
    if (
      state.cdpListening !== cdpInfo.open ||
      state.cdpTarget !== cdpInfo.title ||
      prevTelemetryMode !== telemetryMode ||
      prevTailscale !== state.tailscaleUrl ||
      prevLocal !== state.localUrl
    ) {
      broadcastState();
    }
  }, 5000);

  const config = vscode.workspace.getConfiguration('omniAntigravity');
  if (config.get('autoStart')) {
    startServer(context);
  }
}

/**
 * Extension deactivation.
 */
function deactivate() {
  if (state.pollTimer) {
    clearInterval(state.pollTimer);
    state.pollTimer = null;
  }
  stopServer();
}

module.exports = {
  activate,
  deactivate
};
