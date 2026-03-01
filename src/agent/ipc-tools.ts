import type { AgentTool } from '@mariozechner/pi-agent-core';
import type { IPCClient } from './ipc-client.js';
import { TOOL_CATALOG, filterTools } from './tool-catalog.js';
import type { ToolFilterContext } from './tool-catalog.js';

function text(t: string) {
  return { content: [{ type: 'text' as const, text: t }], details: undefined };
}

export interface IPCToolsOptions {
  /** Current user ID — included in user_write calls for per-user scoping. */
  userId?: string;
  /** Tool filter context — excludes tools irrelevant to the current session. */
  filter?: ToolFilterContext;
}

/** Create tools that route through IPC to the host process. */
export function createIPCTools(client: IPCClient, opts?: IPCToolsOptions): AgentTool[] {
  async function ipcCall(action: string, params: Record<string, unknown> = {}, timeoutMs?: number) {
    try {
      const result = await client.call({ action, ...params }, timeoutMs);
      return text(JSON.stringify(result));
    } catch (err: unknown) {
      return text(`Error: ${(err as Error).message}`);
    }
  }

  const catalog = opts?.filter ? filterTools(opts.filter) : TOOL_CATALOG;

  return catalog.map(spec => ({
    name: spec.name,
    label: spec.label,
    description: spec.description,
    parameters: spec.parameters,
    async execute(_id: string, params: unknown) {
      const p = params as Record<string, unknown>;
      let action: string;
      let callParams: Record<string, unknown>;

      if (spec.actionMap) {
        // Multi-op: extract type, resolve action
        const { type, ...rest } = p;
        action = spec.actionMap[type as string];
        if (!action) return text(`Error: unknown type "${type}" for tool "${spec.name}"`);
        callParams = rest;
      } else {
        // Singleton
        action = spec.singletonAction ?? spec.name;
        callParams = p;
      }

      // Inject userId only for identity tool's user_write type
      if (spec.injectUserId && (p.type === 'user_write' || !spec.actionMap)) {
        callParams = { ...callParams, userId: opts?.userId ?? '' };
      }

      return ipcCall(action, callParams, spec.timeoutMs);
    },
  }));
}
