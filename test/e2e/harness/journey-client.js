// @ts-check
/**
 * Test E2E Harness — Fluent Given/When/Then DSL for User Journeys
 * OmniAntigravity Remote Chat
 *
 * Implémentation du pattern Journey Client recommandé par le PSE Gemini 4 Argon High.
 */

import { WebSocket } from 'ws';
import { createServer } from '../../../src/server.js';
import { saveUploadedAudio, pruneUploadsDirectory } from '../../../src/utils/workspace.js';
import { sessionStats } from '../../../src/session-stats.js';

/**
 * @typedef {Object} TestServerContext
 * @property {import('http').Server} server
 * @property {import('ws').WebSocketServer} wss
 * @property {import('express').Express} app
 * @property {number} port
 * @property {string} baseUrl
 * @property {string} wsUrl
 * @property {() => Promise<void>} cleanup
 */

/**
 * Lance une instance éphémère du serveur sur un port libre (port: 0).
 * @returns {Promise<TestServerContext>}
 */
export async function spawnTestServer() {
  const { server, wss, app } = await createServer();
  await new Promise((resolve) => server.listen(0, resolve));
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 0;
  const baseUrl = `http://127.0.0.1:${port}`;
  const wsUrl = `ws://127.0.0.1:${port}/ws`;

  return {
    server,
    wss,
    app,
    port,
    baseUrl,
    wsUrl,
    cleanup: async () => {
      try {
        wss?.close();
        await new Promise((resolve) => server.close(resolve));
      } catch (_) {}
    }
  };
}

/**
 * Client fluide simulant les interactions du navigateur mobile
 */
export class MobileJourneyClient {
  /**
   * @param {TestServerContext} ctx
   */
  constructor(ctx) {
    this.ctx = ctx;
    this.cookies = '';
    this.authToken = '';
    /** @type {WebSocket | null} */
    this.ws = null;
    /** @type {any[]} */
    this.wsMessages = [];
    this.lastUploadedFile = null;
    this.lastResponse = null;
    this.lastJson = null;
  }

  /**
   * Given : Authentifie le client mobile avec le mot de passe d'application
   * @param {string} [password]
   */
  async login(password = 'antigravity') {
    const res = await fetch(`${this.ctx.baseUrl}/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ password }).toString(),
      redirect: 'manual'
    });
    this.lastResponse = res;
    const setCookie = res.headers.get('set-cookie');
    if (setCookie) {
      this.cookies = setCookie.split(';')[0];
    }
    return this;
  }

  /**
   * Given : Établit la connexion WebSocket temps réel
   */
  async connectWebSocket() {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(this.ctx.wsUrl, {
        headers: this.cookies ? { Cookie: this.cookies } : {}
      });

      this.ws.on('open', () => resolve(this));
      this.ws.on('message', (data) => {
        try {
          this.wsMessages.push(JSON.parse(data.toString()));
        } catch (_) {
          this.wsMessages.push(data.toString());
        }
      });
      this.ws.on('error', reject);
    });
  }

  /**
   * When : Téléverse un mémo vocal natif
   * @param {{ mimeType: string, durationSeconds: number, data: string, name?: string }} payload
   */
  async uploadVoiceMemo(payload) {
    const result = await saveUploadedAudio({
      mimeType: payload.mimeType,
      durationSeconds: payload.durationSeconds,
      data: payload.data,
      name: payload.name || 'memo.webm'
    });
    this.lastUploadedFile = result;
    sessionStats.increment('audioRecordings');
    return this;
  }

  /**
   * When : Effectue un appel API GET authentifié
   * @param {string} path
   */
  async get(path) {
    const res = await fetch(`${this.ctx.baseUrl}${path}`, {
      headers: this.cookies ? { Cookie: this.cookies } : {}
    });
    this.lastResponse = res;
    try {
      this.lastJson = await res.json();
    } catch (_) {
      this.lastJson = null;
    }
    return this;
  }

  /**
   * When : Effectue un appel API POST JSON authentifié
   * @param {string} path
   * @param {any} body
   */
  async postJson(path, body) {
    const res = await fetch(`${this.ctx.baseUrl}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(this.cookies ? { Cookie: this.cookies } : {})
      },
      body: JSON.stringify(body)
    });
    this.lastResponse = res;
    try {
      this.lastJson = await res.json();
    } catch (_) {
      this.lastJson = null;
    }
    return this;
  }

  /**
   * Déconnexion propre
   */
  async disconnect() {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.close();
    }
  }
}
