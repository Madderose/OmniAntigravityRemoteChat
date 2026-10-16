// @ts-check
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'fs';
import os from 'os';
import { join } from 'path';
import { TranscriptWatcherService } from '../../src/services/transcript-watcher-service.js';

describe('TranscriptWatcherService (Zero-CDP O(1))', () => {
    /** @type {string} */
    let tempRoot;
    /** @type {string} */
    let ideBrainDir;
    /** @type {string} */
    let cliBrainDir;
    /** @type {TranscriptWatcherService} */
    let service;

    beforeEach(async () => {
        tempRoot = await fs.promises.mkdtemp(join(os.tmpdir(), 'omni-tws-test-'));
        ideBrainDir = join(tempRoot, 'ide-brain');
        cliBrainDir = join(tempRoot, 'cli-brain');
        await fs.promises.mkdir(ideBrainDir, { recursive: true });
        await fs.promises.mkdir(cliBrainDir, { recursive: true });

        service = new TranscriptWatcherService({
            brainDirs: [ideBrainDir, cliBrainDir],
            pollMs: 50
        });
    });

    afterEach(async () => {
        service.dispose();
        try {
            await fs.promises.rm(tempRoot, { recursive: true, force: true });
        } catch {
            // Ignore cleanup errors on Windows
        }
    });

    /**
     * Helper to create a conversation log directory and return file paths.
     */
    async function createConvDir(brainDir, convId) {
        const logsDir = join(brainDir, convId, '.system_generated', 'logs');
        await fs.promises.mkdir(logsDir, { recursive: true });
        return {
            logsDir,
            transcriptPath: join(logsDir, 'transcript.jsonl'),
            fullTranscriptPath: join(logsDir, 'transcript_full.jsonl')
        };
    }

    it('1. discoverConversations & listConversations sort by mtimeMs descending across multiple brain dirs', async () => {
        const convOld = await createConvDir(ideBrainDir, 'conv-old');
        const convMid = await createConvDir(cliBrainDir, 'conv-mid');
        const convNew = await createConvDir(ideBrainDir, 'conv-new');

        await fs.promises.writeFile(convOld.transcriptPath, '{"step_index":0,"type":"USER_INPUT","content":"Old"}\n', 'utf8');
        await fs.promises.writeFile(convMid.transcriptPath, '{"step_index":0,"type":"USER_INPUT","content":"Mid"}\n', 'utf8');
        await fs.promises.writeFile(convNew.transcriptPath, '{"step_index":0,"type":"USER_INPUT","content":"New"}\n', 'utf8');

        const baseTime = Date.now() / 1000;
        await fs.promises.utimes(convOld.transcriptPath, baseTime - 300, baseTime - 300);
        await fs.promises.utimes(convMid.transcriptPath, baseTime - 150, baseTime - 150);
        await fs.promises.utimes(convNew.transcriptPath, baseTime - 10, baseTime - 10);

        const list = await service.listConversations({ limit: 10 });
        expect(list.map((c) => c.id)).toEqual(['conv-new', 'conv-mid', 'conv-old']);

        const mostRecent = await service.detectMostRecentConversation();
        expect(mostRecent).toBe('conv-new');
    });

    it('2. selectConversation switches active conversation, sets up state, and emits conversation:changed', async () => {
        const { transcriptPath } = await createConvDir(ideBrainDir, 'conv-active');
        await fs.promises.writeFile(transcriptPath, '{"step_index":0,"type":"USER_INPUT","content":"Hello world"}\n', 'utf8');

        let changedPayload = null;
        service.on('conversation:changed', (payload) => {
            changedPayload = payload;
        });

        const initialSteps = await service.selectConversation('conv-active');
        expect(service.getActiveConversationId()).toBe('conv-active');
        expect(service.currentConversationId).toBe('conv-active');
        expect(service.currentBrainDir).toBe(ideBrainDir);
        expect(changedPayload).toEqual({
            id: 'conv-active',
            brainDir: ideBrainDir,
            transcriptPath
        });
        expect(initialSteps).toHaveLength(1);
        expect(initialSteps[0].content).toBe('Hello world');
    });

    it('3. selectConversation(null) resets state and emits steps:reset', async () => {
        const { transcriptPath } = await createConvDir(ideBrainDir, 'conv-reset');
        await fs.promises.writeFile(transcriptPath, '{"step_index":0,"content":"foo"}\n', 'utf8');
        await service.selectConversation('conv-reset');

        let resetEmitted = false;
        service.on('steps:reset', (payload) => {
            if (payload.conversationId === null) resetEmitted = true;
        });

        // @ts-ignore
        const steps = await service.selectConversation(null);
        expect(steps).toHaveLength(0);
        expect(service.getActiveConversationId()).toBeNull();
        expect(service.getSteps()).toHaveLength(0);
        expect(resetEmitted).toBe(true);
    });

    it('4. incremental byte-offset tailing reads newly appended lines in O(1) without re-reading', async () => {
        const { transcriptPath } = await createConvDir(ideBrainDir, 'conv-tail');

        const step0 = JSON.stringify({
            step_index: 0,
            source: 'USER_EXPLICIT',
            type: 'USER_INPUT',
            status: 'DONE',
            content: 'Step zero'
        }) + '\n';

        await fs.promises.writeFile(transcriptPath, step0, 'utf8');

        /** @type {any[]} */
        const emittedSteps = [];
        service.on('step', (step) => emittedSteps.push(step));

        await service.selectConversation('conv-tail');
        expect(emittedSteps).toHaveLength(1);
        expect(emittedSteps[0].content).toBe('Step zero');

        const firstOffset = service.byteOffset;
        expect(firstOffset).toBeGreaterThan(0);

        // Polling when no file change occurs must return empty array
        const noop = await service.pollActiveTranscript();
        expect(noop).toHaveLength(0);
        expect(emittedSteps).toHaveLength(1);

        // Append step 1
        const step1 = JSON.stringify({
            step_index: 1,
            source: 'MODEL',
            type: 'PLANNER_RESPONSE',
            status: 'DONE',
            content: 'Step one model response',
            thinking: 'Analyzing step'
        }) + '\n';

        await fs.promises.appendFile(transcriptPath, step1, 'utf8');

        const newSteps = await service.pollActiveTranscript();
        expect(newSteps).toHaveLength(1);
        expect(newSteps[0].step_index).toBe(1);
        expect(newSteps[0].content).toBe('Step one model response');
        expect(newSteps[0].thinking).toBe('Analyzing step');
        expect(emittedSteps).toHaveLength(2);
        expect(service.getSteps()).toHaveLength(2);
        expect(service.getRecentSteps(1)).toHaveLength(1);
        expect(service.getRecentSteps(1)[0].step_index).toBe(1);
    });

    it('5. buffers incomplete JSON line split across multiple disk writes', async () => {
        const { transcriptPath } = await createConvDir(ideBrainDir, 'conv-split');

        const fullLine = JSON.stringify({
            step_index: 0,
            source: 'MODEL',
            type: 'PLANNER_RESPONSE',
            status: 'DONE',
            content: 'Split across two separate disk chunks!'
        });

        const half = Math.floor(fullLine.length / 2);
        const part1 = fullLine.slice(0, half);
        const part2 = fullLine.slice(half) + '\n';

        // Write first half without newline
        await fs.promises.writeFile(transcriptPath, part1, 'utf8');
        await service.selectConversation('conv-split');

        // Not emitted yet, buffered in partialLine
        expect(service.getSteps()).toHaveLength(0);
        expect(service.partialLine).toBe(part1);

        // Write second half with newline
        await fs.promises.appendFile(transcriptPath, part2, 'utf8');
        const parsed = await service.pollActiveTranscript();

        expect(parsed).toHaveLength(1);
        expect(parsed[0].content).toBe('Split across two separate disk chunks!');
        expect(service.partialLine).toBe('');
        expect(service.getSteps()).toHaveLength(1);
    });

    it('6. resolves truncated records from sibling transcript_full.jsonl', async () => {
        const { transcriptPath, fullTranscriptPath } = await createConvDir(ideBrainDir, 'conv-trunc');

        const compactRecord = {
            step_index: 0,
            source: 'MODEL',
            type: 'PLANNER_RESPONSE',
            status: 'DONE',
            content: 'Truncated summary...',
            is_truncated: true,
            truncated_fields: ['content']
        };

        const fullRecord = {
            step_index: 0,
            source: 'MODEL',
            type: 'PLANNER_RESPONSE',
            status: 'DONE',
            content: 'Full untruncated content with complete explanation and details!',
            thinking: 'Detailed reasoning chain',
            is_truncated: false
        };

        await fs.promises.writeFile(transcriptPath, JSON.stringify(compactRecord) + '\n', 'utf8');
        await fs.promises.writeFile(fullTranscriptPath, JSON.stringify(fullRecord) + '\n', 'utf8');

        const steps = await service.selectConversation('conv-trunc');
        expect(steps).toHaveLength(1);
        expect(steps[0].content).toBe('Full untruncated content with complete explanation and details!');
        expect(steps[0].thinking).toBe('Detailed reasoning chain');
    });

    it('7. safely handles corrupted or malformed JSON lines without crashing', async () => {
        const { transcriptPath } = await createConvDir(ideBrainDir, 'conv-corrupt');

        const corruptContent =
            'CORRUPTED_GARBAGE_LINE_NOT_JSON\n' +
            JSON.stringify({ step_index: 0, content: 'Valid line after garbage' }) +
            '\n' +
            '{"unclosed_json: true\n' +
            JSON.stringify({ step_index: 1, content: 'Another valid line' }) +
            '\n';

        await fs.promises.writeFile(transcriptPath, corruptContent, 'utf8');

        const steps = await service.selectConversation('conv-corrupt');
        expect(steps).toHaveLength(2);
        expect(steps[0].content).toBe('Valid line after garbage');
        expect(steps[1].content).toBe('Another valid line');
    });

    it('8. detects file truncation or rotation and resets offset cleanly', async () => {
        const { transcriptPath } = await createConvDir(ideBrainDir, 'conv-rotation');

        // Write 3 lines
        let initialData = '';
        for (let i = 0; i < 3; i++) {
            initialData += JSON.stringify({ step_index: i, content: `Line ${i}` }) + '\n';
        }
        await fs.promises.writeFile(transcriptPath, initialData, 'utf8');

        await service.selectConversation('conv-rotation');
        expect(service.getSteps()).toHaveLength(3);
        const originalOffset = service.byteOffset;

        let resetDetected = false;
        service.on('steps:reset', (payload) => {
            if (payload.conversationId === 'conv-rotation') resetDetected = true;
        });

        // Rotate: write shorter file (simulating log rotation / clear)
        const shortData = JSON.stringify({ step_index: 0, content: 'Fresh start after rotation' }) + '\n';
        expect(shortData.length).toBeLessThan(originalOffset);
        await fs.promises.writeFile(transcriptPath, shortData, 'utf8');

        const newSteps = await service.pollActiveTranscript();
        expect(resetDetected).toBe(true);
        expect(newSteps).toHaveLength(1);
        expect(newSteps[0].content).toBe('Fresh start after rotation');
        expect(service.getSteps()).toHaveLength(1);
    });

    it('9. emits action_required when a step needs user input or tool approval', async () => {
        const { transcriptPath } = await createConvDir(ideBrainDir, 'conv-actions');

        /** @type {any[]} */
        const actions = [];
        service.on('action_required', (step) => actions.push(step));

        // 1. WAITING_FOR_USER
        const stepWaiting = JSON.stringify({
            step_index: 0,
            type: 'USER_FEEDBACK',
            status: 'WAITING_FOR_USER',
            content: 'Please confirm plan'
        }) + '\n';

        // 2. Tool call asking question
        const stepTool = JSON.stringify({
            step_index: 1,
            type: 'PLANNER_RESPONSE',
            status: 'RUNNING',
            content: 'Asking question',
            tool_calls: [{ name: 'ask_question', status: 'PENDING_APPROVAL' }]
        }) + '\n';

        await fs.promises.writeFile(transcriptPath, stepWaiting + stepTool, 'utf8');
        await service.selectConversation('conv-actions');

        expect(actions).toHaveLength(2);
        expect(actions[0].status).toBe('WAITING_FOR_USER');
        expect(actions[1].tool_calls[0].name).toBe('ask_question');
    });

    it('10. emits task_completed when planner finishes with DONE and no pending tools', async () => {
        const { transcriptPath } = await createConvDir(ideBrainDir, 'conv-complete');

        /** @type {any[]} */
        const completed = [];
        service.on('task_completed', (step) => completed.push(step));

        const stepDone = JSON.stringify({
            step_index: 0,
            type: 'PLANNER_RESPONSE',
            status: 'DONE',
            content: 'Task successfully finished!',
            tool_calls: []
        }) + '\n';

        await fs.promises.writeFile(transcriptPath, stepDone, 'utf8');
        await service.selectConversation('conv-complete');

        expect(completed).toHaveLength(1);
        expect(completed[0].content).toBe('Task successfully finished!');
    });

    it('11. start, stop, and dispose manage polling timer cleanly', async () => {
        const { transcriptPath } = await createConvDir(ideBrainDir, 'conv-timer');
        await fs.promises.writeFile(transcriptPath, '{"step_index":0,"content":"hello"}\n', 'utf8');

        service.start();
        expect(service.pollTimer).not.toBeNull();

        // Calling start again does not create duplicate timers
        const timer1 = service.pollTimer;
        service.start();
        expect(service.pollTimer).toBe(timer1);

        service.stop();
        expect(service.pollTimer).toBeNull();

        service.dispose();
        expect(service.getActiveConversationId()).toBeNull();
        expect(service.getSteps()).toEqual([]);
    });

    it('12. normalizeStep handles object content, images, thinking_process, and single tool_call', () => {
        const raw = {
            step_index: 5,
            source: 'MODEL',
            type: 'PLANNER_RESPONSE',
            status: 'DONE',
            content: { result: 'structured data' },
            thinking_process: 'deep thoughts',
            tool_call: { name: 'run_cmd' },
            images: ['img1.png']
        };

        const step = service.normalizeStep(raw);
        expect(step.step_index).toBe(5);
        expect(step.content).toContain('"result": "structured data"');
        expect(step.thinking).toBe('deep thoughts');
        expect(step.tool_calls).toEqual([{ name: 'run_cmd' }]);
        expect(step.media).toEqual(['img1.png']);
    });

    it('13. selectConversation with unknown ID sets path to null and returns empty steps', async () => {
        const steps = await service.selectConversation('conv-nonexistent');
        expect(steps).toEqual([]);
        expect(service.activeTranscriptPath).toBeNull();
    });

    it('14. resolveFromFullTranscript scans step_index when line numbers do not align', async () => {
        const { transcriptPath, fullTranscriptPath } = await createConvDir(ideBrainDir, 'conv-scan');

        const compactRecord = {
            step_index: 42,
            content: 'short',
            is_truncated: true
        };

        // Full transcript has unrelated line 1, and matching step_index at line 2
        const fullLines = [
            JSON.stringify({ step_index: 0, content: 'other' }),
            JSON.stringify({ step_index: 42, content: 'full content for step 42' })
        ].join('\n') + '\n';

        await fs.promises.writeFile(transcriptPath, JSON.stringify(compactRecord) + '\n', 'utf8');
        await fs.promises.writeFile(fullTranscriptPath, fullLines, 'utf8');

        // Force resolution from lineIndex 99 (misaligned)
        service.activeFullTranscriptPath = fullTranscriptPath;
        const resolved = await service.resolveFromFullTranscript(compactRecord, 99);
        expect(resolved.content).toBe('full content for step 42');
    });

    it('15. pollActiveTranscript auto-detects recent conversation if none is active', async () => {
        const conv = await createConvDir(ideBrainDir, 'conv-autodetect');
        await fs.promises.writeFile(conv.transcriptPath, '{"step_index":0,"content":"auto"}\n', 'utf8');

        expect(service.getActiveConversationId()).toBeNull();
        const steps = await service.pollActiveTranscript();
        expect(steps).toHaveLength(1);
        expect(service.getActiveConversationId()).toBe('conv-autodetect');
    });

    it('16. interval polling tick and error handler branch coverage', async () => {
        const { transcriptPath } = await createConvDir(ideBrainDir, 'conv-tick');
        await fs.promises.writeFile(transcriptPath, '{"step_index":0,"content":"tick"}\n', 'utf8');

        await service.selectConversation('conv-tick');

        // Append a line
        await fs.promises.appendFile(transcriptPath, '{"step_index":1,"content":"tock"}\n', 'utf8');

        service.start();
        // Wait for interval tick
        await new Promise((r) => setTimeout(r, 70));
        service.stop();

        expect(service.getSteps()).toHaveLength(2);

        // Test error branch via spy
        let caughtError = null;
        service.on('error', (err) => {
            caughtError = err;
        });

        // Append line so poll has something to read
        await fs.promises.appendFile(transcriptPath, '{"step_index":2,"content":"third"}\n', 'utf8');
        const openSpy = vi.spyOn(fs.promises, 'open').mockRejectedValueOnce(new Error('Simulated read failure'));

        await service.pollActiveTranscript();
        expect(caughtError).not.toBeNull();
        expect(caughtError.message).toBe('Simulated read failure');
        openSpy.mockRestore();
    });
});
