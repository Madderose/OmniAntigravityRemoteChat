import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EventEmitter } from 'events';
import { AgyBridge } from '../../src/utils/agy-bridge.js';
import { ANTIGRAVITY_MODELS } from '../../src/config.js';

/**
 * Helper to create a mock ChildProcess instance with controllable stdin, stdout, stderr.
 */
function createMockChildProcess(pid = 4242) {
    const child = new EventEmitter();
    child.pid = pid;
    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();
    child.stdin = {
        writable: true,
        writes: [],
        write: vi.fn((data) => {
            child.stdin.writes.push(String(data));
            return true;
        })
    };
    child.kill = vi.fn(() => true);
    return child;
}

describe('AgyBridge', () => {
    /** @type {ReturnType<typeof createMockChildProcess>} */
    let mockChild;
    /** @type {ReturnType<typeof vi.fn>} */
    let spawnMock;
    /** @type {AgyBridge} */
    let bridge;

    beforeEach(() => {
        mockChild = createMockChildProcess();
        spawnMock = vi.fn(() => mockChild);
        bridge = new AgyBridge({
            binaryPath: 'C:\\Users\\hoppj\\AppData\\Local\\agy\\bin\\agy.exe',
            workspaceDir: 'C:\\Users\\hoppj\\SynologyDrive\\01_Projets\\OmniAntigravityRemoteChat',
            defaultModel: 'gemini-4-argon-medium',
            defaultEffort: 'medium',
            spawnFn: spawnMock
        });
    });

    it('1. constructs correct CLI arguments for stream-json mode and print mode, and reuses active process on subsequent stream-json prompts', () => {
        const startedEvents = [];
        bridge.on('started', (evt) => startedEvents.push(evt));

        // 1a. Initial stream-json prompt spawns process and writes user_input NDJSON to stdin
        const res1 = bridge.prompt({
            prompt: 'Explain the architecture',
            model: 'gemini-4-argon-high',
            effort: 'high',
            addDir: 'C:\\workspace\\project',
            mode: 'stream-json'
        });

        expect(spawnMock).toHaveBeenCalledTimes(1);
        const [bin1, args1, opts1] = spawnMock.mock.calls[0];
        expect(bin1).toBe('C:\\Users\\hoppj\\AppData\\Local\\agy\\bin\\agy.exe');
        expect(args1).toEqual([
            '--input-format', 'stream-json',
            '--output-format', 'stream-json',
            '--model', 'gemini-4-argon-high',
            '--effort', 'high',
            '--dangerously-skip-permissions',
            '--add-dir', 'C:\\workspace\\project'
        ]);
        expect(opts1.cwd).toBe('C:\\workspace\\project');
        expect(opts1.windowsHide).toBe(true);
        expect(opts1.env.PAGER).toBe('cat');

        expect(mockChild.stdin.writes).toHaveLength(1);
        expect(JSON.parse(mockChild.stdin.writes[0].trim())).toEqual({
            event: 'user',
            message: {
                content: 'Explain the architecture'
            }
        });
        expect(bridge.getStatus().status).toBe('running');
        expect(bridge.getStatus().hasActiveProcess).toBe(true);
        expect(res1.reusedProcess).toBe(false);
        expect(startedEvents).toHaveLength(1);

        // 1b. Second stream-json prompt while process is active writes directly to stdin without re-spawning
        const res2 = bridge.prompt({
            prompt: 'Follow-up question',
            mode: 'stream-json'
        });
        expect(spawnMock).toHaveBeenCalledTimes(1);
        expect(mockChild.stdin.writes).toHaveLength(2);
        expect(JSON.parse(mockChild.stdin.writes[1].trim())).toEqual({
            event: 'user',
            message: {
                content: 'Follow-up question'
            }
        });
        expect(res2.reusedProcess).toBe(true);

        // 1c. Switching model restarts process instead of silently reusing
        const modelSwitchChild = createMockChildProcess(7777);
        spawnMock.mockReturnValueOnce(modelSwitchChild);
        const res3 = bridge.prompt({
            prompt: 'Question for low model',
            model: 'gemini-4-argon-low',
            mode: 'stream-json'
        });
        expect(spawnMock).toHaveBeenCalledTimes(2);
        expect(res3.reusedProcess).toBe(false);
        expect(res3.model).toBe('gemini-4-argon-low');

        // 1d. Print mode spawns with --print <prompt>
        const printChild = createMockChildProcess(5151);
        spawnMock.mockReturnValueOnce(printChild);

        bridge.prompt({
            prompt: 'One-shot summary',
            model: 'claude-sonnet-5-5-high',
            effort: 'max',
            addDir: 'C:\\workspace\\other',
            mode: 'print'
        });

        expect(spawnMock).toHaveBeenCalledTimes(3);
        const [, argsPrint] = spawnMock.mock.calls[2];
        expect(argsPrint).toEqual([
            '--print', 'One-shot summary',
            '--output-format', 'stream-json',
            '--model', 'claude-sonnet-5-5-high',
            '--effort', 'high',
            '--dangerously-skip-permissions',
            '--add-dir', 'C:\\workspace\\other'
        ]);

        // 1e. Empty prompt throws error
        expect(() => bridge.prompt({ prompt: '   ' })).toThrow(/non-empty string/i);
    });

    it('2. parses chunked NDJSON stdout and emits normalized step events', () => {
        bridge.prompt({ prompt: 'Run diagnostics' });

        const streamEvents = [];
        const stepEvents = [];
        bridge.on('stream_event', (e) => streamEvents.push(e));
        bridge.on('step', (e) => stepEvents.push(e));

        const rawRecord1 = {
            step_index: 3,
            source: 'MODEL',
            type: 'PLANNER_RESPONSE',
            status: 'DONE',
            content: 'Diagnostics complete.',
            thinking: 'Checking all subsystems...',
            tool_calls: [{ name: 'view_file', args: { AbsolutePath: '/tmp/a.js' } }]
        };
        const rawRecord2 = {
            type: 'PLANNER_RESPONSE',
            content: 'Second streamed line with UTF-8: 🚀'
        };

        const serialized = JSON.stringify(rawRecord1) + '\n' + JSON.stringify(rawRecord2) + '\n';
        const buf = Buffer.from(serialized, 'utf8');
        const splitPoint = Math.floor(buf.length / 2);

        // Feed first partial buffer chunk
        mockChild.stdout.emit('data', buf.subarray(0, splitPoint));
        // Feed remaining buffer chunk
        mockChild.stdout.emit('data', buf.subarray(splitPoint));

        expect(streamEvents).toHaveLength(2);
        expect(stepEvents).toHaveLength(2);

        expect(stepEvents[0].conversationId).toBe(bridge.sessionId);
        expect(stepEvents[0].step).toMatchObject({
            step_index: 3,
            source: 'MODEL',
            type: 'PLANNER_RESPONSE',
            status: 'DONE',
            content: 'Diagnostics complete.',
            thinking: 'Checking all subsystems...',
            tool_calls: [{ name: 'view_file', args: { AbsolutePath: '/tmp/a.js' } }]
        });

        expect(stepEvents[1].step.content).toBe('Second streamed line with UTF-8: 🚀');
        expect(stepEvents[1].step.source).toBe('MODEL');
    });

    it('3. detects tool approval requests, sets pendingApproval, and writes approval responses to stdin', () => {
        bridge.prompt({ prompt: 'Deploy changes' });

        const approvals = [];
        const resolved = [];
        bridge.on('approval_required', (a) => approvals.push(a));
        bridge.on('approval_resolved', (r) => resolved.push(r));

        const approvalRequestLine = JSON.stringify({
            type: 'tool_approval_request',
            tool_call_id: 'call_991',
            name: 'run_command',
            args: { CommandLine: 'npm test' }
        }) + '\n';

        mockChild.stdout.emit('data', Buffer.from(approvalRequestLine, 'utf8'));

        expect(bridge.status).toBe('waiting_approval');
        expect(bridge.pendingApproval).toMatchObject({
            toolCallId: 'call_991',
            toolName: 'run_command',
            args: { CommandLine: 'npm test' }
        });
        expect(approvals).toHaveLength(1);
        expect(approvals[0].toolCallId).toBe('call_991');

        const approveResult = bridge.approve({
            toolCallId: 'call_991',
            approved: true,
            reason: 'Confirmed by user on mobile'
        });

        expect(approveResult).toEqual({
            success: true,
            toolCallId: 'call_991',
            approved: true
        });
        expect(bridge.status).toBe('running');
        expect(bridge.pendingApproval).toBeNull();
        expect(resolved).toHaveLength(1);

        // Last stdin write should be the tool_approval NDJSON line
        const lastStdinWrite = mockChild.stdin.writes[mockChild.stdin.writes.length - 1];
        expect(JSON.parse(lastStdinWrite.trim())).toEqual({
            type: 'tool_approval',
            tool_call_id: 'call_991',
            approved: true,
            reason: 'Confirmed by user on mobile'
        });
    });

    it('4. handles process abort and cleanup lifecycle accurately', () => {
        // Abort when idle returns aborted: false
        expect(bridge.abort()).toEqual({ success: true, aborted: false });

        bridge.prompt({ prompt: 'Long running task' });
        expect(bridge.getStatus().hasActiveProcess).toBe(true);

        const abortedEvents = [];
        bridge.on('aborted', (evt) => abortedEvents.push(evt));

        const abortRes = bridge.abort();
        expect(abortRes).toEqual({ success: true, aborted: true });
        expect(mockChild.kill).toHaveBeenCalledWith('SIGTERM');
        expect(bridge.getStatus().status).toBe('idle');
        expect(bridge.getStatus().hasActiveProcess).toBe(false);
        expect(bridge.getStatus().pendingApproval).toBeNull();
        expect(abortedEvents).toHaveLength(1);

        // Verify approve fails gracefully when no active process exists
        expect(bridge.approve({ toolCallId: 'none' })).toEqual({
            success: false,
            error: 'No active process or stdin not writable'
        });
    });

    it('5. returns full Antigravity 2.0 model list via getModels()', () => {
        const models = bridge.getModels();
        expect(models).toBe(ANTIGRAVITY_MODELS);
        expect(models.length).toBeGreaterThanOrEqual(10);
        const ids = models.map((m) => m.id);
        expect(ids).toContain('gemini-4-argon-high');
        expect(ids).toContain('gemini-4-argon-medium');
        expect(ids).toContain('claude-sonnet-5-5-high');
    });
});
