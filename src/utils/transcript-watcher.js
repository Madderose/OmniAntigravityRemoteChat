// @ts-check
/**
 * Live Conversation Transcript Watcher — stateful incremental JSONL tailer.
 *
 * Monitors Antigravity conversation transcripts across brain directories
 * (`~/.gemini/antigravity-ide/brain/<conv-id>/.system_generated/logs/transcript.jsonl`
 * and `~/.gemini/antigravity-cli/brain/<conv-id>/.system_generated/logs/transcript.jsonl`)
 * using byte-offset tracking, UTF-8 boundary-safe StringDecoder decoding, line-split buffering,
 * and automatic truncation resolution via sibling `transcript_full.jsonl`.
 *
 * @module utils/transcript-watcher
 */

import { EventEmitter } from 'events';
import fs from 'fs';
import { join } from 'path';
import { StringDecoder } from 'string_decoder';
import { TRANSCRIPT_BRAIN_DIRS, TRANSCRIPT_POLL_MS } from '../config.js';
import { setActiveConversationId } from '../state.js';

/**
 * @typedef {Object} TranscriptStep
 * @property {number} step_index
 * @property {string} source
 * @property {string} type
 * @property {string} status
 * @property {string} created_at
 * @property {string} content
 * @property {string} thinking
 * @property {Array<any>} tool_calls
 * @property {Array<any>} media
 * @property {boolean} is_truncated
 * @property {Array<string>} truncated_fields
 */

/**
 * @typedef {Object} ConversationSummary
 * @property {string} id
 * @property {string} brainDir
 * @property {string} transcriptPath
 * @property {string} fullTranscriptPath
 * @property {number} mtimeMs
 * @property {number} sizeBytes
 */

export class TranscriptWatcher extends EventEmitter {
    /**
     * @param {Object} [options]
     * @param {string[]} [options.brainDirs]
     * @param {number} [options.pollMs]
     */
    constructor(options = {}) {
        super();
        /** @type {string[]} */
        this.brainDirs = Array.isArray(options.brainDirs) && options.brainDirs.length > 0
            ? options.brainDirs
            : [...TRANSCRIPT_BRAIN_DIRS];
        /** @type {number} */
        this.pollMs = options.pollMs ?? TRANSCRIPT_POLL_MS;

        /** @type {string | null} */
        this.activeConversationId = null;
        /** @type {string | null} */
        this.activeBrainDir = null;
        /** @type {string | null} */
        this.activeTranscriptPath = null;
        /** @type {string | null} */
        this.activeFullTranscriptPath = null;

        /** @type {number} */
        this.byteOffset = 0;
        /** @type {number} */
        this.lineNumber = 0;
        /** @type {string} */
        this.partialLine = '';
        /** @type {StringDecoder} */
        this.decoder = new StringDecoder('utf8');

        /** @type {TranscriptStep[]} */
        this.steps = [];
        /** @type {NodeJS.Timeout | null} */
        this.pollTimer = null;
        /** @type {boolean} */
        this.isPolling = false;
    }

    /**
     * @returns {string | null}
     */
    get currentConversationId() {
        return this.activeConversationId;
    }

    /**
     * @returns {string | null}
     */
    get currentBrainDir() {
        return this.activeBrainDir || this.brainDirs[0] || null;
    }

    /**
     * Synchronously scan configured brain directories for conversations.
     *
     * @param {{ limit?: number }} [options]
     * @returns {ConversationSummary[]}
     */
    discoverConversations({ limit = 30 } = {}) {
        /** @type {Map<string, ConversationSummary>} */
        const found = new Map();

        for (const brainDir of this.brainDirs) {
            if (!brainDir) continue;
            let entries;
            try {
                entries = fs.readdirSync(brainDir, { withFileTypes: true });
            } catch {
                continue;
            }

            for (const entry of entries) {
                if (!entry.isDirectory()) continue;
                const convId = entry.name;
                const logsDir = join(brainDir, convId, '.system_generated', 'logs');
                const transcriptPath = join(logsDir, 'transcript.jsonl');
                const fullTranscriptPath = join(logsDir, 'transcript_full.jsonl');

                try {
                    const stat = fs.statSync(transcriptPath);
                    if (!stat.isFile()) continue;

                    const existing = found.get(convId);
                    if (!existing || stat.mtimeMs > existing.mtimeMs) {
                        found.set(convId, {
                            id: convId,
                            brainDir,
                            transcriptPath,
                            fullTranscriptPath,
                            mtimeMs: stat.mtimeMs,
                            sizeBytes: stat.size
                        });
                    }
                } catch {
                    // Conversation folder does not have a readable transcript.jsonl yet
                }
            }
        }

        const sorted = Array.from(found.values()).sort((a, b) => b.mtimeMs - a.mtimeMs);
        return limit > 0 ? sorted.slice(0, limit) : sorted;
    }

    /**
     * Synchronously select a conversation by ID and prime its transcript.
     *
     * @param {string} conversationId
     * @returns {boolean}
     */
    setConversation(conversationId) {
        if (!conversationId) return false;

        /** @type {ConversationSummary | null} */
        let target = null;

        for (const brainDir of this.brainDirs) {
            if (!brainDir) continue;
            const logsDir = join(brainDir, conversationId, '.system_generated', 'logs');
            const transcriptPath = join(logsDir, 'transcript.jsonl');
            const fullTranscriptPath = join(logsDir, 'transcript_full.jsonl');
            try {
                const stat = fs.statSync(transcriptPath);
                if (stat.isFile()) {
                    if (!target || stat.mtimeMs > target.mtimeMs) {
                        target = {
                            id: conversationId,
                            brainDir,
                            transcriptPath,
                            fullTranscriptPath,
                            mtimeMs: stat.mtimeMs,
                            sizeBytes: stat.size
                        };
                    }
                }
            } catch {
                // Not in this brainDir
            }
        }

        if (!target) {
            return false;
        }

        this.activeConversationId = conversationId;
        this.activeBrainDir = target.brainDir;
        setActiveConversationId(conversationId);
        this.byteOffset = 0;
        this.lineNumber = 0;
        this.partialLine = '';
        this.decoder = new StringDecoder('utf8');
        this.steps = [];
        this.activeTranscriptPath = target.transcriptPath;
        this.activeFullTranscriptPath = target.fullTranscriptPath;

        this.pollActiveTranscript().catch(() => {});
        return true;
    }

    /**
     * Scan configured brain directories for conversations containing `.system_generated/logs/transcript.jsonl`.
     * Returns conversations sorted by most recently modified (`mtimeMs` descending).
     *
     * @param {{ limit?: number }} [options]
     * @returns {Promise<ConversationSummary[]>}
     */
    async listConversations({ limit = 30 } = {}) {
        /** @type {Map<string, ConversationSummary>} */
        const found = new Map();

        for (const brainDir of this.brainDirs) {
            if (!brainDir) continue;
            let entries;
            try {
                entries = await fs.promises.readdir(brainDir, { withFileTypes: true });
            } catch {
                continue;
            }

            for (const entry of entries) {
                if (!entry.isDirectory()) continue;
                const convId = entry.name;
                const logsDir = join(brainDir, convId, '.system_generated', 'logs');
                const transcriptPath = join(logsDir, 'transcript.jsonl');
                const fullTranscriptPath = join(logsDir, 'transcript_full.jsonl');

                try {
                    const stat = await fs.promises.stat(transcriptPath);
                    if (!stat.isFile()) continue;

                    const existing = found.get(convId);
                    if (!existing || stat.mtimeMs > existing.mtimeMs) {
                        found.set(convId, {
                            id: convId,
                            brainDir,
                            transcriptPath,
                            fullTranscriptPath,
                            mtimeMs: stat.mtimeMs,
                            sizeBytes: stat.size
                        });
                    }
                } catch {
                    // Conversation folder does not have a readable transcript.jsonl yet
                }
            }
        }

        const sorted = Array.from(found.values()).sort((a, b) => b.mtimeMs - a.mtimeMs);
        return limit > 0 ? sorted.slice(0, limit) : sorted;
    }

    /**
     * Returns the conversation ID with the newest `mtimeMs`, or `null` if none exist.
     *
     * @returns {Promise<string | null>}
     */
    async detectMostRecentConversation() {
        const conversations = await this.listConversations({ limit: 1 });
        return conversations.length > 0 ? conversations[0].id : null;
    }

    /**
     * Select a conversation by ID, reset tailing cursors, and immediately read its transcript.
     *
     * @param {string} conversationId
     * @returns {Promise<boolean>}
     */
    async selectConversation(conversationId) {
        if (!conversationId) return false;

        /** @type {ConversationSummary | null} */
        let target = null;

        // Check across configured brainDirs for this specific conversation ID
        for (const brainDir of this.brainDirs) {
            if (!brainDir) continue;
            const logsDir = join(brainDir, conversationId, '.system_generated', 'logs');
            const transcriptPath = join(logsDir, 'transcript.jsonl');
            const fullTranscriptPath = join(logsDir, 'transcript_full.jsonl');
            try {
                const stat = await fs.promises.stat(transcriptPath);
                if (stat.isFile()) {
                    if (!target || stat.mtimeMs > target.mtimeMs) {
                        target = {
                            id: conversationId,
                            brainDir,
                            transcriptPath,
                            fullTranscriptPath,
                            mtimeMs: stat.mtimeMs,
                            sizeBytes: stat.size
                        };
                    }
                }
            } catch {
                // Not in this brainDir
            }
        }

        this.activeConversationId = conversationId;
        setActiveConversationId(conversationId);
        this.byteOffset = 0;
        this.lineNumber = 0;
        this.partialLine = '';
        this.decoder = new StringDecoder('utf8');
        this.steps = [];

        if (target) {
            this.activeBrainDir = target.brainDir;
            this.activeTranscriptPath = target.transcriptPath;
            this.activeFullTranscriptPath = target.fullTranscriptPath;
            await this.pollActiveTranscript();
            return true;
        } else {
            // Set default expected path in primary brainDir so future writes can be picked up
            const primaryBrain = this.brainDirs[0] || '';
            this.activeBrainDir = primaryBrain || null;
            const logsDir = join(primaryBrain, conversationId, '.system_generated', 'logs');
            this.activeTranscriptPath = join(logsDir, 'transcript.jsonl');
            this.activeFullTranscriptPath = join(logsDir, 'transcript_full.jsonl');
            return false;
        }
    }

    /**
     * Normalize a raw JSONL step record into a clean `TranscriptStep`.
     *
     * @param {any} record
     * @param {number} fallbackIndex
     * @returns {TranscriptStep}
     */
    normalizeStep(record, fallbackIndex) {
        const truncatedFields = Array.isArray(record?.truncated_fields)
            ? record.truncated_fields
            : [];
        const isTruncated = Boolean(record?.is_truncated === true || truncatedFields.length > 0);

        return {
            step_index: typeof record?.step_index === 'number' ? record.step_index : fallbackIndex,
            source: typeof record?.source === 'string' ? record.source : 'UNKNOWN',
            type: typeof record?.type === 'string' ? record.type : 'UNKNOWN',
            status: typeof record?.status === 'string' ? record.status : 'DONE',
            created_at: typeof record?.created_at === 'string' ? record.created_at : new Date().toISOString(),
            content: (() => {
                let text = typeof record?.content === 'string'
                    ? record.content
                    : (record?.content != null ? JSON.stringify(record.content) : '');
                const isUser = record?.type === 'USER_INPUT' || record?.source === 'USER' || record?.source === 'USER_EXPLICIT';
                if (isUser && typeof text === 'string') {
                    const match = text.match(/<USER_REQUEST>([\s\S]*?)<\/USER_REQUEST>/i);
                    if (match) {
                        text = match[1].trim();
                    }
                }
                return text;
            })(),
            thinking: typeof record?.thinking === 'string' ? record.thinking : '',
            tool_calls: Array.isArray(record?.tool_calls) ? record.tool_calls : [],
            media: Array.isArray(record?.media) ? record.media : [],
            is_truncated: isTruncated,
            truncated_fields: truncatedFields
        };
    }

    /**
     * Resolve a truncated record from sibling `transcript_full.jsonl` by matching `step_index` or 1-based line number.
     *
     * @param {any} truncatedRecord
     * @param {number} lineIndex1Based
     * @returns {Promise<any>}
     */
    async resolveFromFullTranscript(truncatedRecord, lineIndex1Based) {
        if (!this.activeFullTranscriptPath) return truncatedRecord;
        try {
            const raw = await fs.promises.readFile(this.activeFullTranscriptPath, 'utf8');
            const lines = raw.split(/\r?\n/).filter((l) => l.trim().length > 0);

            // 1. Try direct line index match first (1-based)
            if (lineIndex1Based >= 1 && lineIndex1Based <= lines.length) {
                try {
                    const candidate = JSON.parse(lines[lineIndex1Based - 1]);
                    if (
                        truncatedRecord.step_index === undefined ||
                        candidate.step_index === truncatedRecord.step_index
                    ) {
                        return candidate;
                    }
                } catch {
                    // Fall through to step_index scan
                }
            }

            // 2. Fallback: scan lines for matching step_index
            if (typeof truncatedRecord.step_index === 'number') {
                for (const line of lines) {
                    try {
                        const parsed = JSON.parse(line);
                        if (parsed.step_index === truncatedRecord.step_index) {
                            return parsed;
                        }
                    } catch {
                        // Ignore malformed line
                    }
                }
            }
        } catch {
            // Sibling transcript_full.jsonl missing or unreadable; return original record
        }
        return truncatedRecord;
    }

    /**
     * Incrementally read newly appended bytes from the active `transcript.jsonl`.
     *
     * @returns {Promise<TranscriptStep[]>} Newly parsed steps from this poll cycle
     */
    async pollActiveTranscript() {
        if (this.isPolling) return [];
        this.isPolling = true;

        /** @type {TranscriptStep[]} */
        const newSteps = [];

        try {
            if (!this.activeConversationId) {
                const recentId = await this.detectMostRecentConversation();
                if (recentId) {
                    this.isPolling = false;
                    await this.selectConversation(recentId);
                    return this.steps;
                }
                return [];
            }

            if (!this.activeTranscriptPath) return [];

            let stat;
            try {
                stat = await fs.promises.stat(this.activeTranscriptPath);
            } catch {
                return [];
            }

            // Handle file truncation / replacement
            if (stat.size < this.byteOffset) {
                this.byteOffset = 0;
                this.lineNumber = 0;
                this.partialLine = '';
                this.decoder = new StringDecoder('utf8');
                this.steps = [];
            }

            if (stat.size === this.byteOffset) {
                return [];
            }

            const bytesToRead = stat.size - this.byteOffset;
            const buffer = Buffer.alloc(bytesToRead);

            let fh;
            let bytesRead = 0;
            try {
                fh = await fs.promises.open(this.activeTranscriptPath, 'r');
                const readResult = await fh.read(buffer, 0, bytesToRead, this.byteOffset);
                bytesRead = readResult.bytesRead;
            } finally {
                if (fh) {
                    await fh.close();
                }
            }

            if (bytesRead <= 0) {
                return [];
            }

            this.byteOffset += bytesRead;
            const chunkText = this.decoder.write(buffer.subarray(0, bytesRead));
            const combined = this.partialLine + chunkText;
            const lines = combined.split(/\r?\n/);

            // The last element is either '' (if chunk ended with \n) or an incomplete partial line
            this.partialLine = lines.pop() ?? '';

            for (const rawLine of lines) {
                const trimmed = rawLine.trim();
                if (!trimmed) continue;

                this.lineNumber += 1;
                let parsed;
                try {
                    parsed = JSON.parse(trimmed);
                } catch {
                    continue;
                }

                const needsFullResolution =
                    parsed?.is_truncated === true ||
                    (Array.isArray(parsed?.truncated_fields) && parsed.truncated_fields.length > 0);

                if (needsFullResolution) {
                    const resolved = await this.resolveFromFullTranscript(parsed, this.lineNumber);
                    if (resolved && resolved !== parsed) {
                        parsed = resolved;
                    }
                }

                const step = this.normalizeStep(parsed, this.lineNumber - 1);
                this.steps.push(step);
                newSteps.push(step);

                this.emit('step', step, this.activeConversationId);

                // Emit higher-level lifecycle notifications for Telegram & UI hooks
                this.inspectAndEmitStepEvents(step);
            }
        } finally {
            this.isPolling = false;
        }

        return newSteps;
    }

    /**
     * Inspect a normalized step and emit `'task_completed'` or `'action_required'` when appropriate.
     *
     * @param {TranscriptStep} step
     */
    inspectAndEmitStepEvents(step) {
        const hasPendingToolApproval = step.tool_calls.some(
            (tc) =>
                tc?.status === 'WAITING_FOR_CONFIRMATION' ||
                tc?.status === 'PENDING_APPROVAL' ||
                tc?.requires_approval === true ||
                tc?.name === 'ask_question'
        );

        if (
            step.status === 'WAITING_FOR_USER' ||
            step.status === 'WAITING_FOR_INPUT' ||
            step.type === 'ACTION_REQUIRED' ||
            hasPendingToolApproval
        ) {
            this.emit('action_required', step, this.activeConversationId);
            return;
        }

        if (
            step.type === 'PLANNER_RESPONSE' &&
            step.status === 'DONE' &&
            step.tool_calls.length === 0 &&
            step.content.trim().length > 0
        ) {
            this.emit('task_completed', step, this.activeConversationId);
        }
    }

    /**
     * Start periodic polling of the active conversation transcript.
     */
    start() {
        if (!this.activeConversationId) {
            const recent = this.discoverConversations({ limit: 1 });
            if (recent.length > 0) {
                this.setConversation(recent[0].id);
            }
        }
        if (this.pollTimer) return;
        this.pollTimer = setInterval(() => {
            this.pollActiveTranscript().catch(() => {});
        }, this.pollMs);
        if (typeof this.pollTimer.unref === 'function') {
            this.pollTimer.unref();
        }
    }

    /**
     * Stop periodic polling.
     */
    stop() {
        if (this.pollTimer) {
            clearInterval(this.pollTimer);
            this.pollTimer = null;
        }
    }

    /**
     * @returns {string | null}
     */
    getActiveConversationId() {
        return this.activeConversationId;
    }

    /**
     * @returns {TranscriptStep[]}
     */
    getSteps() {
        return [...this.steps];
    }

    /**
     * Return the most recent `limit` steps from the active conversation.
     *
     * @param {number} [limit=50]
     * @returns {TranscriptStep[]}
     */
    getRecentSteps(limit = 50) {
        const safeLimit = Number(limit) > 0 ? Number(limit) : 50;
        return this.steps.slice(-safeLimit);
    }
}

export const transcriptWatcher = new TranscriptWatcher();
export default transcriptWatcher;
