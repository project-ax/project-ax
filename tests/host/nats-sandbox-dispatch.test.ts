// tests/host/nats-sandbox-dispatch.test.ts — NATS sandbox dispatch tests
//
// Tests the NATSSandboxDispatcher interface and per-turn pod affinity logic.
// Uses mocked NATS module since we don't have a real NATS server in unit tests.

import { describe, test, expect, vi, beforeEach } from 'vitest';

// Mock the nats module
const mockRequest = vi.fn();
const mockDrain = vi.fn().mockResolvedValue(undefined);
const mockConnect = vi.fn().mockResolvedValue({
  request: mockRequest,
  drain: mockDrain,
});

vi.mock('nats', () => ({
  connect: mockConnect,
}));

import { createNATSSandboxDispatcher } from '../../src/host/nats-sandbox-dispatch.js';

function encode(obj: unknown): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(obj));
}

describe('NATSSandboxDispatcher', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test('connects to NATS on creation', async () => {
    await createNATSSandboxDispatcher({ natsUrl: 'nats://test:4222' });
    expect(mockConnect).toHaveBeenCalledWith(
      expect.objectContaining({ servers: 'nats://test:4222' }),
    );
  });

  test('claims a pod on first dispatch and reuses it', async () => {
    // First request: claim response
    mockRequest
      .mockResolvedValueOnce({
        data: encode({ type: 'claim_ack', podSubject: 'sandbox.pod-1', podId: 'pod-1' }),
      })
      // Second request: tool dispatch response
      .mockResolvedValueOnce({
        data: encode({ type: 'bash_result', output: 'hello', exitCode: 0 }),
      })
      // Third request: second tool dispatch (same pod, no new claim)
      .mockResolvedValueOnce({
        data: encode({ type: 'read_file_result', content: 'file data' }),
      });

    const dispatcher = await createNATSSandboxDispatcher();

    // First tool call — should claim then dispatch
    const result1 = await dispatcher.dispatch('req-1', 'session-1', { type: 'bash', command: 'echo hello' });
    expect(result1).toEqual({ type: 'bash_result', output: 'hello', exitCode: 0 });

    // Verify claim was sent to task queue
    expect(mockRequest).toHaveBeenCalledWith(
      'tasks.sandbox.light',
      expect.any(Uint8Array),
      expect.objectContaining({ timeout: expect.any(Number) }),
    );

    // Verify tool was dispatched to claimed pod subject
    expect(mockRequest).toHaveBeenCalledWith(
      'sandbox.pod-1',
      expect.any(Uint8Array),
      expect.objectContaining({ timeout: expect.any(Number) }),
    );

    // Second tool call — should reuse same pod (no new claim)
    const result2 = await dispatcher.dispatch('req-1', 'session-1', { type: 'read_file', path: 'test.txt' });
    expect(result2).toEqual({ type: 'read_file_result', content: 'file data' });

    // Should have been called 3 times total: claim + tool1 + tool2
    expect(mockRequest).toHaveBeenCalledTimes(3);
  });

  test('different requestIds get different pods', async () => {
    mockRequest
      // Claim for req-1
      .mockResolvedValueOnce({
        data: encode({ type: 'claim_ack', podSubject: 'sandbox.pod-A', podId: 'pod-A' }),
      })
      // Tool for req-1
      .mockResolvedValueOnce({
        data: encode({ type: 'bash_result', output: 'a', exitCode: 0 }),
      })
      // Claim for req-2
      .mockResolvedValueOnce({
        data: encode({ type: 'claim_ack', podSubject: 'sandbox.pod-B', podId: 'pod-B' }),
      })
      // Tool for req-2
      .mockResolvedValueOnce({
        data: encode({ type: 'bash_result', output: 'b', exitCode: 0 }),
      });

    const dispatcher = await createNATSSandboxDispatcher();

    await dispatcher.dispatch('req-1', 's1', { type: 'bash', command: 'echo a' });
    await dispatcher.dispatch('req-2', 's2', { type: 'bash', command: 'echo b' });

    // Two separate claims should have been made
    expect(mockRequest).toHaveBeenCalledTimes(4); // 2 claims + 2 tools
  });

  test('release sends release message and removes affinity', async () => {
    mockRequest
      .mockResolvedValueOnce({
        data: encode({ type: 'claim_ack', podSubject: 'sandbox.pod-1', podId: 'pod-1' }),
      })
      .mockResolvedValueOnce({
        data: encode({ type: 'bash_result', output: 'ok', exitCode: 0 }),
      })
      .mockResolvedValueOnce({
        data: encode({ type: 'release_ack' }),
      });

    const dispatcher = await createNATSSandboxDispatcher();
    await dispatcher.dispatch('req-1', 's1', { type: 'bash', command: 'ls' });

    expect(dispatcher.hasPod('req-1')).toBe(true);
    await dispatcher.release('req-1');
    expect(dispatcher.hasPod('req-1')).toBe(false);

    // Verify release was sent to pod subject
    expect(mockRequest).toHaveBeenLastCalledWith(
      'sandbox.pod-1',
      expect.any(Uint8Array),
      expect.objectContaining({ timeout: 10_000 }),
    );
  });

  test('release is no-op for unknown requestId', async () => {
    const dispatcher = await createNATSSandboxDispatcher();
    await dispatcher.release('unknown-req');
    // Should not throw or call NATS
    expect(mockRequest).not.toHaveBeenCalled();
  });

  test('supports custom tier', async () => {
    mockRequest
      .mockResolvedValueOnce({
        data: encode({ type: 'claim_ack', podSubject: 'sandbox.heavy-1', podId: 'heavy-1' }),
      })
      .mockResolvedValueOnce({
        data: encode({ type: 'bash_result', output: 'heavy work done', exitCode: 0 }),
      });

    const dispatcher = await createNATSSandboxDispatcher();
    await dispatcher.dispatch('req-1', 's1', { type: 'bash', command: 'compile' }, 'heavy');

    // Claim should go to heavy tier
    expect(mockRequest).toHaveBeenCalledWith(
      'tasks.sandbox.heavy',
      expect.any(Uint8Array),
      expect.any(Object),
    );
  });

  test('close releases all pods and drains NATS', async () => {
    mockRequest
      .mockResolvedValueOnce({
        data: encode({ type: 'claim_ack', podSubject: 'sandbox.pod-1', podId: 'pod-1' }),
      })
      .mockResolvedValueOnce({
        data: encode({ type: 'bash_result', output: 'ok', exitCode: 0 }),
      })
      .mockResolvedValueOnce({
        data: encode({ type: 'release_ack' }),
      });

    const dispatcher = await createNATSSandboxDispatcher();
    await dispatcher.dispatch('req-1', 's1', { type: 'bash', command: 'ls' });
    await dispatcher.close();

    expect(mockDrain).toHaveBeenCalled();
  });
});
