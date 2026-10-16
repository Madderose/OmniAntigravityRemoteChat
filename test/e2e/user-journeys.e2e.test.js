// @ts-check
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawnTestServer, MobileJourneyClient } from './harness/journey-client.js';
import { cleanWindowTitle, getConversationStatus, pruneUploadsDirectory } from '../../src/utils/workspace.js';
import { safeTimingCompare } from '../../src/server.js';
import { sessionStats } from '../../src/session-stats.js';
import { transcriptWatcherService } from '../../src/services/transcript-watcher-service.js';

describe('Suite E2E Haute Lisibilité — Parcours Utilisateurs OmniAntigravity v2.0', () => {
  /** @type {import('./harness/journey-client.js').TestServerContext} */
  let testServer;
  /** @type {MobileJourneyClient} */
  let client;

  beforeAll(async () => {
    testServer = await spawnTestServer();
    client = new MobileJourneyClient(testServer);
    await client.login('antigravity');
  });

  afterAll(async () => {
    await client.disconnect();
    await testServer.cleanup();
    try {
      await pruneUploadsDirectory({ maxAgeHours: 0, dryRun: false });
    } catch (_) {}
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 1. Parcours Vocal & Multimodal
  // ──────────────────────────────────────────────────────────────────────────
  describe('Scénario 1 : Parcours Audio Vocal & Multimodal', () => {
    it('enregistre, stocke et journalise un mémo vocal Opus de 5 secondes', async () => {
      const initialAudioCount = sessionStats.metrics.audioRecordings || 0;
      const fakeWebmBase64 = 'GkXfo59ChoEBQveBAULygQRC84EIQoKEd2VibUKHgQRChYECGFOAZwE=';

      // When : L'utilisateur enregistre un mémo vocal valide
      await client.uploadVoiceMemo({
        mimeType: 'audio/webm;codecs=opus',
        durationSeconds: 5.2,
        data: fakeWebmBase64,
        name: 'voice-memo-test.webm'
      });

      // Then : Le fichier est sauvegardé avec chemin sécurisé et type validé
      expect(client.lastUploadedFile).toBeDefined();
      expect(client.lastUploadedFile?.fileName).toMatch(/\d+-voice-memo-test\.webm$/);
      expect(client.lastUploadedFile?.mimeType).toBe('audio/webm;codecs=opus');
      expect(client.lastUploadedFile?.durationSeconds).toBe(5.2);

      // And : Les métriques de session reflètent immédiatement l'enregistrement
      expect(sessionStats.metrics.audioRecordings).toBe(initialAudioCount + 1);
    });

    it('rejette formellement les mémos vocaux vides ou aux formats non autorisés', async () => {
      // Format MIME exécutable / interdit
      await expect(client.uploadVoiceMemo({
        mimeType: 'application/x-sh',
        durationSeconds: 1,
        data: 'ZWNobyAiZXZpbCI='
      })).rejects.toThrow(/Unsupported audio/);

      // Données audio vides (0 octet)
      await expect(client.uploadVoiceMemo({
        mimeType: 'audio/webm',
        durationSeconds: 0,
        data: ''
      })).rejects.toThrow(/Audio payload is empty/);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 2. Parcours Multi-Fenêtres & Onglets Défilables
  // ──────────────────────────────────────────────────────────────────────────
  describe('Scénario 2 : Parcours Navigation Multi-Fenêtres & Onglets Défilables', () => {
    it('assainit les titres de fenêtres IDE pour un affichage mobile net (cleanWindowTitle)', () => {
      // Given : Des titres de fenêtres Antigravity bruts
      const rawTitle1 = 'OmniAntigravityRemoteChat - Antigravity IDE';
      const rawTitle2 = 'Projet_Cholet - Antigravity IDE - README.md';

      // When : La fonction de normalisation est appelée
      const cleaned1 = cleanWindowTitle(rawTitle1);
      const cleaned2 = cleanWindowTitle(rawTitle2);

      // Then : Seul le nom lisible de projet est conservé, sans bruit
      expect(cleaned1).toBe('OmniAntigravityRemoteChat');
      expect(cleaned2).toBe('Projet_Cholet');
    });

    it('interroge les statuts de conversation en temps réel via l’API O(1)', async () => {
      // When : Le client consulte le statut des conversations
      await client.get('/api/conversations/status?ids=conv-alpha,conv-beta');

      // Then : La réponse HTTP est un succès avec statut 200
      expect(client.lastResponse?.status).toBe(200);
      expect(client.lastJson).toBeDefined();
      expect(Array.isArray(client.lastJson?.statuses) || typeof client.lastJson === 'object').toBe(true);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 3. Parcours Décisionnel & Plan d'Implémentation
  // ──────────────────────────────────────────────────────────────────────────
  describe('Scénario 3 : Parcours Décisionnel & Plan d’Implémentation', () => {
    it('permet de récupérer l’état des plans d’implémentation sans bloquer l’UI', async () => {
      // When : Le client mobile consulte la liste des plans disponibles
      await client.get('/api/plans');

      // Then : L'API répond avec une structure valide
      expect(client.lastResponse?.status).toBe(200);
      expect(client.lastJson).toBeDefined();
      expect(client.lastJson).toHaveProperty('plans');
      expect(Array.isArray(client.lastJson?.plans)).toBe(true);
    });

    it('expose l’endpoint de prévisualisation du plan actif ou walkthrough', async () => {
      // When : Le client demande l'état du plan
      await client.get('/api/plan');

      // Then : La requête aboutit (200 avec contenu ou 404/vide propre sans crash)
      expect([200, 404]).toContain(client.lastResponse?.status);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 4. Parcours Résilience Réseau, Reconnexion & Sécurité
  // ──────────────────────────────────────────────────────────────────────────
  describe('Scénario 4 : Parcours Résilience Réseau & Diagnostic Profond', () => {
    it('renvoie un rapport de santé complet via la sonde profonde /health/deep', async () => {
      // When : Le client ou le superviseur interroge la sonde profonde
      await client.get('/health/deep');

      // Then : L’API renvoie un statut 200 avec les métriques mémoire et stockage
      expect(client.lastResponse?.status).toBe(200);
      expect(client.lastJson?.status).toBeDefined();
      expect(client.lastJson?.memory?.heapUsedMB).toBeGreaterThan(0);
      expect(client.lastJson?.storage?.diskWritable).toBe(true);
      expect(typeof client.lastJson?.concurrency?.sendQueueDepth).toBe('number');
    });

    it('bloque formellement tout accès distant non authentifié avec HTTP 401 strict', async () => {
      // Given : Un client externe (IP publique simulée) sans cookie de session
      const res = await fetch(`${testServer.baseUrl}/api/plans`, {
        headers: { 'x-forwarded-for': '203.0.113.195' }
      });

      // Then : Il est rejeté avec un code HTTP 401 Unauthorized
      expect(res.status).toBe(401);
    });

    it('protège la vérification des mots de passe contre les attaques par canal auxiliaire (safeTimingCompare)', () => {
      // Test de comparaison à temps constant
      expect(safeTimingCompare('secret-key-42', 'secret-key-42')).toBe(true);
      expect(safeTimingCompare('secret-key-42', 'wrong-key-99')).toBe(false);
      expect(safeTimingCompare('short', 'much-longer-string')).toBe(false);
      // @ts-ignore
      expect(safeTimingCompare(null, undefined)).toBe(false);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 5. Parcours Zero-CDP & Simulation de Transcript Stream
  // ──────────────────────────────────────────────────────────────────────────
  describe('Scénario 5 : Parcours Zero-CDP & Tailing de Transcript O(1)', () => {
    it('calcule le statut de conversation instantanément sans latence', async () => {
      // Given : Un identifiant de conversation factice
      const testId = 'dummy-conversation-e2e';

      // When : getConversationStatus inspecte la conversation de manière asynchrone
      const status = await getConversationStatus(testId);

      // Then : Pour un ID inexistant, retourne null sans lever d'erreur
      expect(status).toBeNull();
    });

    it('interroge la liste des conversations Zero-CDP et le catalogue de modèles agy via REST', async () => {
      // When : Le client mobile consulte la liste des conversations disponibles
      await client.get('/api/conversations');
      expect(client.lastResponse?.status).toBe(200);
      expect(Array.isArray(client.lastJson?.conversations)).toBe(true);

      // And : Le client mobile consulte le catalogue de modèles
      await client.get('/api/agy/models');
      expect(client.lastResponse?.status).toBe(200);
      expect(Array.isArray(client.lastJson?.models)).toBe(true);
      expect(client.lastJson?.models.length).toBeGreaterThan(0);
      expect(client.lastJson?.currentModel).toBeDefined();
    });

    it('diffuse les événements de transcript en streaming temps réel sur le WebSocket mobile', async () => {
      // Given : Un client connecté au WebSocket
      await client.connectWebSocket();
      client.wsMessages = [];

      // When : Le service TranscriptWatcher émet une nouvelle étape
      const mockStep = {
        step_index: 99,
        source: 'MODEL',
        type: 'PLANNER_RESPONSE',
        status: 'DONE',
        content: 'Streaming step from zero-CDP watcher'
      };
      transcriptWatcherService.emit('step', mockStep, 'conv-e2e-live');

      // Attente d'un court délai pour propagation WebSocket
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Then : Le client a reçu la trame transcript_step en direct
      const stepMsg = client.wsMessages.find(
        (m) => m?.type === 'transcript_step' && m?.conversationId === 'conv-e2e-live'
      );
      expect(stepMsg).toBeDefined();
      expect(stepMsg.step.content).toBe('Streaming step from zero-CDP watcher');
    });
  });
});
