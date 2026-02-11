import { describe, test, expect, beforeEach } from 'vitest';
import { createIPCHandler, type IPCContext } from '../../src/host/ipc-server.js';
import type { ProviderRegistry } from '../../src/types.js';

const ctx: IPCContext = { sessionId: 'test-session', agentId: 'test-agent' };

// Minimal mock registry with just enough to test dispatch
function mockRegistry(): ProviderRegistry {
  return {
    llm: {
      name: 'mock',
      async *chat() { yield { type: 'text', content: 'Hello' }; yield { type: 'done', usage: { inputTokens: 10, outputTokens: 5 } }; },
      async models() { return ['mock-model']; },
    },
    memory: {
      async write(entry) { return 'mock-id-00000000-0000-0000-0000-000000000000'; },
      async query() { return []; },
      async read() { return null; },
      async delete() {},
      async list() { return []; },
    },
    scanner: {
      canaryToken() { return 'CANARY-test'; },
      checkCanary() { return false; },
      async scanInput() { return { verdict: 'PASS' as const }; },
      async scanOutput() { return { verdict: 'PASS' as const }; },
    },
    channels: [],
    web: {
      async fetch() { throw new Error('Provider disabled (provider: none)'); },
      async search() { throw new Error('Provider disabled (provider: none)'); },
    },
    browser: {
      async launch() { throw new Error('Provider disabled (provider: none)'); },
      async navigate() { throw new Error('Provider disabled (provider: none)'); },
      async snapshot() { throw new Error('Provider disabled (provider: none)'); },
      async click() { throw new Error('Provider disabled (provider: none)'); },
      async type() { throw new Error('Provider disabled (provider: none)'); },
      async screenshot() { throw new Error('Provider disabled (provider: none)'); },
      async close() { throw new Error('Provider disabled (provider: none)'); },
    },
    credentials: {
      async get() { return null; },
      async set() {},
      async delete() {},
      async list() { return []; },
    },
    skills: {
      async list() { return []; },
      async read() { return ''; },
      async propose() { throw new Error('read-only'); },
      async approve() {},
      async reject() {},
      async revert() {},
      async log() { return []; },
    },
    audit: {
      async log() {},
      async query() { return []; },
    },
    sandbox: {
      async spawn() { throw new Error('not implemented'); },
      async kill() {},
      async isAvailable() { return false; },
    },
    scheduler: {
      async start() {},
      async stop() {},
    },
  } as ProviderRegistry;
}

describe('IPC Handler', () => {
  let handle: (raw: string, ctx: IPCContext) => Promise<string>;

  beforeEach(() => {
    handle = createIPCHandler(mockRegistry());
  });

  test('rejects invalid JSON', async () => {
    const result = JSON.parse(await handle('not json', ctx));
    expect(result.ok).toBe(false);
    expect(result.error).toBe('Invalid JSON');
  });

  test('rejects unknown action', async () => {
    const result = JSON.parse(await handle('{"action":"evil"}', ctx));
    expect(result.ok).toBe(false);
    expect(result.error).toContain('Unknown');
  });

  test('rejects invalid payload for known action', async () => {
    const result = JSON.parse(await handle('{"action":"llm_call"}', ctx));
    expect(result.ok).toBe(false);
    expect(result.error).toContain('Validation failed');
  });

  test('dispatches valid llm_call', async () => {
    const payload = JSON.stringify({
      action: 'llm_call',
      messages: [{ role: 'user', content: 'hello' }],
    });
    const result = JSON.parse(await handle(payload, ctx));
    expect(result.ok).toBe(true);
    expect(result.chunks).toBeDefined();
    expect(result.chunks.length).toBe(2);
  });

  test('dispatches valid memory_query', async () => {
    const payload = JSON.stringify({
      action: 'memory_query',
      scope: 'user_alice',
    });
    const result = JSON.parse(await handle(payload, ctx));
    expect(result.ok).toBe(true);
    expect(result.results).toEqual([]);
  });

  test('dispatches valid skill_list', async () => {
    const payload = JSON.stringify({ action: 'skill_list' });
    const result = JSON.parse(await handle(payload, ctx));
    expect(result.ok).toBe(true);
    expect(result.skills).toEqual([]);
  });

  test('dispatches valid audit_query', async () => {
    const payload = JSON.stringify({ action: 'audit_query' });
    const result = JSON.parse(await handle(payload, ctx));
    expect(result.ok).toBe(true);
  });

  test('returns handler error for disabled provider', async () => {
    const payload = JSON.stringify({
      action: 'web_fetch',
      url: 'https://example.com',
    });
    const result = JSON.parse(await handle(payload, ctx));
    expect(result.ok).toBe(false);
    expect(result.error).toContain('Provider disabled');
  });

  test('rejects extra fields (strict mode)', async () => {
    const payload = JSON.stringify({
      action: 'skill_list',
      evil: 'injected',
    });
    const result = JSON.parse(await handle(payload, ctx));
    expect(result.ok).toBe(false);
  });

  test('rejects null bytes', async () => {
    const payload = JSON.stringify({
      action: 'memory_query',
      scope: 'user\0evil',
    });
    const result = JSON.parse(await handle(payload, ctx));
    expect(result.ok).toBe(false);
  });

  test('forwards tools to LLM provider', async () => {
    const receivedReq: any[] = [];
    const registry = mockRegistry();
    registry.llm = {
      name: 'mock',
      async *chat(req: any) {
        receivedReq.push(req);
        yield { type: 'text', content: 'ok' };
        yield { type: 'done', usage: { inputTokens: 1, outputTokens: 1 } };
      },
      async models() { return ['mock']; },
    };
    const handleWithTools = createIPCHandler(registry);

    const payload = JSON.stringify({
      action: 'llm_call',
      messages: [{ role: 'user', content: 'list files' }],
      tools: [
        { name: 'bash', description: 'Run command', parameters: { type: 'object' } },
        { name: 'read_file', description: 'Read file', parameters: { type: 'object' } },
      ],
    });
    const result = JSON.parse(await handleWithTools(payload, ctx));
    expect(result.ok).toBe(true);
    expect(receivedReq[0].tools).toHaveLength(2);
    expect(receivedReq[0].tools[0].name).toBe('bash');
    expect(receivedReq[0].tools[1].name).toBe('read_file');
  });

  test('LLM provider returns tool_use chunks', async () => {
    const registry = mockRegistry();
    registry.llm = {
      name: 'mock',
      async *chat() {
        yield { type: 'text', content: 'Let me run that.' };
        yield { type: 'tool_use', toolCall: { id: 'call_1', name: 'bash', args: { command: 'ls' } } };
        yield { type: 'done', usage: { inputTokens: 10, outputTokens: 5 } };
      },
      async models() { return ['mock']; },
    };
    const handleToolUse = createIPCHandler(registry);

    const payload = JSON.stringify({
      action: 'llm_call',
      messages: [{ role: 'user', content: 'list files' }],
      tools: [{ name: 'bash', description: 'Run command', parameters: {} }],
    });
    const result = JSON.parse(await handleToolUse(payload, ctx));
    expect(result.ok).toBe(true);
    expect(result.chunks.length).toBe(3);
    expect(result.chunks[0]).toEqual({ type: 'text', content: 'Let me run that.' });
    expect(result.chunks[1]).toEqual({
      type: 'tool_use',
      toolCall: { id: 'call_1', name: 'bash', args: { command: 'ls' } },
    });
    expect(result.chunks[2].type).toBe('done');
  });

  test('accepts structured content blocks in llm_call messages', async () => {
    const receivedReq: any[] = [];
    const registry = mockRegistry();
    registry.llm = {
      name: 'mock',
      async *chat(req: any) {
        receivedReq.push(req);
        yield { type: 'text', content: 'Here are the files.' };
        yield { type: 'done', usage: { inputTokens: 1, outputTokens: 1 } };
      },
      async models() { return ['mock']; },
    };
    const handleStructured = createIPCHandler(registry);

    // Simulate the second LLM call in a tool loop:
    // assistant used tool_use, then user sends tool_result
    const payload = JSON.stringify({
      action: 'llm_call',
      messages: [
        { role: 'user', content: 'list files' },
        {
          role: 'assistant',
          content: [
            { type: 'text', text: 'I\'ll list them.' },
            { type: 'tool_use', id: 'call_1', name: 'bash', input: { command: 'ls' } },
          ],
        },
        {
          role: 'user',
          content: [
            { type: 'tool_result', tool_use_id: 'call_1', content: 'file1.txt\nfile2.txt' },
          ],
        },
      ],
      tools: [{ name: 'bash', description: 'Run command', parameters: {} }],
    });

    const result = JSON.parse(await handleStructured(payload, ctx));
    expect(result.ok).toBe(true);
    // Verify structured messages were forwarded to the LLM provider
    expect(receivedReq[0].messages).toHaveLength(3);
    const assistantMsg = receivedReq[0].messages[1];
    expect(Array.isArray(assistantMsg.content)).toBe(true);
    const toolResultMsg = receivedReq[0].messages[2];
    expect(Array.isArray(toolResultMsg.content)).toBe(true);
  });
});
