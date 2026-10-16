// @ts-check
/**
 * Headless `agy` CLI Execution Engine Bridge (SOLID OCP Implementation).
 *
 * Spawns and manages Antigravity CLI subprocesses without a shell
 * (`shell: false`), tracks streaming NDJSON stdout/stderr, and supports
 * safe process-tree termination across Windows and POSIX platforms.
 *
 * @module services/agy-bridge-service
 */

import { spawn } from 'child_process';
import fs from 'fs';
import { StringDecoder } from 'string_decoder';
import {
    AGY_CLI_PATH,
    DEFAULT_AGY_MODEL,
    DEFAULT_REASONING_EFFORT,
    ANTIGRAVITY_MODELS,
    getModelMetadata,
    isValidReasoningEffort,
    WORKSPACE_ROOT
} from '../config.js';
import { ExecutionEngine } from './execution-engine.js';

/**
 * @typedef {Object} PendingApproval
 * @property {string} toolCallId
 * @property {string} toolName
 * @property {Record<string, any>} args
 * @property {string} timestamp
 */

/**
 * @typedef {import('./execution-engine.js').SendMessageOptions} SendMessageOptions
 * @typedef {import('./execution-engine.js').EngineStatus} EngineStatus
 */

export class AgyBridgeService extends ExecutionEngine {
    /**
     * @param {Object} [options]
     * @param {string} [options.binaryPath]
     * @param {string} [options.workspaceDir]
     * @param {string} [options.defaultModel]
     * @param {'low' | 'medium' | 'high' | 'max'} [options.defaultEffort]
     * @param {typeof spawn} [options.spawnFn]
     * @param {(pid: number) => Promise<void> | void} [options.killTreeFn]
     */
    constructor(options = {}) {
        super('agy-cli-bridge');

        /** @type {string} */
        this.binaryPath = options.binaryPath || AGY_CLI_PATH;
        /** @type {string} */
        this.workspaceDir = options.workspaceDir || WORKSPACE_ROOT;
        /** @type {string} */
        this.currentModel = options.defaultModel || DEFAULT_AGY_MODEL;
        /** @type {'low' | 'medium' | 'high' | 'max'} */
        this.currentEffort = options.defaultEffort || DEFAULT_REASONING_EFFORT;

        /** @type {import('child_process').ChildProcessWithoutNullStreams | import('child_process').ChildProcess | null} */
        this.activeProcess = null;
        /** @type {string | null} */
        this.sessionId = null;
        /** @type {'idle' | 'running' | 'waiting_approval' | 'error' | 'stopped'} */
        this.status = 'idle';
        /** @type {PendingApproval | null} */
        this.pendingApproval = null;
        /** @type {number} */
        this.stepCounter = 0;

        /** @type {typeof spawn} */
        this._spawn = options.spawnFn || spawn;
        /** @type {((pid: number) => Promise<void> | void) | null} */
        this._killTreeFn = options.killTreeFn || null;

        /** @type {StringDecoder} */
        this.stdoutDecoder = new StringDecoder('utf8');
        /** @type {string} */
        this.partialStdout = '';
        /** @type {StringDecoder} */
        this.stderrDecoder = new StringDecoder('utf8');
        /** @type {string} */
        this.partialStderr = '';
    }

    /**
     * Return all supported Antigravity models.
     * @returns {typeof ANTIGRAVITY_MODELS}
     */
    getModels() {
        return ANTIGRAVITY_MODELS;
    }

    /**
     * Get engine status snapshot.
     * @returns {EngineStatus}
     */
    getStatus() {
        return {
            status: this.status,
            sessionId: this.sessionId,
            currentModel: this.currentModel,
            currentEffort: this.currentEffort,
            workspaceDir: this.workspaceDir,
            hasActiveProcess: Boolean(this.activeProcess),
            metadata: {
                binaryPath: this.binaryPath,
                pendingApproval: this.pendingApproval,
                stepCounter: this.stepCounter
            }
        };
    }

    /**
     * Verify CLI binary existence and accessibility.
     * @returns {Promise<{ healthy: boolean, details?: any }> | { healthy: boolean, details?: any }}
     */
    getHealthStatus() {
        try {
            const exists = fs.existsSync(this.binaryPath);
            return {
                healthy: exists,
                engine: this.engineName,
                details: {
                    binaryPath: this.binaryPath,
                    exists,
                    status: this.status
                }
            };
        } catch (err) {
            return {
                healthy: false,
                engine: this.engineName,
                details: { error: String(err) }
            };
        }
    }

    /**
     * Configure active model and reasoning effort.
     *
     * @param {string} modelId
     * @param {'low' | 'medium' | 'high' | 'max'} [effortLevel]
     * @returns {boolean}
     */
    setModelAndEffort(modelId, effortLevel) {
        if (!modelId) return false;
        const meta = getModelMetadata(modelId);
        this.currentModel = meta ? meta.id : modelId;

        if (effortLevel && isValidReasoningEffort(effortLevel)) {
            this.currentEffort = effortLevel;
        } else if (meta && meta.defaultEffort) {
            this.currentEffort = meta.defaultEffort;
        }

        this.emit('model:changed', {
            model: this.currentModel,
            effort: this.currentEffort
        });
        return true;
    }

    /**
     * Build CLI command-line arguments safely as an array (NEVER a concatenated shell string).
     *
     * @param {SendMessageOptions} options
     * @returns {string[]}
     */
    buildSpawnArgs(options) {
        const args = ['-p', options.prompt];

        const model = options.model || this.currentModel;
        if (model) {
            args.push('--model', model);
        }

        const effort = options.effort || this.currentEffort;
        if (effort && isValidReasoningEffort(effort)) {
            args.push('--effort', effort);
        }

        if (options.conversationId) {
            args.push('--conversation-id', options.conversationId);
        }

        return args;
    }

    /**
     * Send a prompt to the headless `agy` CLI process.
     *
     * @param {SendMessageOptions} options
     * @returns {Promise<{ status: string, pid?: number }>}
     */
    async sendMessage(options) {
        if (!options || !options.prompt || typeof options.prompt !== 'string') {
            throw new Error('A non-empty prompt string is required.');
        }

        // If a process is already active, stop it before launching new task
        if (this.activeProcess) {
            await this.stopExecution();
        }

        if (options.model) {
            this.setModelAndEffort(options.model, options.effort);
        } else if (options.effort) {
            this.setModelAndEffort(this.currentModel, options.effort);
        }

        const spawnArgs = this.buildSpawnArgs(options);
        this.status = 'running';
        this.stepCounter = 0;
        this.pendingApproval = null;
        this.partialStdout = '';
        this.partialStderr = '';
        this.stdoutDecoder = new StringDecoder('utf8');
        this.stderrDecoder = new StringDecoder('utf8');

        this.emit('agy:start', {
            prompt: options.prompt,
            model: this.currentModel,
            effort: this.currentEffort,
            args: spawnArgs
        });

        try {
            /** @type {any} */
            const child = this._spawn(this.binaryPath, spawnArgs, {
                cwd: this.workspaceDir,
                shell: false,
                env: {
                    ...process.env,
                    PAGER: 'cat'
                }
            });

            this.activeProcess = child;

            if (child.stdout) {
                child.stdout.on('data', (chunk) => this.handleStdoutChunk(chunk));
            }
            if (child.stderr) {
                child.stderr.on('data', (chunk) => this.handleStderrChunk(chunk));
            }

            child.on('error', (err) => {
                this.status = 'error';
                this.emit('agy:error', err);
            });

            child.on('close', (code, signal) => {
                this.activeProcess = null;
                this.status = code === 0 ? 'idle' : (this.status === 'stopped' ? 'stopped' : 'error');
                this.emit('agy:exit', { code, signal });
                this.emit('task_completed', {
                    type: 'CLI_EXIT',
                    code,
                    signal
                });
            });

            return {
                status: 'started',
                pid: child.pid
            };
        } catch (err) {
            this.activeProcess = null;
            this.status = 'error';
            this.emit('agy:error', err);
            throw err;
        }
    }

    /**
     * Process raw stdout chunks and extract stream lines.
     *
     * @param {Buffer} chunk
     */
    handleStdoutChunk(chunk) {
        const text = this.stdoutDecoder.write(chunk);
        const combined = this.partialStdout + text;
        const lines = combined.split(/\r?\n/);
        this.partialStdout = lines.pop() ?? '';

        for (const rawLine of lines) {
            const trimmed = rawLine.trim();
            if (!trimmed) continue;

            this.stepCounter += 1;
            let parsed = null;
            try {
                parsed = JSON.parse(trimmed);
            } catch {
                // Not JSON, treat as raw text chunk
            }

            if (parsed) {
                this.emit('agy:json', parsed);
                this.emit('chunk', { type: 'json', data: parsed });

                // Detect approval requirements from stream
                if (
                    parsed.status === 'WAITING_FOR_USER' ||
                    parsed.status === 'PENDING_APPROVAL' ||
                    parsed.type === 'ACTION_REQUIRED'
                ) {
                    this.status = 'waiting_approval';
                    this.pendingApproval = {
                        toolCallId: parsed.tool_call_id || parsed.id || `tool-${this.stepCounter}`,
                        toolName: parsed.tool_name || 'action',
                        args: parsed.args || {},
                        timestamp: new Date().toISOString()
                    };
                    this.emit('action_required', parsed);
                }
            } else {
                this.emit('agy:text', trimmed);
                this.emit('chunk', { type: 'text', data: trimmed });
            }
        }
    }

    /**
     * Process raw stderr chunks.
     *
     * @param {Buffer} chunk
     */
    handleStderrChunk(chunk) {
        const text = this.stderrDecoder.write(chunk);
        const combined = this.partialStderr + text;
        const lines = combined.split(/\r?\n/);
        this.partialStderr = lines.pop() ?? '';

        for (const rawLine of lines) {
            const trimmed = rawLine.trim();
            if (!trimmed) continue;
            this.emit('agy:stderr', trimmed);
        }
    }

    /**
     * Terminate the active child process and its process tree cleanly.
     *
     * @param {string} [_targetId]
     * @returns {Promise<boolean>}
     */
    async stopExecution(_targetId) {
        if (!this.activeProcess) {
            this.status = 'idle';
            return true;
        }

        const proc = this.activeProcess;
        this.status = 'stopped';
        const pid = proc.pid;

        if (this._killTreeFn && typeof pid === 'number') {
            try {
                await this._killTreeFn(pid);
            } catch {
                // Fall back to standard kill
            }
        } else if (process.platform === 'win32' && typeof pid === 'number') {
            try {
                await new Promise((resolve) => {
                    const killer = spawn('taskkill', ['/pid', String(pid), '/T', '/F'], {
                        shell: false,
                        windowsHide: true
                    });
                    killer.on('close', () => resolve(true));
                    killer.on('error', () => resolve(false));
                });
            } catch {
                try {
                    proc.kill();
                } catch {
                    // Ignore kill error
                }
            }
        } else {
            try {
                proc.kill('SIGTERM');
            } catch {
                try {
                    proc.kill('SIGKILL');
                } catch {
                    // Ignore kill error
                }
            }
        }

        this.activeProcess = null;
        this.emit('agy:stopped', { pid });
        return true;
    }

    /**
     * Clean up all state and stop active processes.
     */
    dispose() {
        void this.stopExecution();
        super.dispose();
    }
}

/** Default singleton instance */
export const agyBridgeService = new AgyBridgeService();
export default agyBridgeService;
