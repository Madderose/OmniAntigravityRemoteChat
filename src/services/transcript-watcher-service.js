// @ts-check
/**
 * Autonomous Conversation Transcript Watcher Service — Zero-CDP O(1) Tailer.
 *
 * Monitors Antigravity conversation transcripts across brain directories
 * (`~/.gemini/antigravity-ide/brain/<conv-id>/.system_generated/logs/transcript.jsonl`
 * and `~/.gemini/antigravity-cli/brain/<conv-id>/.system_generated/logs/transcript.jsonl`)
 * using byte-offset tracking, UTF-8 boundary-safe StringDecoder decoding, line-split buffering,
 * and automatic truncation resolution via sibling `transcript_full.jsonl`.
 *
 * Follows SOLID principles: pure EventEmitter, constructor dependency injection, zero direct
 * state mutations, and resource cleanup via dispose().
 *
 * @module services/transcript-watcher-service
 */

import { EventEmitter } from 'events';
import fs from 'fs';
import { join } from 'path';
import { StringDecoder } from 'string_decoder';
import { TRANSCRIPT_BRAIN_DIRS, TRANSCRIPT_POLL_MS } from '../config.js';

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

export class TranscriptWatcherService extends EventEmitter {
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
        this.pollMs = typeof options.pollMs === 'number' && options.pollMs > 0
            ? options.pollMs
            : TRANSCRIPT_POLL_MS;

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
     * Currently monitored conversation ID.
     * @returns {string | null}
     */
    get currentConversationId() {
        return this.activeConversationId;
    }

    /**
     * Currently active brain directory.
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
     * Asynchronously scan configured brain directories for conversations.
     *
     * @param {{ limit?: number }} [options]
     * @returns {Promise<ConversationSummary[]>}
     */
    async listConversations({ limit = 30 } = {}) {
        return this.discoverConversations({ limit });
    }

    /**
     * Detect the most recently modified conversation across all brain directories.
     *
     * @returns {Promise<string | null>}
     */
    async detectMostRecentConversation() {
        const conversations = await this.listConversations({ limit: 1 });
        return conversations.length > 0 ? conversations[0].id : null;
    }

    /**
     * Locate paths for a given conversation ID across brain directories.
     *
     * @param {string} conversationId
     * @returns {{ brainDir: string, transcriptPath: string, fullTranscriptPath: string } | null}
     */
    findConversationPaths(conversationId) {
        if (!conversationId) return null;
        for (const brainDir of this.brainDirs) {
            const logsDir = join(brainDir, conversationId, '.system_generated', 'logs');
            const transcriptPath = join(logsDir, 'transcript.jsonl');
            const fullTranscriptPath = join(logsDir, 'transcript_full.jsonl');
            try {
                if (fs.existsSync(transcriptPath)) {
                    return { brainDir, transcriptPath, fullTranscriptPath };
                }
            } catch {
                // Ignore filesystem access check errors
            }
        }
        return null;
    }

    /**
     * Select and switch to a conversation. Resets offsets and immediately reads initial steps.
     *
     * @param {string} conversationId
     * @returns {Promise<TranscriptStep[]>}
     */
    async selectConversation(conversationId) {
        if (!conversationId) {
            this.activeConversationId = null;
            this.activeBrainDir = null;
            this.activeTranscriptPath = null;
            this.activeFullTranscriptPath = null;
            this.byteOffset = 0;
            this.lineNumber = 0;
            this.partialLine = '';
            this.steps = [];
            this.emit('steps:reset', { conversationId: null });
            return [];
        }

        const paths = this.findConversationPaths(conversationId);
        this.activeConversationId = conversationId;
        this.activeBrainDir = paths ? paths.brainDir : (this.brainDirs[0] || null);
        this.activeTranscriptPath = paths ? paths.transcriptPath : null;
        this.activeFullTranscriptPath = paths ? paths.fullTranscriptPath : null;

        this.byteOffset = 0;
        this.lineNumber = 0;
        this.partialLine = '';
        this.decoder = new StringDecoder('utf8');
        this.steps = [];

        this.emit('conversation:changed', {
            id: this.activeConversationId,
            brainDir: this.activeBrainDir,
            transcriptPath: this.activeTranscriptPath
        });

        if (this.activeTranscriptPath) {
            return this.pollActiveTranscript();
        }
        return [];
    }

    /**
     * Synchronous alias for selectConversation (without awaiting poll).
     *
     * @param {string} conversationId
     */
    setConversation(conversationId) {
        void this.selectConversation(conversationId);
    }

    /**
     * Normalize raw JSON parsed from transcript into a uniform TranscriptStep structure.
     *
     * @param {any} raw
     * @param {number} fallbackIndex
     * @returns {TranscriptStep}
     */
    normalizeStep(raw, fallbackIndex = 0) {
        const stepIndex = typeof raw?.step_index === 'number' ? raw.step_index : fallbackIndex;
        const source = String(raw?.source || 'SYSTEM');
        const type = String(raw?.type || 'UNKNOWN');
        const status = String(raw?.status || 'DONE');
        const createdAt = raw?.timestamp || raw?.created_at || new Date().toISOString();

        let content = '';
        if (typeof raw?.content === 'string') {
            content = raw.content;
        } else if (raw?.content && typeof raw.content === 'object') {
            try {
                content = JSON.stringify(raw.content, null, 2);
            } catch {
                content = String(raw.content);
            }
        }

        let thinking = '';
        if (typeof raw?.thinking === 'string') {
            thinking = raw.thinking;
        } else if (raw?.thinking_process && typeof raw.thinking_process === 'string') {
            thinking = raw.thinking_process;
        }

        /** @type {Array<any>} */
        let toolCalls = [];
        if (Array.isArray(raw?.tool_calls)) {
            toolCalls = raw.tool_calls;
        } else if (raw?.tool_call) {
            toolCalls = [raw.tool_call];
        }

        /** @type {Array<any>} */
        let media = [];
        if (Array.isArray(raw?.media)) {
            media = raw.media;
        } else if (Array.isArray(raw?.images)) {
            media = raw.images;
        }

        const isTruncated = Boolean(raw?.is_truncated);
        const truncatedFields = Array.isArray(raw?.truncated_fields) ? raw.truncated_fields : [];

        return {
            step_index: stepIndex,
            source,
            type,
            status,
            created_at: createdAt,
            content,
            thinking,
            tool_calls: toolCalls,
            media,
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
     * Incrementally read newly appended bytes from the active `transcript.jsonl` in O(1).
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

            const targetPath = this.activeTranscriptPath;
            if (!targetPath) return [];

            let stat;
            try {
                stat = await fs.promises.stat(targetPath);
            } catch {
                return [];
            }

            // Check if disposed or path changed while awaiting stat
            if (!this.activeTranscriptPath || this.activeTranscriptPath !== targetPath) {
                return [];
            }

            // Handle file truncation / replacement / rotation
            if (stat.size < this.byteOffset) {
                this.byteOffset = 0;
                this.lineNumber = 0;
                this.partialLine = '';
                this.decoder = new StringDecoder('utf8');
                this.steps = [];
                this.emit('steps:reset', { conversationId: this.activeConversationId });
            }

            if (stat.size === this.byteOffset) {
                return [];
            }

            const bytesToRead = stat.size - this.byteOffset;
            const buffer = Buffer.alloc(bytesToRead);

            let fh;
            let bytesRead = 0;
            try {
                fh = await fs.promises.open(targetPath, 'r');
                const readResult = await fh.read(buffer, 0, bytesToRead, this.byteOffset);
                bytesRead = readResult.bytesRead;
            } finally {
                if (fh) {
                    try {
                        await fh.close();
                    } catch {
                        // Ignore handle close error
                    }
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
                    // Skip corrupt or incomplete JSON lines safely
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
        } catch (err) {
            if (this.listenerCount('error') > 0) {
                this.emit('error', err);
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
     * Clean up all watchers and intervals.
     */
    dispose() {
        this.stop();
        this.steps = [];
        this.partialLine = '';
        this.activeConversationId = null;
        this.activeBrainDir = null;
        this.activeTranscriptPath = null;
        this.activeFullTranscriptPath = null;
        this.byteOffset = 0;
        this.lineNumber = 0;
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

/** Default singleton instance for app-wide use */
export const transcriptWatcherService = new TranscriptWatcherService();
export default transcriptWatcherService;
