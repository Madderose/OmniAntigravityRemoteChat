// @ts-check
/**
 * Formal Execution Engine Base Contract (SOLID Open/Closed Principle).
 *
 * Defines the common abstract interface for all execution backends
 * (e.g. CDP browser bridge, headless agy CLI, remote runner).
 *
 * @module services/execution-engine
 */

import { EventEmitter } from 'events';

/**
 * @typedef {Object} EngineStatus
 * @property {'idle' | 'running' | 'waiting_approval' | 'error' | 'stopped'} status
 * @property {string | null} sessionId
 * @property {string} currentModel
 * @property {'low' | 'medium' | 'high' | 'max'} currentEffort
 * @property {string} workspaceDir
 * @property {boolean} hasActiveProcess
 * @property {any} [metadata]
 */

/**
 * @typedef {Object} SendMessageOptions
 * @property {string} prompt
 * @property {string} [model]
 * @property {'low' | 'medium' | 'high' | 'max'} [effort]
 * @property {string} [conversationId]
 * @property {Array<any>} [media]
 */

export class ExecutionEngine extends EventEmitter {
    /**
     * @param {string} engineName
     */
    constructor(engineName = 'generic-engine') {
        super();
        this.engineName = engineName;
    }

    /**
     * Send a prompt or message payload to the execution backend.
     *
     * @param {SendMessageOptions} _options
     * @returns {Promise<any>}
     */
    async sendMessage(_options) {
        throw new Error(`[${this.engineName}] sendMessage() is not implemented.`);
    }

    /**
     * Terminate or cancel current active execution.
     *
     * @param {string} [_targetId]
     * @returns {Promise<boolean>}
     */
    async stopExecution(_targetId) {
        throw new Error(`[${this.engineName}] stopExecution() is not implemented.`);
    }

    /**
     * Configure active model and reasoning effort.
     *
     * @param {string} _modelId
     * @param {'low' | 'medium' | 'high' | 'max'} [_effortLevel]
     * @returns {Promise<boolean> | boolean}
     */
    setModelAndEffort(_modelId, _effortLevel) {
        throw new Error(`[${this.engineName}] setModelAndEffort() is not implemented.`);
    }

    /**
     * Get real-time health and connection status.
     *
     * @returns {Promise<{ healthy: boolean, details?: any }> | { healthy: boolean, details?: any }}
     */
    getHealthStatus() {
        return { healthy: true, engine: this.engineName };
    }

    /**
     * Return structured status snapshot.
     *
     * @returns {EngineStatus}
     */
    getStatus() {
        return {
            status: 'idle',
            sessionId: null,
            currentModel: 'default',
            currentEffort: 'high',
            workspaceDir: process.cwd(),
            hasActiveProcess: false
        };
    }

    /**
     * Clean up resources, watchers, child processes, or connections.
     */
    dispose() {
        this.removeAllListeners();
    }
}

export default ExecutionEngine;
