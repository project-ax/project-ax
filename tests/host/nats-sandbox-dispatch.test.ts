// tests/host/nats-sandbox-dispatch.test.ts — NATS sandbox dispatch tests
//
// Tests the NATSSandboxDispatcher interface and per-turn pod affinity logic.
// Uses mocked NATS module since we don't have a real NATS server in unit tests.

import { describe, test, expect, vi, beforeEach } from 'vitest';

// Mock the nats module
const mockRequest = vi.fn();
const mockPublish = vi.fn();
const mockDrain = vi.fn().mockResolvedValue(undefined);

// Track subscribe callbacks to simulate responses
type SubHandler = { inbox: string; opts: any; iterator: MockIterator };

class MockIterator {
  private messages: any[] = [];
  private resolve: ((value: IteratorResult<any>) => void) | null = null;
  private done = false;

  push(msg: any) {
    if (this.resolve) {
      const r = this.resolve;
      this.resolve = null;
      r({ value: msg, done: false });
    } else {
      this.messages.push(msg);
    }
  }

  end() {
    this.done = true;
    if (this.resolve) {
      const r = this.resolve;
      this.resolve = null;
      r({ value: undefined, done: true });
    }
  }

  [Symbol.asyncIterator]() {
    return {
      next: () => {
        if (this.messages.length > 0) {
          return Promise.resolve({ value: this.messages.shift(), done: false });
        }
        if (this.done) {
          return Promise.resolve({ value: undefined, done: true });
        }
        return new Promise<IteratorResult<any>>((resolve) => {
          this.resolve = resolve;
        });
      },
    };
  }
}

const subscriptions: SubHandler[] = [];
const mockSubscribe = vi.fn((inbox: string, opts?: any) => {
  const iterator = new MockIterator();
  const sub = { inbox, opts, iterator };
  subscriptions.push(sub);
  const subObj = Object.assign(iterator, {
    unsubscribe: vi.fn(() => iterator.end()),
  });
  return subObj;
});

// When publish is called with a reply inbox, deliver the claim_ack
// to the corresponding subscription
let claimResponses: any[] = [];
mockPublish.mockImplementation((_subject: string, _data: Uint8Array, opts?: { reply?: string }) => {
  if (opts?.reply && claimResponses.length > 0) {
    const response = claimResponses.shift();
    // Find the subscription for this inbox and deliver the response
    const sub = subscriptions.find(s => s.inbox === opts.reply);
    if (sub) {
      // Simulate slight async delay (JetStream ack first, then worker reply)
      setTimeout(() => {
        sub.iterator.push({ data: encode(response) });
      }, 0);
    }
  }
});

const mockConnect = vi.fn().mockResolvedValue({
  request: mockRequest,
  publish: mockPublish,
  subscribe: mockSubscribe,
  drain: mockDrain,
});

vi.mock('nats', () => ({
  connect: mockConnect,
  createInbox: vi.fn(() => `_INBOX.test-${Math.random().toString(36).slice(2)}`),
}));

import { createNATSSandboxDispatcher } from '../../src/host/nats-sandbox-dispatch.js';

function encode(obj: unknown): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(obj));
}

describe('NATSSandboxDispatcher', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    subscriptions.length = 0;
    claimResponses = [];
  });

  test('connects to NATS on creation', async () => {
    await createNATSSandboxDispatcher({ natsUrl: 'nats://test:4222' });
    expect(mockConnect).toHaveBeenCalledWith(
      expect.objectContaining({ servers: 'nats://test:4222' }),
    );
  });

  test('claims a pod on first dispatch and reuses it', async () => {
    // Queue claim response
    claimResponses.push({ type: 'claim_ack', podSubject: 'sandbox.pod-1', podId: 'pod-1' });

    // Tool dispatch responses via nc.request()
    mockRequest
      .mockResolvedValueOnce({
        data: encode({ type: 'bash_result', output: 'hello', exitCode: 0 }),
      })
      .mockResolvedValueOnce({
        data: encode({ type: 'read_file_result', content: 'file data' }),
      });

    const dispatcher = await createNATSSandboxDispatcher();

    // First tool call — should claim then dispatch
    const result1 = await dispatcher.dispatch('req-1', 'session-1', { type: 'bash', command: 'echo hello' });
    expect(result1).toEqual({ type: 'bash_result', output: 'hello', exitCode: 0 });

    // Verify claim was published to task queue
    expect(mockPublish).toHaveBeenCalledWith(
      'tasks.sandbox.light',
      expect.any(Uint8Array),
      expect.objectContaining({ reply: expect.any(String) }),
    );

    // Verify tool was dispatched to claimed pod subject via request()
    expect(mockRequest).toHaveBeenCalledWith(
      'sandbox.pod-1',
      expect.any(Uint8Array),
      expect.objectContaining({ timeout: expect.any(Number) }),
    );

    // Second tool call — should reuse same pod (no new claim)
    const result2 = await dispatcher.dispatch('req-1', 'session-1', { type: 'read_file', path: 'test.txt' });
    expect(result2).toEqual({ type: 'read_file_result', content: 'file data' });

    // publish called once (claim), request called twice (tool1 + tool2)
    expect(mockPublish).toHaveBeenCalledTimes(1);
    expect(mockRequest).toHaveBeenCalledTimes(2);
  });

  test('different requestIds get different pods', async () => {
    // Queue claim responses for two different requests
    claimResponses.push({ type: 'claim_ack', podSubject: 'sandbox.pod-A', podId: 'pod-A' });
    claimResponses.push({ type: 'claim_ack', podSubject: 'sandbox.pod-B', podId: 'pod-B' });

    mockRequest
      .mockResolvedValueOnce({
        data: encode({ type: 'bash_result', output: 'a', exitCode: 0 }),
      })
      .mockResolvedValueOnce({
        data: encode({ type: 'bash_result', output: 'b', exitCode: 0 }),
      });

    const dispatcher = await createNATSSandboxDispatcher();

    await dispatcher.dispatch('req-1', 's1', { type: 'bash', command: 'echo a' });
    await dispatcher.dispatch('req-2', 's2', { type: 'bash', command: 'echo b' });

    // Two claims (publish) + two tools (request)
    expect(mockPublish).toHaveBeenCalledTimes(2);
    expect(mockRequest).toHaveBeenCalledTimes(2);
  });

  test('release sends release message and removes affinity', async () => {
    claimResponses.push({ type: 'claim_ack', podSubject: 'sandbox.pod-1', podId: 'pod-1' });

    mockRequest
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
    claimResponses.push({ type: 'claim_ack', podSubject: 'sandbox.heavy-1', podId: 'heavy-1' });

    mockRequest
      .mockResolvedValueOnce({
        data: encode({ type: 'bash_result', output: 'heavy work done', exitCode: 0 }),
      });

    const dispatcher = await createNATSSandboxDispatcher();
    await dispatcher.dispatch('req-1', 's1', { type: 'bash', command: 'compile' }, 'heavy');

    // Claim should go to heavy tier
    expect(mockPublish).toHaveBeenCalledWith(
      'tasks.sandbox.heavy',
      expect.any(Uint8Array),
      expect.any(Object),
    );
  });

  test('close releases all pods and drains NATS', async () => {
    claimResponses.push({ type: 'claim_ack', podSubject: 'sandbox.pod-1', podId: 'pod-1' });

    mockRequest
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
