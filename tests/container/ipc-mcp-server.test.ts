import { describe, test, expect, vi } from 'vitest';
import { createIPCMcpServer } from '../../src/container/ipc-mcp-server.js';
import type { IPCClient } from '../../src/container/ipc-client.js';

/** Create a mock IPC client with a spied call() method. */
function createMockClient(response: unknown = { ok: true }): IPCClient {
  return {
    call: vi.fn().mockResolvedValue(response),
    connect: vi.fn().mockResolvedValue(undefined),
    disconnect: vi.fn(),
  } as unknown as IPCClient;
}

/** Create a mock IPC client that throws errors. */
function createErrorClient(message: string): IPCClient {
  return {
    call: vi.fn().mockRejectedValue(new Error(message)),
    connect: vi.fn().mockResolvedValue(undefined),
    disconnect: vi.fn(),
  } as unknown as IPCClient;
}

/** Get the tool registry from a McpServer instance (plain object, not Map). */
function getTools(server: ReturnType<typeof createIPCMcpServer>): Record<string, any> {
  return (server.instance as any)._registeredTools;
}

describe('IPC MCP Server', () => {
  test('has correct structure (type, name, instance)', () => {
    const client = createMockClient();
    const server = createIPCMcpServer(client);

    expect(server.type).toBe('sdk');
    expect(server.name).toBe('ax-tools');
    expect(server.instance).toBeDefined();
  });

  test('memory_write calls IPC client with correct action', async () => {
    const client = createMockClient({ id: 'mem_1' });
    const server = createIPCMcpServer(client);
    const tools = getTools(server);

    expect(tools['memory_write']).toBeDefined();

    const result = await tools['memory_write'].handler(
      { scope: 'test', content: 'hello', tags: ['a'] },
      {},
    );

    expect(client.call).toHaveBeenCalledWith({
      action: 'memory_write',
      scope: 'test',
      content: 'hello',
      tags: ['a'],
    });
    expect(result.content[0].text).toContain('"id":"mem_1"');
  });

  test('memory_query calls IPC client with correct action', async () => {
    const client = createMockClient([{ id: 'mem_1', content: 'hi' }]);
    const server = createIPCMcpServer(client);
    const tools = getTools(server);

    const result = await tools['memory_query'].handler(
      { scope: 'test', query: 'search term', limit: 5 },
      {},
    );

    expect(client.call).toHaveBeenCalledWith({
      action: 'memory_query',
      scope: 'test',
      query: 'search term',
      limit: 5,
    });
    expect(result.content[0].text).toContain('mem_1');
  });

  test('web_search calls IPC client with correct action', async () => {
    const client = createMockClient({ results: [] });
    const server = createIPCMcpServer(client);
    const tools = getTools(server);

    await tools['web_search'].handler({ query: 'test query', maxResults: 3 }, {});

    expect(client.call).toHaveBeenCalledWith({
      action: 'web_search',
      query: 'test query',
      maxResults: 3,
    });
  });

  test('skill_list calls IPC client with no extra params', async () => {
    const client = createMockClient({ skills: ['s1', 's2'] });
    const server = createIPCMcpServer(client);
    const tools = getTools(server);

    await tools['skill_list'].handler({}, {});

    expect(client.call).toHaveBeenCalledWith({ action: 'skill_list' });
  });

  test('error from IPC returns error content', async () => {
    const client = createErrorClient('connection refused');
    const server = createIPCMcpServer(client);
    const tools = getTools(server);

    const result = await tools['memory_read'].handler({ id: 'nonexistent' }, {});

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('connection refused');
  });

  test('all 10 IPC tools are registered', () => {
    const client = createMockClient();
    const server = createIPCMcpServer(client);
    const tools = getTools(server);

    const expectedTools = [
      'memory_write', 'memory_query', 'memory_read', 'memory_delete', 'memory_list',
      'skill_read', 'skill_list',
      'web_search', 'web_fetch',
      'audit_query',
    ];

    const registeredNames = Object.keys(tools);
    for (const name of expectedTools) {
      expect(registeredNames, `expected tool "${name}" to be registered`).toContain(name);
    }
    expect(registeredNames.length).toBe(expectedTools.length);
  });
});
