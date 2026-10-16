(function () {
  // @ts-ignore
  const vscode = acquireVsCodeApi();

  // Power Bar Elements
  const statusPill = document.getElementById('statusPill');
  const statusText = document.getElementById('statusText');
  const portBadge = document.getElementById('portBadge');
  const btnStart = document.getElementById('btnStart');
  const btnStop = document.getElementById('btnStop');
  const btnRestart = document.getElementById('btnRestart');

  // Mode Switcher & QR Stage
  const btnSetQrTailscale = document.getElementById('btnSetQrTailscale');
  const btnSetQrLocal = document.getElementById('btnSetQrLocal');
  const btnSetQrTunnel = document.getElementById('btnSetQrTunnel');
  const tailscaleBadge = document.getElementById('tailscaleBadge');
  const qrBox = document.getElementById('qrBox');
  const qrSourceLabel = document.getElementById('qrSourceLabel');
  const activeUrlDisplay = document.getElementById('activeUrlDisplay');

  // Quick Toolbar
  const btnCopyActiveUrl = document.getElementById('btnCopyActiveUrl');
  const btnOpenBrowser = document.getElementById('btnOpenBrowser');

  // Contextual Status Cards
  const contextTailscale = document.getElementById('contextTailscale');
  const contextLocal = document.getElementById('contextLocal');
  const tailscaleDnsText = document.getElementById('tailscaleDnsText');
  const tailscaleUrlText = document.getElementById('tailscaleUrlText');
  const tailscaleServeBadge = document.getElementById('tailscaleServeBadge');
  const tailscaleServeStatus = document.getElementById('tailscaleServeStatus');
  const btnTailscaleServe = document.getElementById('btnTailscaleServe');
  const btnTailscaleReset = document.getElementById('btnTailscaleReset');
  const localUrlText = document.getElementById('localUrlText');

  // CDP Workbench Bar
  const cdpStatusText = document.getElementById('cdpStatusText');
  const btnEnableCdp = document.getElementById('btnEnableCdp');
  const btnLaunchDebug = document.getElementById('btnLaunchDebug');

  // Collapsible Logs & Legacy Tunnels
  const logContainer = document.getElementById('logContainer');
  const logCountBadge = document.getElementById('logCountBadge');
  const btnClearLogs = document.getElementById('btnClearLogs');
  const tunnelSelect = document.getElementById('tunnelSelect');
  const tunnelUrlText = document.getElementById('tunnelUrlText');

  // Security & Password Elements
  const inputPassword = document.getElementById('inputPassword');
  const btnTogglePassword = document.getElementById('btnTogglePassword');
  const btnSavePassword = document.getElementById('btnSavePassword');
  const passwordBadge = document.getElementById('passwordBadge');

  // Telegram Bot Elements
  const inputTelegramToken = document.getElementById('inputTelegramToken');
  const btnToggleTelegramToken = document.getElementById('btnToggleTelegramToken');
  const inputTelegramChatId = document.getElementById('inputTelegramChatId');
  const btnSaveTelegram = document.getElementById('btnSaveTelegram');
  const btnTestTelegram = document.getElementById('btnTestTelegram');
  const btnOpenTelegramGuide = document.getElementById('btnOpenTelegramGuide');
  const telegramBadge = document.getElementById('telegramBadge');
  const telegramStatusHint = document.getElementById('telegramStatusHint');

  let logCount = 0;

  // Copy helper by element ID
  window.copyText = function (elementId) {
    const el = document.getElementById(elementId);
    if (!el) return;
    const text = (el.innerText || el.textContent || '').trim();
    if (!text || text === '—' || text === 'Disabled' || text.includes('not detected')) return;

    vscode.postMessage({
      command: 'copy',
      text
    });
  };

  // Bind all [data-copy-target] mini copy buttons
  document.querySelectorAll('[data-copy-target]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const targetId = btn.getAttribute('data-copy-target');
      if (targetId) window.copyText(targetId);
    });
  });

  // Power Bar actions
  if (btnStart) {
    btnStart.addEventListener('click', () => vscode.postMessage({ command: 'start' }));
  }
  if (btnStop) {
    btnStop.addEventListener('click', () => vscode.postMessage({ command: 'stop' }));
  }
  if (btnRestart) {
    btnRestart.addEventListener('click', () => vscode.postMessage({ command: 'restart' }));
  }

  // Quick Toolbar actions
  if (btnCopyActiveUrl) {
    btnCopyActiveUrl.addEventListener('click', () => vscode.postMessage({ command: 'copyActiveUrl' }));
  }
  if (btnOpenBrowser) {
    btnOpenBrowser.addEventListener('click', () => vscode.postMessage({ command: 'openWeb' }));
  }

  // Segmented Connection Mode Switcher
  if (btnSetQrTailscale) {
    btnSetQrTailscale.addEventListener('click', () => {
      vscode.postMessage({ command: 'setQrTarget', target: 'tailscale' });
    });
  }
  if (btnSetQrLocal) {
    btnSetQrLocal.addEventListener('click', () => {
      vscode.postMessage({ command: 'setQrTarget', target: 'local' });
    });
  }
  if (btnSetQrTunnel) {
    btnSetQrTunnel.addEventListener('click', () => {
      vscode.postMessage({ command: 'setQrTarget', target: 'tunnel' });
    });
  }

  // Tailscale Serve HTTPS toggle actions
  if (btnTailscaleServe) {
    btnTailscaleServe.addEventListener('click', () => {
      vscode.postMessage({ command: 'enableTailscaleServe' });
    });
  }
  if (btnTailscaleReset) {
    btnTailscaleReset.addEventListener('click', () => {
      vscode.postMessage({ command: 'disableTailscaleServe' });
    });
  }

  // CDP Workbench actions
  if (btnEnableCdp) {
    btnEnableCdp.addEventListener('click', () => {
      vscode.postMessage({ command: 'enableCdpInArgv' });
    });
  }
  if (btnLaunchDebug) {
    btnLaunchDebug.addEventListener('click', () => {
      vscode.postMessage({ command: 'launchDebugWindow' });
    });
  }

  // Legacy Tunnel select
  if (tunnelSelect) {
    tunnelSelect.addEventListener('change', (e) => {
      vscode.postMessage({
        command: 'changeTunnel',
        // @ts-ignore
        provider: e.target.value
      });
    });
  }

  // Clear Logs
  if (btnClearLogs) {
    btnClearLogs.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (logContainer) logContainer.innerHTML = '';
      logCount = 0;
      if (logCountBadge) logCountBadge.textContent = '0';
    });
  }

  // Security & Password Actions
  if (btnTogglePassword && inputPassword) {
    btnTogglePassword.addEventListener('click', () => {
      // @ts-ignore
      const isPwd = inputPassword.type === 'password';
      // @ts-ignore
      inputPassword.type = isPwd ? 'text' : 'password';
      btnTogglePassword.textContent = isPwd ? '🔒' : '👁';
    });
  }

  function triggerSavePassword() {
    if (!inputPassword) return;
    // @ts-ignore
    const val = inputPassword.value;
    delete inputPassword.dataset.userDirty;

    if (btnSavePassword) {
      const origText = btnSavePassword.textContent;
      btnSavePassword.textContent = '✓ Saved!';
      btnSavePassword.classList.add('micro-saved');
      setTimeout(() => {
        btnSavePassword.textContent = origText;
        btnSavePassword.classList.remove('micro-saved');
      }, 2000);
    }

    vscode.postMessage({
      command: 'savePassword',
      password: val
    });
  }

  if (btnSavePassword) {
    btnSavePassword.addEventListener('click', triggerSavePassword);
  }

  if (inputPassword) {
    inputPassword.addEventListener('input', () => {
      inputPassword.dataset.userDirty = 'true';
    });
    inputPassword.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        triggerSavePassword();
      }
    });
  }

  // Telegram Bot Actions
  if (btnToggleTelegramToken && inputTelegramToken) {
    btnToggleTelegramToken.addEventListener('click', () => {
      // @ts-ignore
      const isPwd = inputTelegramToken.type === 'password';
      // @ts-ignore
      inputTelegramToken.type = isPwd ? 'text' : 'password';
      btnToggleTelegramToken.textContent = isPwd ? '🔒' : '👁';
    });
  }

  function triggerSaveTelegram() {
    const token = inputTelegramToken ? (/** @type {HTMLInputElement} */ (inputTelegramToken)).value.trim() : '';
    const chatId = inputTelegramChatId ? (/** @type {HTMLInputElement} */ (inputTelegramChatId)).value.trim() : '';

    if (inputTelegramToken) delete inputTelegramToken.dataset.userDirty;
    if (inputTelegramChatId) delete inputTelegramChatId.dataset.userDirty;

    if (btnSaveTelegram) {
      const origText = btnSaveTelegram.textContent;
      btnSaveTelegram.textContent = '✓ Saved!';
      btnSaveTelegram.classList.add('micro-saved');
      setTimeout(() => {
        btnSaveTelegram.textContent = origText;
        btnSaveTelegram.classList.remove('micro-saved');
      }, 2500);
    }

    if (token && chatId) {
      if (telegramBadge) {
        telegramBadge.textContent = 'Telegram: Active';
        telegramBadge.style.color = 'var(--status-green)';
        telegramBadge.classList.add('active-tag');
      }
      if (telegramStatusHint) {
        telegramStatusHint.innerHTML = '<span style="color: var(--status-green); font-weight: 600;">● Bot active &amp; ready for alerts</span>';
      }
    }

    vscode.postMessage({
      command: 'saveTelegram',
      token,
      chatId
    });
  }

  if (btnSaveTelegram) {
    btnSaveTelegram.addEventListener('click', triggerSaveTelegram);
  }

  if (inputTelegramToken) {
    inputTelegramToken.addEventListener('input', () => {
      inputTelegramToken.dataset.userDirty = 'true';
    });
    inputTelegramToken.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        triggerSaveTelegram();
      }
    });
  }

  if (inputTelegramChatId) {
    inputTelegramChatId.addEventListener('input', () => {
      inputTelegramChatId.dataset.userDirty = 'true';
    });
    inputTelegramChatId.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        triggerSaveTelegram();
      }
    });
  }

  if (btnTestTelegram) {
    btnTestTelegram.addEventListener('click', () => {
      const token = inputTelegramToken ? (/** @type {HTMLInputElement} */ (inputTelegramToken)).value.trim() : '';
      const chatId = inputTelegramChatId ? (/** @type {HTMLInputElement} */ (inputTelegramChatId)).value.trim() : '';
      vscode.postMessage({
        command: 'sendTestTelegram',
        token,
        chatId
      });
    });
  }

  if (btnOpenTelegramGuide) {
    btnOpenTelegramGuide.addEventListener('click', () => {
      vscode.postMessage({ command: 'openTelegramGuide' });
    });
  }

  // Handle incoming state and log messages from extension host
  window.addEventListener('message', (event) => {
    const message = event.data;
    switch (message.type) {
      case 'state':
        handleStateUpdate(message.payload);
        break;
      case 'log':
        appendLog(message.text);
        break;
    }
  });

  function handleStateUpdate(state) {
    const data = state || {};
    const {
      status,
      port,
      cdpPort,
      telemetryMode,
      localUrl,
      tunnelUrl,
      tunnelProvider,
      tailscaleDetected,
      tailscaleIp,
      tailscaleDns,
      tailscaleUrl,
      tailscaleServeActive,
      activeQrSource,
      activeUrl,
      cdpListening,
      cdpTarget,
      qrSvg,
      configuredPassword,
      activePassword,
      isCustomPassword,
      telegramBotToken,
      telegramChatId,
      isTelegramConfigured
    } = data;

  const updateState = handleStateUpdate;

    // 1. Power Bar & Port Badge
    if (portBadge) {
      portBadge.textContent = `:${port || 4747}`;
    }

    if (statusPill && statusText) {
      statusPill.className = 'status-pill ' + (status || 'stopped');
      if (status === 'running') {
        statusText.textContent = 'Running';
        if (btnStart) btnStart.disabled = true;
        if (btnStop) btnStop.disabled = false;
        if (btnRestart) btnRestart.disabled = false;
      } else if (status === 'starting') {
        statusText.textContent = 'Starting...';
        if (btnStart) btnStart.disabled = true;
        if (btnStop) btnStop.disabled = true;
        if (btnRestart) btnRestart.disabled = true;
      } else if (status === 'error') {
        statusText.textContent = 'Error';
        if (btnStart) btnStart.disabled = false;
        if (btnStop) btnStop.disabled = true;
        if (btnRestart) btnRestart.disabled = false;
      } else {
        statusText.textContent = 'Stopped';
        if (btnStart) btnStart.disabled = false;
        if (btnStop) btnStop.disabled = true;
        if (btnRestart) btnRestart.disabled = true;
      }
    }

    // 2. Segmented Tabs & Contextual Card Visibility
    const isTailscaleMode = activeQrSource === 'tailscale';
    const isLocalMode = activeQrSource === 'local';

    if (btnSetQrTailscale && btnSetQrLocal) {
      btnSetQrTailscale.classList.toggle('active', isTailscaleMode);
      btnSetQrTailscale.setAttribute('aria-selected', String(isTailscaleMode));
      btnSetQrLocal.classList.toggle('active', isLocalMode);
      btnSetQrLocal.setAttribute('aria-selected', String(isLocalMode));
    }

    if (tailscaleBadge) {
      tailscaleBadge.textContent = tailscaleServeActive ? 'HTTPS' : tailscaleDetected ? 'Ready' : 'Off';
    }

    if (contextTailscale && contextLocal) {
      contextTailscale.style.display = isLocalMode ? 'none' : 'flex';
      contextLocal.style.display = isLocalMode ? 'flex' : 'none';
    }

    // 3. QR Code Stage & Active URL
    if (qrSourceLabel) {
      if (activeQrSource === 'tailscale') {
        qrSourceLabel.textContent = tailscaleServeActive
          ? '🔒 Tailscale HTTPS (Let\'s Encrypt TLS)'
          : '🔒 Tailscale Remote (WireGuard 4G/5G)';
      } else if (activeQrSource === 'tunnel') {
        qrSourceLabel.textContent = '🌐 Legacy Public Tunnel';
      } else {
        qrSourceLabel.textContent = '📶 Local Wi-Fi (Same Subnet)';
      }
    }

    if (activeUrlDisplay) {
      activeUrlDisplay.textContent = activeUrl || localUrl || '—';
    }

    if (qrBox) {
      if (qrSvg) {
        qrBox.innerHTML = qrSvg;
      } else {
        qrBox.innerHTML = '<div class="qr-placeholder"><span>Start server to generate QR</span></div>';
      }
    }

    // 4. Contextual Card Data (Tailscale & Local)
    if (tailscaleDnsText) {
      tailscaleDnsText.textContent = tailscaleDns || (tailscaleDetected ? 'MagicDNS not set' : 'Tailscale not detected');
    }

    if (tailscaleUrlText) {
      const directIpUrl = tailscaleIp ? `http://${tailscaleIp}:${port || 4747}` : '';
      tailscaleUrlText.textContent = directIpUrl || tailscaleUrl || 'Tailscale not detected';
    }

    if (tailscaleServeBadge) {
      tailscaleServeBadge.textContent = tailscaleServeActive ? 'TLS Active 🔒' : 'WireGuard P2P';
    }

    if (tailscaleServeStatus) {
      if (tailscaleServeActive) {
        tailscaleServeStatus.innerHTML = `<span style="color: var(--status-green); font-weight: 600;">● Let's Encrypt HTTPS active via Tailscale Serve</span>`;
      } else if (tailscaleDetected) {
        tailscaleServeStatus.textContent = 'Encrypted P2P mesh • Optional 1-click HTTPS Serve';
      } else {
        tailscaleServeStatus.innerHTML = `<span style="color: var(--status-amber);">Install or connect Tailscale for remote 4G/5G access</span>`;
      }
    }

    if (btnTailscaleServe && btnTailscaleReset) {
      if (tailscaleServeActive) {
        btnTailscaleServe.textContent = '✓ HTTPS Active';
        btnTailscaleReset.style.display = 'inline-flex';
      } else {
        btnTailscaleServe.textContent = '🔒 Enable HTTPS (Serve)';
        btnTailscaleReset.style.display = 'none';
      }
    }

    if (localUrlText) {
      localUrlText.textContent = localUrl || '—';
    }

    // 5. CDP Workbench Status
    const targetCdpPort = cdpPort || 7800;
    if (cdpStatusText) {
      if (cdpListening) {
        const cleanTitle = cdpTarget ? ` (${escapeHtml(cdpTarget)})` : '';
        cdpStatusText.innerHTML = `<span class="cdp-dot connected"></span><span style="color: var(--status-green);">CDP Port ${targetCdpPort} Connected${cleanTitle}</span>`;
      } else if (telemetryMode) {
        cdpStatusText.innerHTML = `<span class="cdp-dot connected"></span><span style="color: var(--status-green);">🟢 Zero-CDP Active (${escapeHtml(telemetryMode)}) — Telemetry &amp; agy Bridge Ready</span>`;
      } else {
        cdpStatusText.innerHTML = `<span class="cdp-dot missing"></span><span style="color: var(--status-amber);">Port ${targetCdpPort} Not Detected</span>`;
      }
    }

    // 6. Legacy Tunnel Status
    if (tunnelSelect && tunnelProvider) {
      // @ts-ignore
      tunnelSelect.value = tunnelProvider;
    }
    if (tunnelUrlText) {
      tunnelUrlText.textContent =
        tunnelUrl || (tunnelProvider && tunnelProvider !== 'none' ? 'Connecting...' : 'Disabled');
    }

    // 7. Security & Password Status
    if (inputPassword && !inputPassword.dataset.userDirty && document.activeElement !== inputPassword) {
      // @ts-ignore
      inputPassword.value = configuredPassword || (isCustomPassword ? activePassword : '');
    }
    if (passwordBadge) {
      passwordBadge.textContent = isCustomPassword ? 'Custom Password' : 'Default: antigravity';
      passwordBadge.style.color = isCustomPassword ? 'var(--status-green)' : 'var(--text-muted)';
    }

    // 8. Telegram Bot Status
    if (inputTelegramToken && !inputTelegramToken.dataset.userDirty && document.activeElement !== inputTelegramToken) {
      // @ts-ignore
      if (telegramBotToken || !inputTelegramToken.value) {
        // @ts-ignore
        inputTelegramToken.value = telegramBotToken || '';
      }
    }
    if (inputTelegramChatId && !inputTelegramChatId.dataset.userDirty && document.activeElement !== inputTelegramChatId) {
      // @ts-ignore
      if (telegramChatId || !inputTelegramChatId.value) {
        // @ts-ignore
        inputTelegramChatId.value = telegramChatId || '';
      }
    }
    const tokenVal = inputTelegramToken ? (/** @type {HTMLInputElement} */ (inputTelegramToken)).value.trim() : '';
    const chatVal = inputTelegramChatId ? (/** @type {HTMLInputElement} */ (inputTelegramChatId)).value.trim() : '';
    const isActive = Boolean(isTelegramConfigured || (tokenVal && chatVal));

    if (telegramBadge) {
      telegramBadge.textContent = isActive ? 'Telegram: Active' : 'Telegram: Off';
      telegramBadge.style.color = isActive ? 'var(--status-green)' : 'var(--text-muted)';
      telegramBadge.classList.toggle('active-tag', isActive);
    }
    if (telegramStatusHint) {
      if (isActive) {
        telegramStatusHint.innerHTML = '<span style="color: var(--status-green); font-weight: 600;">● Bot active &amp; ready for alerts</span>';
      } else {
        telegramStatusHint.textContent = 'Lock-screen alerts & /approve commands';
      }
    }
  }

  function appendLog(line) {
    if (!logContainer) return;
    const div = document.createElement('div');
    div.className = 'log-entry';

    const time = new Date().toLocaleTimeString();
    div.innerHTML = `<span class="log-time">[${time}]</span>${escapeHtml(line)}`;

    logContainer.appendChild(div);
    logContainer.scrollTop = logContainer.scrollHeight;

    logCount += 1;
    if (logCountBadge) {
      logCountBadge.textContent = String(logCount);
    }
  }

  function escapeHtml(str) {
    if (!str) return '';
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  // Notify extension host that webview is ready
  vscode.postMessage({ command: 'ready' });
})();
