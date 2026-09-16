import { describe, it } from 'vitest';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { cleanWindowTitle, getConversationStatus } from '../../src/utils/workspace.js';

describe('Window Title Cleaning (cleanWindowTitle)', () => {
    it('extracts concise project name by stripping Antigravity IDE suffix', () => {
        assert.equal(
            cleanWindowTitle('Projet_Cholet - Antigravity IDE - README.md'),
            'Projet_Cholet'
        );
        assert.equal(
            cleanWindowTitle('Hopptimizer Maroc - Antigravity IDE - Walkthrough'),
            'Hopptimizer Maroc'
        );
        assert.equal(
            cleanWindowTitle('OmniAntigravityRemoteChat - Antigravity IDE'),
            'OmniAntigravityRemoteChat'
        );
    });

    it('falls back gracefully on non-standard titles or empty/null input', () => {
        assert.equal(cleanWindowTitle('SimpleWorkspace - Project'), 'SimpleWorkspace');
        assert.equal(cleanWindowTitle(''), 'Antigravity IDE');
        assert.equal(cleanWindowTitle(null), 'Antigravity IDE');
        assert.equal(cleanWindowTitle(undefined), 'Antigravity IDE');
        assert.equal(cleanWindowTitle(123), 'Antigravity IDE');
    });
});

describe('Conversation Status Reader (getConversationStatus)', () => {
    it('returns null safely for invalid or non-existent conversation IDs', async () => {
        const resNull = await getConversationStatus(null);
        assert.equal(resNull, null);

        const resEmpty = await getConversationStatus('');
        assert.equal(resEmpty, null);

        const resNonExistent = await getConversationStatus('definitely-not-an-existing-uuid-12345678');
        assert.equal(resNonExistent, null);
    });

    it('reads step_index and metadata efficiently from transcript.jsonl', async () => {
        const testBrainDir = path.join(os.homedir(), '.gemini', 'antigravity-ide', 'brain', 'test-chat-tab-unread');
        const logsDir = path.join(testBrainDir, '.system_generated', 'logs');
        await fsp.mkdir(logsDir, { recursive: true });

        const transcriptFile = path.join(logsDir, 'transcript.jsonl');
        const lines = [
            JSON.stringify({ step_index: 1, type: 'USER_INPUT', source: 'USER', text: 'Hello' }),
            JSON.stringify({ step_index: 2, type: 'PLANNER_RESPONSE', source: 'MODEL', text: 'Hi' }),
            JSON.stringify({ step_index: 5, type: 'PLANNER_RESPONSE', source: 'MODEL', text: 'Step 5 complete' })
        ].join('\n') + '\n';

        await fsp.writeFile(transcriptFile, lines, 'utf-8');

        try {
            const status = await getConversationStatus('test-chat-tab-unread');
            assert.ok(status);
            assert.equal(status.chatId, 'test-chat-tab-unread');
            assert.equal(status.stepIndex, 5);
            assert.equal(status.type, 'PLANNER_RESPONSE');
            assert.equal(status.source, 'MODEL');
            assert.ok(typeof status.updatedAt === 'number');

            // Fastpick prefix handling
            const statusWithPrefix = await getConversationStatus('fastpick-item-test-chat-tab-unread');
            assert.ok(statusWithPrefix);
            assert.equal(statusWithPrefix.chatId, 'test-chat-tab-unread');
            assert.equal(statusWithPrefix.stepIndex, 5);
        } finally {
            await fsp.rm(testBrainDir, { recursive: true, force: true }).catch(() => {});
        }
    });

    it('handles empty transcript files without crashing', async () => {
        const testBrainDir = path.join(os.homedir(), '.gemini', 'antigravity-ide', 'brain', 'test-empty-chat');
        const logsDir = path.join(testBrainDir, '.system_generated', 'logs');
        await fsp.mkdir(logsDir, { recursive: true });

        const transcriptFile = path.join(logsDir, 'transcript.jsonl');
        await fsp.writeFile(transcriptFile, '', 'utf-8');

        try {
            const status = await getConversationStatus('test-empty-chat');
            assert.ok(status);
            assert.equal(status.chatId, 'test-empty-chat');
            assert.equal(status.stepIndex, 0);
            assert.equal(status.type, 'EMPTY');
        } finally {
            await fsp.rm(testBrainDir, { recursive: true, force: true }).catch(() => {});
        }
    });
});

describe('Conversation Unread Count Lifecycle (LocalStorage & Session Constraint)', () => {
    it('correctly increments unread count on step advancement and resets to 0 upon activation', () => {
        // Simulated unread map as persisted in localStorage
        const unreadStore = {};

        function simulatePoll(chatId, newStep, isCurrentlyActive) {
            const entry = unreadStore[chatId] || { lastSeenStep: newStep, unreadCount: 0 };
            if (isCurrentlyActive) {
                if (newStep > entry.lastSeenStep) {
                    entry.lastSeenStep = newStep;
                }
                entry.unreadCount = 0; // STRICT REQUIREMENT: active conversation unread is ALWAYS 0
            } else {
                if (newStep > entry.lastSeenStep) {
                    entry.unreadCount = newStep - entry.lastSeenStep;
                }
            }
            unreadStore[chatId] = entry;
        }

        function simulateOpenConversation(chatId, latestStep) {
            const entry = unreadStore[chatId] || { lastSeenStep: 0, unreadCount: 0 };
            if (typeof latestStep === 'number') {
                entry.lastSeenStep = Math.max(entry.lastSeenStep, latestStep);
            }
            // Strict constraint: unread count must reset to 0 when opened
            entry.unreadCount = 0;
            unreadStore[chatId] = entry;
        }

        const CHAT_A = 'chat-workspace-1';
        const CHAT_B = 'chat-workspace-2';

        // 1. Initial observation: both at step 10
        simulatePoll(CHAT_A, 10, true); // Active
        simulatePoll(CHAT_B, 10, false); // Inactive

        assert.equal(unreadStore[CHAT_A].unreadCount, 0);
        assert.equal(unreadStore[CHAT_B].unreadCount, 0);

        // 2. Chat B advances to step 14 while inactive
        simulatePoll(CHAT_B, 14, false);
        assert.equal(unreadStore[CHAT_B].unreadCount, 4);

        // 3. Chat A advances to step 15 while active
        simulatePoll(CHAT_A, 15, true);
        assert.equal(unreadStore[CHAT_A].unreadCount, 0);

        // 4. User taps/opens Chat B: unread MUST be immediately reset to 0
        simulateOpenConversation(CHAT_B, 14);
        assert.equal(unreadStore[CHAT_B].unreadCount, 0);
        assert.equal(unreadStore[CHAT_B].lastSeenStep, 14);

        // 5. Chat B receives new step 16 while now active -> stays 0
        simulatePoll(CHAT_B, 16, true);
        assert.equal(unreadStore[CHAT_B].unreadCount, 0);
        assert.equal(unreadStore[CHAT_B].lastSeenStep, 16);
    });
});
