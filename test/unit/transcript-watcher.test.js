import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fs from 'fs';
import os from 'os';
import { join } from 'path';
import { TranscriptWatcher } from '../../src/utils/transcript-watcher.js';

describe('TranscriptWatcher', () => {
    /** @type {string} */
    let tempRoot;
    /** @type {string} */
    let ideBrainDir;
    /** @type {string} */
    let cliBrainDir;
    /** @type {TranscriptWatcher} */
    let watcher;

    beforeEach(async () => {
        tempRoot = await fs.promises.mkdtemp(join(os.tmpdir(), 'omni-tw-test-'));
        ideBrainDir = join(tempRoot, 'ide-brain');
        cliBrainDir = join(tempRoot, 'cli-brain');
        await fs.promises.mkdir(ideBrainDir, { recursive: true });
        await fs.promises.mkdir(cliBrainDir, { recursive: true });

        watcher = new TranscriptWatcher({
            brainDirs: [ideBrainDir, cliBrainDir],
            pollMs: 100
        });
    });

    afterEach(async () => {
        watcher.stop();
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

    it('1. listConversations() correctly sorts conversations by mtimeMs descending across brainDirs', async () => {
        const convOld = await createConvDir(ideBrainDir, 'conv-oldest');
        const convMid = await createConvDir(cliBrainDir, 'conv-middle');
        const convNew = await createConvDir(ideBrainDir, 'conv-newest');

        await fs.promises.writeFile(convOld.transcriptPath, '{"step_index":0,"type":"USER_INPUT","content":"Old"}\n', 'utf8');
        await fs.promises.writeFile(convMid.transcriptPath, '{"step_index":0,"type":"USER_INPUT","content":"Mid"}\n', 'utf8');
        await fs.promises.writeFile(convNew.transcriptPath, '{"step_index":0,"type":"USER_INPUT","content":"New"}\n', 'utf8');

        const baseTime = Date.now() / 1000;
        await fs.promises.utimes(convOld.transcriptPath, baseTime - 300, baseTime - 300);
        await fs.promises.utimes(convMid.transcriptPath, baseTime - 150, baseTime - 150);
        await fs.promises.utimes(convNew.transcriptPath, baseTime - 10, baseTime - 10);

        const list = await watcher.listConversations({ limit: 10 });
        expect(list.map((c) => c.id)).toEqual(['conv-newest', 'conv-middle', 'conv-oldest']);

        const mostRecent = await watcher.detectMostRecentConversation();
        expect(mostRecent).toBe('conv-newest');
    });

    it('2. incremental byte-offset tailing reads new lines without re-reading previous lines', async () => {
        const { transcriptPath } = await createConvDir(ideBrainDir, 'conv-tail');

        const step0 = JSON.stringify({
            step_index: 0,
            source: 'USER_EXPLICIT',
            type: 'USER_INPUT',
            status: 'DONE',
            content: 'First user prompt'
        }) + '\n';

        await fs.promises.writeFile(transcriptPath, step0, 'utf8');

        const emittedSteps = [];
        watcher.on('step', (step) => emittedSteps.push(step));

        await watcher.selectConversation('conv-tail');
        expect(emittedSteps).toHaveLength(1);
        expect(emittedSteps[0].content).toBe('First user prompt');
        const firstOffset = watcher.byteOffset;
        expect(firstOffset).toBeGreaterThan(0);

        // Polling with no changes should not emit anything
        const noopSteps = await watcher.pollActiveTranscript();
        expect(noopSteps).toHaveLength(0);
        expect(emittedSteps).toHaveLength(1);

        // Append second line
        const step1 = JSON.stringify({
            step_index: 1,
            source: 'MODEL',
            type: 'PLANNER_RESPONSE',
            status: 'DONE',
            content: 'Second model response',
            thinking: 'Brief thought'
        }) + '\n';

        await fs.promises.appendFile(transcriptPath, step1, 'utf8');

        const deltaSteps = await watcher.pollActiveTranscript();
        expect(deltaSteps).toHaveLength(1);
        expect(deltaSteps[0].step_index).toBe(1);
        expect(deltaSteps[0].content).toBe('Second model response');
        expect(emittedSteps).toHaveLength(2);
        expect(watcher.getSteps()).toHaveLength(2);
    });

    it('3. split line buffer handles a JSON line split across two file writes', async () => {
        const { transcriptPath } = await createConvDir(ideBrainDir, 'conv-split');

        const fullLine = JSON.stringify({
            step_index: 0,
            source: 'MODEL',
            type: 'PLANNER_RESPONSE',
            status: 'DONE',
            content: 'Split across two separate disk writes!'
        });

        const halfIndex = Math.floor(fullLine.length / 2);
        const firstHalf = fullLine.slice(0, halfIndex);
        const secondHalf = fullLine.slice(halfIndex) + '\n';

        // Write first half (no newline)
        await fs.promises.writeFile(transcriptPath, firstHalf, 'utf8');
        await watcher.selectConversation('conv-split');

        // Incomplete line should be buffered in partialLine, not emitted yet
        expect(watcher.getSteps()).toHaveLength(0);
        expect(watcher.partialLine).toBe(firstHalf);

        // Write second half with newline
        await fs.promises.appendFile(transcriptPath, secondHalf, 'utf8');
        const newlyParsed = await watcher.pollActiveTranscript();

        expect(newlyParsed).toHaveLength(1);
        expect(newlyParsed[0].content).toBe('Split across two separate disk writes!');
        expect(watcher.partialLine).toBe('');
        expect(watcher.getSteps()).toHaveLength(1);
    });

    it('4. falls back to transcript_full.jsonl when is_truncated: true or truncated_fields is non-empty', async () => {
        const { transcriptPath, fullTranscriptPath } = await createConvDir(ideBrainDir, 'conv-trunc');

        const compactRecord = {
            step_index: 0,
            source: 'MODEL',
            type: 'PLANNER_RESPONSE',
            status: 'DONE',
            content: 'Truncated content...',
            thinking: 'Short...',
            is_truncated: true,
            truncated_fields: ['content', 'thinking']
        };

        const fullRecord = {
            step_index: 0,
            source: 'MODEL',
            type: 'PLANNER_RESPONSE',
            status: 'DONE',
            content: 'Complete un-truncated content from transcript_full.jsonl!',
            thinking: 'Complete full chain of thought reasoning from transcript_full.jsonl!'
        };

        await fs.promises.writeFile(fullTranscriptPath, JSON.stringify(fullRecord) + '\n', 'utf8');
        await fs.promises.writeFile(transcriptPath, JSON.stringify(compactRecord) + '\n', 'utf8');

        await watcher.selectConversation('conv-trunc');
        const steps = watcher.getSteps();

        expect(steps).toHaveLength(1);
        expect(steps[0].content).toBe('Complete un-truncated content from transcript_full.jsonl!');
        expect(steps[0].thinking).toBe('Complete full chain of thought reasoning from transcript_full.jsonl!');
        expect(steps[0].is_truncated).toBe(false);
    });

    it('5. resets byteOffset and steps when the transcript file is truncated', async () => {
        const { transcriptPath } = await createConvDir(ideBrainDir, 'conv-reset');

        const initialData =
            JSON.stringify({ step_index: 0, type: 'USER_INPUT', content: 'Long initial line 1' }) + '\n' +
            JSON.stringify({ step_index: 1, type: 'PLANNER_RESPONSE', content: 'Long initial line 2 with extra characters' }) + '\n';

        await fs.promises.writeFile(transcriptPath, initialData, 'utf8');
        await watcher.selectConversation('conv-reset');

        expect(watcher.getSteps()).toHaveLength(2);
        const oldOffset = watcher.byteOffset;
        expect(oldOffset).toBeGreaterThan(50);

        // Overwrite file with a shorter single-line transcript (simulating file truncation/reset)
        const shorterData = JSON.stringify({ step_index: 0, type: 'USER_INPUT', content: 'Short' }) + '\n';
        await fs.promises.writeFile(transcriptPath, shorterData, 'utf8');

        const stepsAfterReset = await watcher.pollActiveTranscript();
        expect(stepsAfterReset).toHaveLength(1);
        expect(watcher.getSteps()).toHaveLength(1);
        expect(watcher.getSteps()[0].content).toBe('Short');
        expect(watcher.byteOffset).toBe(Buffer.byteLength(shorterData, 'utf8'));
    });
});
