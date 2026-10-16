// @ts-check
import { describe, expect, it, vi } from 'vitest';
import express from 'express';
import { EventEmitter } from 'events';
import { mountExecutionAndTranscriptRoutes } from '../../src/services/api-router.js';

/**
 * Creates an ephemeral test harness for testing Express router endpoints
 */
function createTestApp() {
    const app = express();
    app.use(express.json());

    const mockWatcher = new EventEmitter();
    // @ts-ignore
    mockWatcher.getActiveConversationId = vi.fn(() => 'conv-1');
    // @ts-ignore
    mockWatcher.listConversations = vi.fn(async () => [{ id: 'conv-1', mtimeMs: 1234 }]);
    // @ts-ignore
    mockWatcher.getSteps = vi.fn(() => [{ step_index: 0, content: 'step 0' }]);
    // @ts-ignore
    mockWatcher.selectConversation = vi.fn(async (id) => [{ step_index: 0, content: `steps for ${id}` }]);

    const mockBridge = new EventEmitter();
    // @ts-ignore
    mockBridge.currentModel = 'gemini-4-argon-high';
    // @ts-ignore
    mockBridge.currentEffort = 'high';
    // @ts-ignore
    mockBridge.getStatus = vi.fn(() => ({ status: 'idle', currentModel: 'gemini-4-argon-high' }));
    // @ts-ignore
    mockBridge.getModels = vi.fn(() => [{ id: 'gemini-4-argon-high', label: 'Gemini 4 Argon' }]);
    // @ts-ignore
    mockBridge.setModelAndEffort = vi.fn((m, e) => {
        mockBridge.currentModel = m;
        if (e) mockBridge.currentEffort = e;
        return true;
    });
    // @ts-ignore
    mockBridge.sendMessage = vi.fn(async (opts) => ({ status: 'started', pid: 1234, ...opts }));
    // @ts-ignore
    mockBridge.stopExecution = vi.fn(async () => true);

    const broadcasts = [];
    const broadcast = (msg) => broadcasts.push(msg);

    mountExecutionAndTranscriptRoutes(app, {
        broadcast,
        // @ts-ignore
        transcriptWatcher: mockWatcher,
        // @ts-ignore
        agyBridge: mockBridge
    });

    return { app, mockWatcher, mockBridge, broadcasts };
}

describe('api-router (Zero-CDP & Agy Routes)', () => {
    it('1. GET /api/conversations lists conversations with activeId', async () => {
        const { app, mockWatcher } = createTestApp();
        const server = app.listen(0);
        // @ts-ignore
        const port = server.address().port;

        try {
            const res = await fetch(`http://127.0.0.1:${port}/api/conversations?limit=10`);
            const data = await res.json();
            expect(res.status).toBe(200);
            expect(data.activeId).toBe('conv-1');
            expect(data.conversations).toHaveLength(1);
            expect(mockWatcher.listConversations).toHaveBeenCalledWith({ limit: 10 });
        } finally {
            server.close();
        }
    });

    it('2. GET /api/conversations/:id/steps returns steps for requested conversation', async () => {
        const { app, mockWatcher } = createTestApp();
        const server = app.listen(0);
        // @ts-ignore
        const port = server.address().port;

        try {
            // Active ID
            const res1 = await fetch(`http://127.0.0.1:${port}/api/conversations/conv-1/steps`);
            const data1 = await res1.json();
            expect(res1.status).toBe(200);
            expect(data1.steps[0].content).toBe('step 0');

            // Non-active ID
            const res2 = await fetch(`http://127.0.0.1:${port}/api/conversations/conv-2/steps`);
            const data2 = await res2.json();
            expect(res2.status).toBe(200);
            expect(mockWatcher.selectConversation).toHaveBeenCalledWith('conv-2');
            expect(data2.steps[0].content).toBe('steps for conv-2');
        } finally {
            server.close();
        }
    });

    it('3. POST /api/conversations/select validates body and selects conversation', async () => {
        const { app, mockWatcher } = createTestApp();
        const server = app.listen(0);
        // @ts-ignore
        const port = server.address().port;

        try {
            const badRes = await fetch(`http://127.0.0.1:${port}/api/conversations/select`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({})
            });
            expect(badRes.status).toBe(400);

            const goodRes = await fetch(`http://127.0.0.1:${port}/api/conversations/select`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: 'conv-selected' })
            });
            const data = await goodRes.json();
            expect(goodRes.status).toBe(200);
            expect(data.success).toBe(true);
            expect(mockWatcher.selectConversation).toHaveBeenCalledWith('conv-selected');
        } finally {
            server.close();
        }
    });

    it('4. GET /api/agy/status and GET /api/agy/models return bridge metadata', async () => {
        const { app, mockBridge } = createTestApp();
        const server = app.listen(0);
        // @ts-ignore
        const port = server.address().port;

        try {
            const statusRes = await fetch(`http://127.0.0.1:${port}/api/agy/status`);
            const status = await statusRes.json();
            expect(statusRes.status).toBe(200);
            expect(status.status).toBe('idle');

            const modelsRes = await fetch(`http://127.0.0.1:${port}/api/agy/models`);
            const models = await modelsRes.json();
            expect(modelsRes.status).toBe(200);
            expect(models.models).toHaveLength(1);
            expect(models.currentModel).toBe('gemini-4-argon-high');
        } finally {
            server.close();
        }
    });

    it('5. POST /api/agy/model configures active model and reasoning effort', async () => {
        const { app, mockBridge } = createTestApp();
        const server = app.listen(0);
        // @ts-ignore
        const port = server.address().port;

        try {
            const badRes = await fetch(`http://127.0.0.1:${port}/api/agy/model`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({})
            });
            expect(badRes.status).toBe(400);

            const goodRes = await fetch(`http://127.0.0.1:${port}/api/agy/model`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ model: 'claude-5-5-sonnet', effort: 'max' })
            });
            const data = await goodRes.json();
            expect(goodRes.status).toBe(200);
            expect(data.success).toBe(true);
            expect(data.currentModel).toBe('claude-5-5-sonnet');
            expect(data.currentEffort).toBe('max');
        } finally {
            server.close();
        }
    });

    it('6. POST /api/agy/send and POST /api/agy/stop dispatch to bridge', async () => {
        const { app, mockBridge } = createTestApp();
        const server = app.listen(0);
        // @ts-ignore
        const port = server.address().port;

        try {
            const badSend = await fetch(`http://127.0.0.1:${port}/api/agy/send`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ prompt: '' })
            });
            expect(badSend.status).toBe(400);

            const goodSend = await fetch(`http://127.0.0.1:${port}/api/agy/send`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ prompt: 'Execute plan', model: 'gemini-4-argon-high', effort: 'high' })
            });
            const sendData = await goodSend.json();
            expect(goodSend.status).toBe(200);
            expect(sendData.success).toBe(true);
            expect(mockBridge.sendMessage).toHaveBeenCalled();

            const stopRes = await fetch(`http://127.0.0.1:${port}/api/agy/stop`, {
                method: 'POST'
            });
            const stopData = await stopRes.json();
            expect(stopRes.status).toBe(200);
            expect(stopData.success).toBe(true);
            expect(mockBridge.stopExecution).toHaveBeenCalled();
        } finally {
            server.close();
        }
    });

    it('7. Subscribes to events and broadcasts them over WebSocket callback', () => {
        const { mockWatcher, mockBridge, broadcasts } = createTestApp();

        mockWatcher.emit('step', { step_index: 1 }, 'conv-xyz');
        expect(broadcasts).toContainEqual({
            type: 'transcript_step',
            step: { step_index: 1 },
            conversationId: 'conv-xyz'
        });

        mockWatcher.emit('action_required', { status: 'WAITING' }, 'conv-xyz');
        expect(broadcasts).toContainEqual({
            type: 'transcript_action_required',
            step: { status: 'WAITING' },
            conversationId: 'conv-xyz'
        });

        mockWatcher.emit('task_completed', { status: 'DONE' }, 'conv-xyz');
        expect(broadcasts).toContainEqual({
            type: 'transcript_task_completed',
            step: { status: 'DONE' },
            conversationId: 'conv-xyz'
        });

        mockBridge.emit('chunk', { type: 'text', data: 'hello' });
        expect(broadcasts).toContainEqual({
            type: 'agy_chunk',
            chunk: { type: 'text', data: 'hello' }
        });

        mockBridge.emit('action_required', { id: 'act-1' });
        expect(broadcasts).toContainEqual({
            type: 'agy_action_required',
            action: { id: 'act-1' }
        });

        mockBridge.emit('agy:exit', { code: 0, signal: null });
        expect(broadcasts).toContainEqual({
            type: 'agy_exit',
            exitInfo: { code: 0, signal: null }
        });
    });
});
