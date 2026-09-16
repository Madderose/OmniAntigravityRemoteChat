import { describe, it } from 'vitest';
import assert from 'node:assert/strict';
import { attachAudioNatively } from '../../src/server.js';

describe('Native Audio Attachment (attachAudioNatively)', () => {
    it('rejects call with missing CDP connection or missing data', async () => {
        const res1 = await attachAudioNatively(null, { data: 'abc' });
        assert.equal(res1.ok, false);
        assert.equal(res1.reason, 'missing_cdp_or_data');

        const res2 = await attachAudioNatively({ call: async () => {} }, { data: '' });
        assert.equal(res2.ok, false);
        assert.equal(res2.reason, 'missing_cdp_or_data');
    });

    it('attaches audio via CDP Runtime.evaluate on the default execution context', async () => {
        let evaluatedParams = null;
        const mockCdp = {
            contexts: [
                { id: 1, auxData: { isDefault: true } },
                { id: 2, auxData: { isDefault: false } }
            ],
            call: async (method, params) => {
                if (method === 'Runtime.evaluate') {
                    evaluatedParams = params;
                    return {
                        result: {
                            value: { ok: true, count: 1, duration: 4.2 }
                        }
                    };
                }
                return {};
            }
        };

        const result = await attachAudioNatively(mockCdp, {
            data: 'data:audio/webm;base64,GkXfo59ChoEBQveBAULygQRC84EIQoKEd2VibUKHgQRChYECGFOAZwE=',
            mimeType: 'audio/webm;codecs=opus',
            durationSeconds: 4.2,
            name: 'my-voice-memo.webm'
        });

        assert.equal(result.ok, true);
        assert.equal(result.count, 1);
        assert.equal(result.duration, 4.2);
        assert.ok(evaluatedParams);
        assert.equal(evaluatedParams.contextId, 1);
        assert.ok(evaluatedParams.expression.includes('my-voice-memo.webm'));
        assert.ok(evaluatedParams.expression.includes('audio/webm;codecs=opus'));
        assert.ok(evaluatedParams.expression.includes('setMediaAttachments'));
    });

    it('falls back to top-level context (undefined contextId) if default context evaluation fails', async () => {
        const calls = [];
        const mockCdp = {
            contexts: [
                { id: 1, auxData: { isDefault: true } }
            ],
            call: async (method, params) => {
                calls.push(params.contextId);
                if (params.contextId === 1) {
                    return { result: { value: null } }; // Failed in isolated context
                }
                // Succeeds in top-level
                return {
                    result: {
                        value: { ok: true, count: 2, duration: 1.5 }
                    }
                };
            }
        };

        const result = await attachAudioNatively(mockCdp, {
            data: 'dGVzdC1hdWRpby1ieXRlcw==',
            durationSeconds: 1.5
        });

        assert.equal(result.ok, true);
        assert.equal(result.count, 2);
        assert.deepEqual(calls, [1, undefined]);
    });

    it('returns attach_failed_across_contexts when all contexts fail', async () => {
        const mockCdp = {
            contexts: [{ id: 1, auxData: { isDefault: true } }],
            call: async () => ({ result: { value: { ok: false, error: 'input_box_ref_not_found' } } })
        };

        const result = await attachAudioNatively(mockCdp, {
            data: 'dGVzdA=='
        });

        assert.equal(result.ok, false);
        assert.equal(result.reason, 'attach_failed_across_contexts');
    });
});
