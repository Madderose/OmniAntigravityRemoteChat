// @ts-check
/**
 * Modular REST & WebSocket Route Mounting for Zero-CDP & Execution Engine.
 *
 * Encapsulates all transcript monitoring and agy CLI bridge endpoints
 * following the Single Responsibility Principle, ensuring src/server.js
 * remains strictly below its modification ceiling.
 *
 * @module services/api-router
 */

import { transcriptWatcherService as defaultWatcher } from './transcript-watcher-service.js';
import { agyBridgeService as defaultBridge } from './agy-bridge-service.js';

/**
 * @typedef {Object} MountOptions
 * @param {(message: any) => void} [broadcast]
 * @param {import('./transcript-watcher-service.js').TranscriptWatcherService} [transcriptWatcher]
 * @param {import('./agy-bridge-service.js').AgyBridgeService} [agyBridge]
 */

/**
 * Mount Zero-CDP and Agy Bridge routes onto Express application.
 *
 * @param {import('express').Express} app
 * @param {MountOptions} [options]
 */
export function mountExecutionAndTranscriptRoutes(app, options = {}) {
    const transcriptWatcher = options.transcriptWatcher || defaultWatcher;
    const agyBridge = options.agyBridge || defaultBridge;
    const broadcast = typeof options.broadcast === 'function' ? options.broadcast : () => {};

    // ─── WebSocket Event Subscriptions ──────────────────────────────────
    transcriptWatcher.on('step', (step, convId) => {
        broadcast({
            type: 'transcript_step',
            step,
            conversationId: convId
        });
    });

    transcriptWatcher.on('action_required', (step, convId) => {
        broadcast({
            type: 'transcript_action_required',
            step,
            conversationId: convId
        });
    });

    transcriptWatcher.on('task_completed', (step, convId) => {
        broadcast({
            type: 'transcript_task_completed',
            step,
            conversationId: convId
        });
    });

    agyBridge.on('chunk', (chunk) => {
        broadcast({
            type: 'agy_chunk',
            chunk
        });
    });

    agyBridge.on('action_required', (action) => {
        broadcast({
            type: 'agy_action_required',
            action
        });
    });

    agyBridge.on('agy:exit', (exitInfo) => {
        broadcast({
            type: 'agy_exit',
            exitInfo
        });
    });

    // ─── REST Endpoints: Transcript & Conversations ─────────────────────

    app.get('/api/conversations', async (req, res) => {
        try {
            const limit = Number(req.query.limit) > 0 ? Number(req.query.limit) : 30;
            const conversations = await transcriptWatcher.listConversations({ limit });
            res.json({
                activeId: transcriptWatcher.getActiveConversationId(),
                conversations
            });
        } catch (err) {
            res.status(500).json({ error: String(err) });
        }
    });

    app.get('/api/conversations/:id/steps', async (req, res) => {
        try {
            const { id } = req.params;
            if (id === transcriptWatcher.getActiveConversationId()) {
                res.json({ id, steps: transcriptWatcher.getSteps() });
            } else {
                const steps = await transcriptWatcher.selectConversation(id);
                res.json({ id, steps });
            }
        } catch (err) {
            res.status(500).json({ error: String(err) });
        }
    });

    app.post('/api/conversations/select', async (req, res) => {
        try {
            const id = req.body?.id;
            if (!id || typeof id !== 'string') {
                res.status(400).json({ error: 'Conversation id is required' });
                return;
            }
            const steps = await transcriptWatcher.selectConversation(id);
            res.json({ success: true, id, steps });
        } catch (err) {
            res.status(500).json({ error: String(err) });
        }
    });

    // ─── REST Endpoints: Headless agy CLI Engine ────────────────────────

    app.get('/api/agy/status', (req, res) => {
        res.json(agyBridge.getStatus());
    });

    app.get('/api/agy/models', (req, res) => {
        res.json({
            models: agyBridge.getModels(),
            currentModel: agyBridge.currentModel,
            currentEffort: agyBridge.currentEffort
        });
    });

    app.post('/api/agy/model', (req, res) => {
        const { model, effort } = req.body || {};
        if (!model) {
            res.status(400).json({ error: 'Model ID is required' });
            return;
        }
        const ok = agyBridge.setModelAndEffort(model, effort);
        res.json({
            success: ok,
            currentModel: agyBridge.currentModel,
            currentEffort: agyBridge.currentEffort
        });
    });

    app.post('/api/agy/send', async (req, res) => {
        try {
            const { prompt, model, effort, conversationId } = req.body || {};
            if (!prompt || typeof prompt !== 'string') {
                res.status(400).json({ error: 'Non-empty prompt string is required' });
                return;
            }
            const result = await agyBridge.sendMessage({
                prompt,
                model,
                effort,
                conversationId
            });
            res.json({ success: true, ...result });
        } catch (err) {
            res.status(500).json({ error: String(err) });
        }
    });

    app.post('/api/agy/stop', async (req, res) => {
        try {
            const stopped = await agyBridge.stopExecution();
            res.json({ success: stopped });
        } catch (err) {
            res.status(500).json({ error: String(err) });
        }
    });
}

export default mountExecutionAndTranscriptRoutes;
