// @ts-check
/**
 * Headless `agy` CLI Bridge — spawns and manages Antigravity CLI subprocesses
 * using bidirectional NDJSON (`--input-format stream-json --output-format stream-json`)
 * or single-turn `--print` mode.
 *
 * @module utils/agy-bridge
 */

import { EventEmitter } from 'events';
import { spawn } from 'child_process';
import { StringDecoder } from 'string_decoder';
import {
    AGY_CLI_PATH,
    DEFAULT_AGY_MODEL,
    DEFAULT_REASONING_EFFORT,
    ANTIGRAVITY_MODELS,
    getModelMetadata,
    isValidReasoningEffort,
    WORKSPACE_ROOT,
    getAgySkipPermissions
} from '../config.js';

/**
 * @typedef {import('./transcript-watcher.js').TranscriptStep} TranscriptStep
 */

/**
 * @typedef {Object} PendingApproval
 * @property {string} toolCallId
 * @property {string} toolName
 * @property {Record<string, any>} args
 * @property {string} timestamp
 */

/**
 * Safely resolves model and reasoning effort to prevent CLI argument conflicts in agy.exe.
 * agy.exe encodes effort tiers in model names (e.g. gemini-4-argon-medium) and rejects conflicting flags.
 *
 * @param {string} [requestedModel]
 * @param {string} [requestedEffort]
 * @param {string} [defaultModel]
 * @returns {{ model: string, effort: 'low' | 'medium' | 'high' | 'max', supportsEffort: boolean }}
 */
export function resolveModelAndEffort(requestedModel, requestedEffort, defaultModel = DEFAULT_AGY_MODEL) {
    let model = requestedModel || defaultModel;
    const meta = getModelMetadata(model);
    if (meta) {
        model = meta.id;
    }

    const suffixMatch = model.match(/-(low|medium|high|max)$/i);
    const inherentEffort = suffixMatch
        ? /** @type {'low' | 'medium' | 'high' | 'max'} */ (suffixMatch[1].toLowerCase())
        : (meta?.defaultEffort || null);

    let effort;
    if (requestedEffort && isValidReasoningEffort(requestedEffort)) {
        effort = /** @type {'low' | 'medium' | 'high' | 'max'} */ (requestedEffort.trim().toLowerCase());
        if (suffixMatch && effort !== inherentEffort) {
            const baseName = model.slice(0, suffixMatch.index);
            const candidateModel = `${baseName}-${effort}`;
            if (getModelMetadata(candidateModel)) {
                model = candidateModel;
            } else if (effort === 'max') {
                const highCandidate = `${baseName}-high`;
                if (getModelMetadata(highCandidate)) {
                    model = highCandidate;
                    effort = 'high';
                }
            }
        }
    } else {
        effort = inherentEffort || meta?.defaultEffort || DEFAULT_REASONING_EFFORT;
    }

    // Guard against agy.exe CLI conflicts: if the model ID has a tier suffix,
    // agy.exe strictly rejects a non-matching --effort flag. Ensure effort aligns with model suffix.
    const finalSuffix = model.match(/-(low|medium|high|max)$/i);
    if (finalSuffix && effort !== finalSuffix[1].toLowerCase()) {
        effort = /** @type {'low' | 'medium' | 'high' | 'max'} */ (finalSuffix[1].toLowerCase());
    }

    const supportsEffort = meta ? meta.supportsEffort !== false : true;
    return { model, effort, supportsEffort };
}

export class AgyBridge extends EventEmitter {
    /**
     * @param {Object} [options]
     * @param {string} [options.binaryPath]
     * @param {string} [options.workspaceDir]
     * @param {string} [options.defaultModel]
     * @param {'low' | 'medium' | 'high' | 'max'} [options.defaultEffort]
     * @param {boolean} [options.skipPermissions]
     * @param {typeof spawn} [options.spawnFn]
     */
    constructor(options = {}) {
        super();
        /** @type {string} */
        this.binaryPath = options.binaryPath || AGY_CLI_PATH;
        /** @type {import('child_process').ChildProcessWithoutNullStreams | import('child_process').ChildProcess | null} */
        this.activeProcess = null;
        /** @type {string | null} */
        this.sessionId = null;
        /** @type {'idle' | 'running' | 'waiting_approval' | 'error'} */
        this.status = 'idle';
        /** @type {string} */
        this.currentModel = options.defaultModel || DEFAULT_AGY_MODEL;
        /** @type {'low' | 'medium' | 'high' | 'max'} */
        this.currentEffort = options.defaultEffort || DEFAULT_REASONING_EFFORT;
        /** @type {string} */
        this.activeModel = '';
        /** @type {'low' | 'medium' | 'high' | 'max' | ''} */
        this.activeEffort = '';
        /** @type {string} */
        this.workspaceDir = options.workspaceDir || WORKSPACE_ROOT;
        /** @type {boolean} */
        this.skipPermissions = options.skipPermissions !== undefined ? options.skipPermissions : getAgySkipPermissions();
        /** @type {PendingApproval | null} */
        this.pendingApproval = null;
        /** @type {number} */
        this.stepCounter = 0;
        /** @type {StringDecoder} */
        this.stdoutDecoder = new StringDecoder('utf8');
        /** @type {string} */
        this.partialLine = '';
        /** @type {string} */
        this.lastPromptText = '';
        /** @type {string} */
        this._accumulatedText = '';
        /** @type {string} */
        this._accumulatedThought = '';
        /** @type {typeof spawn} */
        this._spawn = options.spawnFn || spawn;
    }

    /**
     * Getter for active child process (compat with server.js)
     */
    get childProcess() {
        return this.activeProcess;
    }

    /**
     * Set active model and terminate running process if model changed to ensure clean respawn.
     * @param {string} modelName
     */
    setModel(modelName) {
        const { model, effort } = resolveModelAndEffort(modelName, this.currentEffort, this.currentModel);
        const changed = model !== this.currentModel;
        this.currentModel = model;
        this.currentEffort = effort;
        if (changed && this.activeProcess) {
            this.abort();
        }
        return { model, effort, changed };
    }

    /**
     * Set active reasoning effort and terminate running process if effort/model changed.
     * @param {'low' | 'medium' | 'high' | 'max' | string} effort
     */
    setEffort(effort) {
        const { model, effort: resolvedEffort } = resolveModelAndEffort(this.currentModel, effort, this.currentModel);
        const changed = resolvedEffort !== this.currentEffort || model !== this.currentModel;
        this.currentModel = model;
        this.currentEffort = resolvedEffort;
        if (changed && this.activeProcess) {
            this.abort();
        }
        return { model, effort: resolvedEffort, changed };
    }

    /**
     * Return all supported Antigravity 2.0 models.
     * @returns {typeof ANTIGRAVITY_MODELS}
     */
    getModels() {
        return ANTIGRAVITY_MODELS;
    }

    /**
     * Return current bridge status and session metadata.
     */
    getStatus() {
        return {
            status: this.status,
            sessionId: this.sessionId,
            currentModel: this.currentModel,
            currentEffort: this.currentEffort,
            workspaceDir: this.workspaceDir,
            hasActiveProcess: Boolean(this.activeProcess),
            pendingApproval: this.pendingApproval
        };
    }

    /**
     * Send a prompt to the headless `agy` CLI process.
     *
     * @param {Object} options
     * @param {string} options.prompt
     * @param {string} [options.model]
     * @param {string} [options.effort]
     * @param {string} [options.addDir]
     * @param {string} [options.workspaceDir]
     * @param {'stream-json' | 'print'} [options.mode='stream-json']
     */
    prompt(options) {
        const promptText = typeof options?.prompt === 'string' ? options.prompt.trim() : '';
        if (!promptText) {
            throw new Error('Prompt must be a non-empty string');
        }

        const mode = options?.mode === 'print' ? 'print' : 'stream-json';

        const { model: resolvedModel, effort: resolvedEffort, supportsEffort } = resolveModelAndEffort(
            options?.model,
            options?.effort,
            this.currentModel || DEFAULT_AGY_MODEL
        );

        const resolvedDir = options?.workspaceDir || options?.addDir || this.workspaceDir || WORKSPACE_ROOT;

        this.currentModel = resolvedModel;
        this.currentEffort = resolvedEffort;
        this.workspaceDir = resolvedDir;
        this.lastPromptText = promptText;
        this._accumulatedText = '';
        this._accumulatedThought = '';

        if (mode === 'stream-json') {
            const payload = JSON.stringify({
                event: 'user',
                message: {
                    content: promptText
                }
            }) + '\n';

            // If active process is running with a different model/effort, terminate it to force respawn
            if (this.activeProcess && (this.activeModel !== resolvedModel || this.activeEffort !== resolvedEffort)) {
                this.abort();
            }

            if (this.activeProcess && this.activeProcess.stdin && this.activeProcess.stdin.writable) {
                this.activeProcess.stdin.write(payload);
                this.status = 'running';
                if (!this.sessionId) {
                    this.sessionId = `agy_${Date.now()}`;
                }
                const startPayload = {
                    sessionId: this.sessionId,
                    model: resolvedModel,
                    effort: resolvedEffort,
                    mode,
                    reusedProcess: true
                };
                this.emit('started', startPayload);
                return startPayload;
            }

            this.activeModel = resolvedModel;
            this.activeEffort = resolvedEffort;

            const args = [
                '--input-format', 'stream-json',
                '--output-format', 'stream-json',
                '--model', resolvedModel
            ];
            if (supportsEffort && resolvedEffort) {
                args.push('--effort', resolvedEffort);
            }
            if (this.skipPermissions) {
                args.push('--dangerously-skip-permissions');
            }
            args.push('--add-dir', resolvedDir);

            const child = this._spawnProcess(args, resolvedDir);
            if (child.stdin && child.stdin.writable) {
                child.stdin.write(payload);
            }
        } else {
            const args = [
                '--print', promptText,
                '--output-format', 'stream-json',
                '--model', resolvedModel
            ];
            if (supportsEffort && resolvedEffort) {
                args.push('--effort', resolvedEffort);
            }
            if (this.skipPermissions) {
                args.push('--dangerously-skip-permissions');
            }
            args.push('--add-dir', resolvedDir);

            this._spawnProcess(args, resolvedDir);
        }

        this.status = 'running';
        this.sessionId = `agy_${Date.now()}`;
        const startInfo = {
            sessionId: this.sessionId,
            model: resolvedModel,
            effort: resolvedEffort,
            mode,
            reusedProcess: false
        };
        this.emit('started', startInfo);
        return startInfo;
    }

    /**
     * Internal helper to spawn the `agy` CLI process and wire stdio/lifecycle handlers.
     *
     * @param {string[]} args
     * @param {string} cwd
     */
    _spawnProcess(args, cwd) {
        this.stdoutDecoder = new StringDecoder('utf8');
        this.partialLine = '';

        const child = this._spawn(this.binaryPath, args, {
            cwd,
            env: { ...process.env, PAGER: 'cat' },
            stdio: ['pipe', 'pipe', 'pipe'],
            windowsHide: true
        });

        this.activeProcess = child;

        if (child.stdout) {
            child.stdout.on('data', (chunk) => {
                this.handleStdoutChunk(chunk);
            });
        }

        if (child.stderr) {
            child.stderr.on('data', (chunk) => {
                const text = Buffer.isBuffer(chunk) ? chunk.toString('utf8') : String(chunk);
                this.emit('stderr', text);
            });
        }

        child.on('error', (err) => {
            this.status = 'error';
            this.emit('process_error', err);
        });

        child.on('close', (code, signal) => {
            if (this.partialLine.trim()) {
                this._processJsonLine(this.partialLine.trim());
                this.partialLine = '';
            }
            if (this.activeProcess === child) {
                this.activeProcess = null;
                this.activeModel = '';
                this.activeEffort = '';
            }
            if (this.status !== 'error') {
                this.status = 'idle';
            }
            this.pendingApproval = null;
            this.emit('closed', { code, signal, sessionId: this.sessionId });
        });

        return child;
    }

    /**
     * Decode and split incoming stdout chunks into NDJSON lines.
     *
     * @param {Buffer | string} chunk
     */
    handleStdoutChunk(chunk) {
        const decoded = Buffer.isBuffer(chunk)
            ? this.stdoutDecoder.write(chunk)
            : String(chunk);
        const combined = this.partialLine + decoded;
        const lines = combined.split(/\r?\n/);
        this.partialLine = lines.pop() ?? '';

        for (const rawLine of lines) {
            const trimmed = rawLine.trim();
            if (!trimmed) continue;
            this._processJsonLine(trimmed);
        }
    }

    /**
     * Parse a single JSON line from stdout, emit stream and step events, and detect tool approval requests.
     *
     * @param {string} line
     */
    _processJsonLine(line) {
        let rawEvent;
        try {
            rawEvent = JSON.parse(line);
        } catch {
            return;
        }

        // Handle native agy CLI event stream (event: "init" | "step_update" | "result")
        if (rawEvent.event) {
            if (rawEvent.conversation_id) {
                this.sessionId = rawEvent.conversation_id;
            }

            if (rawEvent.event === 'init') {
                this.status = 'running';
                this.emit('stream_event', rawEvent);
                return;
            }

            if (rawEvent.event === 'step_update' && rawEvent.step_update) {
                const su = rawEvent.step_update;
                const stepIndex = typeof su.step_index === 'number' ? su.step_index : this.stepCounter++;

                if (su.step_type === 'user_input') {
                    /** @type {TranscriptStep} */
                    const step = {
                        step_index: stepIndex,
                        source: 'USER',
                        type: 'USER_INPUT',
                        status: su.state || 'DONE',
                        created_at: new Date().toISOString(),
                        content: su.content || this.lastPromptText || '',
                        thinking: '',
                        tool_calls: [],
                        media: [],
                        is_truncated: false,
                        truncated_fields: []
                    };
                    this.emit('step', { conversationId: this.sessionId, step });
                    return;
                }

                if (su.step_type === 'tool') {
                    const toolInfo = su.tool_info || {};
                    const stepStatus = su.state === 'ERROR' ? 'ERROR' : (su.state === 'DONE' ? 'DONE' : 'RUNNING');
                    const toolName = su.tool_name || toolInfo.name || 'tool';
                    const toolArgs = toolInfo.parameters || {};
                    const toolOutput = toolInfo.output || (toolInfo.error ? String(toolInfo.error.message || toolInfo.error) : '');

                    /** @type {TranscriptStep} */
                    const step = {
                        step_index: stepIndex,
                        source: 'MODEL',
                        type: 'TOOL_EXECUTION',
                        status: stepStatus,
                        created_at: new Date().toISOString(),
                        content: toolOutput,
                        thinking: '',
                        tool_calls: [{
                            name: toolName,
                            args: toolArgs
                        }],
                        media: [],
                        is_truncated: false,
                        truncated_fields: []
                    };
                    this.emit('stream_event', rawEvent);
                    if (su.state === 'DONE' || su.state === 'ERROR') {
                        this.emit('step', { conversationId: this.sessionId, step });
                    }
                    return;
                }

                // Streaming agent response chunk
                const delta = su.text_delta || '';
                const thought = su.thinking_delta || '';

                if (delta) this._accumulatedText += delta;
                if (thought) this._accumulatedThought += thought;

                // Normalize for stream listeners in frontend
                rawEvent.delta = delta;
                rawEvent.text = delta;
                rawEvent.thought = thought;
                this.emit('stream_event', rawEvent);

                if (su.state === 'DONE') {
                    /** @type {TranscriptStep} */
                    const step = {
                        step_index: stepIndex,
                        source: 'MODEL',
                        type: 'PLANNER_RESPONSE',
                        status: 'DONE',
                        created_at: new Date().toISOString(),
                        content: su.text || this._accumulatedText || delta || '',
                        thinking: su.thinking || this._accumulatedThought || thought || '',
                        tool_calls: Array.isArray(su.tool_calls) ? su.tool_calls : [],
                        media: Array.isArray(su.media) ? su.media : [],
                        is_truncated: false,
                        truncated_fields: []
                    };
                    this.emit('step', { conversationId: this.sessionId, step });
                }
                return;
            }

            if (rawEvent.event === 'result') {
                const res = rawEvent.result || {};
                this.status = 'idle';

                rawEvent.type = 'task_completed';
                this.emit('stream_event', rawEvent);

                const finalContent = res.response || this._accumulatedText || '';
                /** @type {TranscriptStep} */
                const step = {
                    step_index: this.stepCounter++,
                    source: 'MODEL',
                    type: 'PLANNER_RESPONSE',
                    status: res.status === 'SUCCESS' ? 'DONE' : 'ERROR',
                    created_at: new Date().toISOString(),
                    content: finalContent,
                    thinking: this._accumulatedThought || '',
                    tool_calls: [],
                    media: [],
                    is_truncated: false,
                    truncated_fields: []
                };
                this.emit('task_completed', step);
                return;
            }
        }

        // Backward compatibility / mock tests fallback
        this.emit('stream_event', rawEvent);

        const stepIndex = typeof rawEvent.step_index === 'number'
            ? rawEvent.step_index
            : this.stepCounter++;

        /** @type {TranscriptStep} */
        const step = {
            step_index: stepIndex,
            source: typeof rawEvent.source === 'string' ? rawEvent.source : 'MODEL',
            type: typeof rawEvent.type === 'string' ? rawEvent.type : 'PLANNER_RESPONSE',
            status: typeof rawEvent.status === 'string' ? rawEvent.status : 'DONE',
            created_at: typeof rawEvent.created_at === 'string' ? rawEvent.created_at : new Date().toISOString(),
            content: typeof rawEvent.content === 'string'
                ? rawEvent.content
                : (rawEvent.text != null ? String(rawEvent.text) : (rawEvent.content != null ? JSON.stringify(rawEvent.content) : '')),
            thinking: typeof rawEvent.thinking === 'string' ? rawEvent.thinking : '',
            tool_calls: Array.isArray(rawEvent.tool_calls) ? rawEvent.tool_calls : [],
            media: Array.isArray(rawEvent.media) ? rawEvent.media : [],
            is_truncated: false,
            truncated_fields: []
        };

        this.emit('step', { conversationId: this.sessionId, step });

        if (
            rawEvent.type === 'tool_approval_request' ||
            rawEvent.type === 'permission_request' ||
            rawEvent.status === 'WAITING_FOR_APPROVAL'
        ) {
            this.status = 'waiting_approval';
            this.pendingApproval = {
                toolCallId: rawEvent.tool_call_id || rawEvent.id || 'tool_' + Date.now(),
                toolName: rawEvent.name || rawEvent.tool || 'tool',
                args: rawEvent.args || {},
                timestamp: new Date().toISOString()
            };
            this.emit('approval_required', this.pendingApproval);
            return;
        }

        if (
            step.type === 'PLANNER_RESPONSE' &&
            step.status === 'DONE' &&
            step.tool_calls.length === 0 &&
            step.content.trim().length > 0
        ) {
            this.emit('task_completed', step);
        }
    }

    /**
     * Approve or reject a pending tool call over stdin.
     *
     * @param {Object} [options]
     * @param {string} [options.toolCallId]
     * @param {string} [options.callId]
     * @param {boolean} [options.approved=true]
     * @param {string} [options.reason='']
     * @param {string} [options.input='']
     */
    approve({ toolCallId, callId, approved = true, reason = '', input = '' } = {}) {
        const resolvedToolCallId = toolCallId || callId || this.pendingApproval?.toolCallId || '';
        const resolvedReason = reason || input || 'Approved via OmniAntigravity Remote';
        if (this.activeProcess && this.activeProcess.stdin && this.activeProcess.stdin.writable) {
            const payload = JSON.stringify({
                type: 'tool_approval',
                tool_call_id: resolvedToolCallId,
                approved: Boolean(approved),
                reason: resolvedReason
            }) + '\n';
            this.activeProcess.stdin.write(payload);
            this.pendingApproval = null;
            this.status = 'running';
            const result = { success: true, toolCallId: resolvedToolCallId, approved: Boolean(approved) };
            this.emit('approval_resolved', result);
            return result;
        }
        return { success: false, error: 'No active process or stdin not writable' };
    }

    /**
     * Terminate the active `agy` subprocess if running.
     */
    abort() {
        if (this.activeProcess) {
            const proc = this.activeProcess;
            this.activeProcess = null;
            try {
                proc.kill('SIGTERM');
            } catch {
                // Ignore kill error
            }
            if (process.platform === 'win32' && proc.pid) {
                try {
                    const killer = spawn('taskkill', ['/pid', String(proc.pid), '/T', '/F'], {
                        windowsHide: true,
                        stdio: 'ignore'
                    });
                    killer.on('error', () => {});
                } catch {
                    // Ignore taskkill fallback errors
                }
            }
            this.status = 'idle';
            this.pendingApproval = null;
            this.emit('aborted', { sessionId: this.sessionId });
            return { success: true, aborted: true };
        }
        return { success: true, aborted: false };
    }
}

export const agyBridge = new AgyBridge();
export default agyBridge;
