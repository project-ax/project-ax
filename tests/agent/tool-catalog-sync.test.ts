/**
 * Sync test: verifies mcp-server.ts tool names and parameter keys
 * match the shared tool catalog. Catches drift between the Zod-based
 * MCP server and the TypeBox-based catalog.
 */

import { describe, test, expect, vi } from 'vitest';
import { TOOL_NAMES, getToolParamKeys } from '../../src/agent/tool-catalog.js';
import { createIPCMcpServer } from '../../src/agent/mcp-server.js';
import type { IPCClient } from '../../src/agent/ipc-client.js';

function createMockClient(): IPCClient {
  return {
    call: vi.fn().mockResolvedValue({ ok: true }),
    connect: vi.fn().mockResolvedValue(undefined),
    disconnect: vi.fn(),
  } as unknown as IPCClient;
}

function getTools(server: ReturnType<typeof createIPCMcpServer>): Record<string, any> {
  return (server.instance as any)._registeredTools;
}

describe('tool-catalog ↔ mcp-server sync', () => {
  test('MCP tool names exactly match TOOL_NAMES', () => {
    const client = createMockClient();
    const server = createIPCMcpServer(client);
    const mcpToolNames = Object.keys(getTools(server)).sort();
    const catalogNames = [...TOOL_NAMES].sort();
    expect(mcpToolNames).toEqual(catalogNames);
  });

  test('each MCP tool parameter keys match catalog getToolParamKeys', () => {
    const client = createMockClient();
    const server = createIPCMcpServer(client);
    const tools = getTools(server);

    for (const name of TOOL_NAMES) {
      const mcpTool = tools[name];
      expect(mcpTool, `MCP tool "${name}" not found`).toBeDefined();

      // Extract Zod schema keys from the MCP tool's inputSchema
      // Zod v4 stores shape at inputSchema.def.shape
      const zodShape = mcpTool.inputSchema?.def?.shape ?? {};
      const mcpKeys = Object.keys(zodShape).sort();
      const catalogKeys = getToolParamKeys(name).sort();

      expect(mcpKeys, `Parameter keys mismatch for tool "${name}"`).toEqual(catalogKeys);
    }
  });
});
