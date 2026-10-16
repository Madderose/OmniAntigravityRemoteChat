// @ts-check
import { EventEmitter } from 'events';
import { describe, expect, it, vi } from 'vitest';
import { PassThrough } from 'stream';
import { AgyBridgeService } from '../../src/services/agy-bridge-service.js';
import { ExecutionEngine } from '../../src/services/execution-engine.js';

/**
 * Mock Child Process creating stdout/stderr streams
 */
function createMockChildProcess(pid = 12345) {
    const proc = new EventEmitter();
    // @ts-ignore
    proc.pid = pid;
    // @ts-ignore
    proc.stdout = new PassThrough();
    // @ts-ignore
    proc.stderr = new PassThrough();
    // @ts-ignore
    proc.kill = vi.fn((sig) => {
        proc.emit('close', 0, sig || 'SIGTERM');
        return true;
    });
    return proc;
}

describe('ExecutionEngine & AgyBridgeService (SOLID OCP)', () => {
    it('1. ExecutionEngine enforces abstract method implementation', async () => {
        const base = new ExecutionEngine('test-base');
        expect(base.engineName).toBe('test-base');
        expect(base.getHealthStatus()).toEqual({ healthy: true, engine: 'test-base' });
        expect(base.getStatus().status).toBe('idle');

        // @ts-ignore
        await expect(base.sendMessage({})).rejects.toThrow('sendMessage() is not implemented');
        await expect(base.stopExecution()).rejects.toThrow('stopExecution() is not implemented');
        expect(() => base.setModelAndEffort('foo')).toThrow('setModelAndEffort() is not implemented');
    });

    it('2. AgyBridgeService inherits from ExecutionEngine and initializes defaults', () => {
        const bridge = new AgyBridgeService({
            binaryPath: 'mock-agy.exe',
            workspaceDir: 'C:/test/workspace',
            defaultModel: 'gemini-4-argon-high',
            defaultEffort: 'max'
        });

        expect(bridge).toBeInstanceOf(ExecutionEngine);
        expect(bridge.engineName).toBe('agy-cli-bridge');

        const status = bridge.getStatus();
        expect(status.status).toBe('idle');
        expect(status.currentModel).toBe('gemini-4-argon-high');
        expect(status.currentEffort).toBe('max');
        expect(status.workspaceDir).toBe('C:/test/workspace');
        expect(status.hasActiveProcess).toBe(false);

        const models = bridge.getModels();
        expect(models.length).toBeGreaterThan(0);
        expect(models.some((m) => m.id === 'gemini-4-argon-high')).toBe(true);
    });

    it('3. setModelAndEffort updates state and emits model:changed', () => {
        const bridge = new AgyBridgeService();

        let emitted = null;
        bridge.on('model:changed', (payload) => {
            emitted = payload;
        });

        const ok = bridge.setModelAndEffort('claude-5-5-sonnet', 'low');
        expect(ok).toBe(true);
        expect(bridge.currentModel).toBe('claude-5-5-sonnet');
        expect(bridge.currentEffort).toBe('low');
        expect(emitted).toEqual({ model: 'claude-5-5-sonnet', effort: 'low' });

        // Reject invalid modelId
        expect(bridge.setModelAndEffort('')).toBe(false);
    });

    it('4. buildSpawnArgs constructs arguments safely without shell injection', () => {
        const bridge = new AgyBridgeService({
            defaultModel: 'gemini-4-argon-medium',
            defaultEffort: 'medium'
        });

        const args = bridge.buildSpawnArgs({
            prompt: 'Say "hello" & rm -rf /',
            model: 'gemini-3.8-flash-high',
            effort: 'high',
            conversationId: 'conv-123'
        });

        expect(args).toEqual([
            '-p',
            'Say "hello" & rm -rf /',
            '--model',
            'gemini-3.8-flash-high',
            '--effort',
            'high',
            '--conversation-id',
            'conv-123'
        ]);
    });

    it('5. sendMessage spawns child process with shell: false and streams events', async () => {
        const mockChild = createMockChildProcess(9999);
        let spawnParams = null;

        const mockSpawn = vi.fn((bin, args, opts) => {
            spawnParams = { bin, args, opts };
            return mockChild;
        });

        const bridge = new AgyBridgeService({
            binaryPath: 'agy',
            // @ts-ignore
            spawnFn: mockSpawn
        });

        /** @type {any[]} */
        const jsonEvents = [];
        /** @type {any[]} */
        const textEvents = [];
        /** @type {any[]} */
        const actionRequiredEvents = [];

        bridge.on('agy:json', (data) => jsonEvents.push(data));
        bridge.on('agy:text', (text) => textEvents.push(text));
        bridge.on('action_required', (action) => actionRequiredEvents.push(action));

        const res = await bridge.sendMessage({
            prompt: 'Analyze repository',
            model: 'gemini-4-argon-high',
            effort: 'high'
        });

        expect(res).toEqual({ status: 'started', pid: 9999 });
        expect(spawnParams.opts.shell).toBe(false);
        expect(bridge.status).toBe('running');

        // Stream JSON output chunk
        const stepRecord = {
            step_index: 0,
            status: 'WAITING_FOR_USER',
            tool_name: 'ask_confirmation',
            args: { question: 'Proceed?' }
        };
        mockChild.stdout.write(JSON.stringify(stepRecord) + '\n');

        // Stream raw text output chunk
        mockChild.stdout.write('Plain information line from CLI\n');

        // Stream stderr chunk
        let stderrData = '';
        bridge.on('agy:stderr', (err) => {
            stderrData += err;
        });
        mockChild.stderr.write('Diagnostic warning\n');

        expect(jsonEvents).toHaveLength(1);
        expect(jsonEvents[0].step_index).toBe(0);
        expect(textEvents).toContain('Plain information line from CLI');
        expect(actionRequiredEvents).toHaveLength(1);
        expect(bridge.status).toBe('waiting_approval');
        expect(bridge.pendingApproval.toolName).toBe('ask_confirmation');
        expect(stderrData).toBe('Diagnostic warning');

        // Close child process
        let exitData = null;
        bridge.on('agy:exit', (data) => {
            exitData = data;
        });
        mockChild.emit('close', 0, null);

        expect(bridge.status).toBe('idle');
        expect(bridge.activeProcess).toBeNull();
        expect(exitData).toEqual({ code: 0, signal: null });
    });

    it('6. stopExecution invokes killTreeFn and resets activeProcess', async () => {
        const mockChild = createMockChildProcess(7777);
        let killedPid = null;

        const killTreeFn = vi.fn(async (pid) => {
            killedPid = pid;
            mockChild.emit('close', 1, 'SIGKILL');
        });

        const bridge = new AgyBridgeService({
            // @ts-ignore
            spawnFn: () => mockChild,
            killTreeFn
        });

        await bridge.sendMessage({ prompt: 'Long running task' });
        expect(bridge.status).toBe('running');

        const stopped = await bridge.stopExecution();
        expect(stopped).toBe(true);
        expect(killTreeFn).toHaveBeenCalledWith(7777);
        expect(killedPid).toBe(7777);
        expect(bridge.activeProcess).toBeNull();
        expect(bridge.status).toBe('stopped');
    });

    it('7. sendMessage rejects empty prompt and handles spawn failure gracefully', async () => {
        const bridge = new AgyBridgeService({
            spawnFn: () => {
                throw new Error('Binary not found ENOENT');
            }
        });

        // @ts-ignore
        await expect(bridge.sendMessage({ prompt: '' })).rejects.toThrow('non-empty prompt string');

        let caughtError = null;
        bridge.on('agy:error', (err) => {
            caughtError = err;
        });

        await expect(bridge.sendMessage({ prompt: 'test' })).rejects.toThrow('Binary not found ENOENT');
        expect(bridge.status).toBe('error');
        expect(caughtError).not.toBeNull();
    });

    it('8. getHealthStatus checks if binary path exists', () => {
        const bridge = new AgyBridgeService({
            binaryPath: 'nonexistent-path-1234.exe'
        });

        const health = bridge.getHealthStatus();
        expect(health.healthy).toBe(false);
        expect(health.engine).toBe('agy-cli-bridge');

        const bridgeNode = new AgyBridgeService({
            binaryPath: process.execPath
        });
        const healthNode = bridgeNode.getHealthStatus();
        expect(healthNode.healthy).toBe(true);
    });

    it('9. stopExecution without activeProcess returns true immediately', async () => {
        const bridge = new AgyBridgeService();
        const stopped = await bridge.stopExecution();
        expect(stopped).toBe(true);
        expect(bridge.status).toBe('idle');
    });

    it('10. stopExecution uses default process kill when killTreeFn is not supplied', async () => {
        const mockChild = createMockChildProcess(8888);
        const bridge = new AgyBridgeService({
            // @ts-ignore
            spawnFn: () => mockChild
        });

        await bridge.sendMessage({ prompt: 'Test task' });
        const stopped = await bridge.stopExecution();
        expect(stopped).toBe(true);
        expect(bridge.activeProcess).toBeNull();
    });

    it('11. dispose cleans up listeners and stops execution', () => {
        const bridge = new AgyBridgeService();
        bridge.on('test-event', () => {});
        expect(bridge.listenerCount('test-event')).toBe(1);

        bridge.dispose();
        expect(bridge.listenerCount('test-event')).toBe(0);
    });
});
