/**
 * Agent Directory — runtime agent discovery and scoping.
 *
 * The dynamic complement to the static AgentRegistry. While AgentRegistry
 * stores persistent metadata (capabilities, descriptions), the Directory
 * tracks what's actually running right now.
 *
 * All queries are scoped — agents can only see agents within their
 * visibility scope (same session, same parent tree). The Orchestrator
 * enforces scope when handling IPC queries from sandboxed agents.
 */

import type { AgentSupervisor } from './agent-supervisor.js';
import type {
  AgentHandle,
  AgentQuery,
  AgentTree,
  MessageScope,
  AgentState,
} from './types.js';
import { TERMINAL_STATES } from './types.js';

export interface AgentDirectory {
  /** List all active agents, optionally filtered. */
  list(filter?: AgentQuery): AgentHandle[];

  /** Find agents by session. */
  bySession(sessionId: string): AgentHandle[];

  /** Find agents by user. */
  byUser(userId: string): AgentHandle[];

  /** Find agents by parent (direct children only). */
  byParent(parentId: string): AgentHandle[];

  /** Get the full agent tree (parent + all descendants). */
  tree(rootId: string): AgentTree | null;

  /** Count active agents by scope. */
  count(scope?: MessageScope): number;

  /** Get a summary of all active agents grouped by session. */
  summary(): SessionSummary[];
}

export interface SessionSummary {
  sessionId: string;
  userId: string;
  agentCount: number;
  agents: Array<{
    handleId: string;
    agentId: string;
    state: AgentState;
    activity: string;
    durationMs: number;
  }>;
}

export function createAgentDirectory(supervisor: AgentSupervisor): AgentDirectory {
  function matchesQuery(handle: AgentHandle, filter: AgentQuery): boolean {
    if (filter.sessionId && handle.sessionId !== filter.sessionId) return false;
    if (filter.userId && handle.userId !== filter.userId) return false;
    if (filter.parentId && handle.parentId !== filter.parentId) return false;
    if (filter.agentId && handle.agentId !== filter.agentId) return false;
    if (filter.agentType && handle.agentType !== filter.agentType) return false;

    if (filter.state) {
      const states = Array.isArray(filter.state) ? filter.state : [filter.state];
      if (!states.includes(handle.state)) return false;
    }

    return true;
  }

  function list(filter?: AgentQuery): AgentHandle[] {
    const all = supervisor.all();
    if (!filter) return all;
    return all.filter(h => matchesQuery(h, filter));
  }

  function bySession(sessionId: string): AgentHandle[] {
    return supervisor.all().filter(h => h.sessionId === sessionId);
  }

  function byUser(userId: string): AgentHandle[] {
    return supervisor.all().filter(h => h.userId === userId);
  }

  function byParent(parentId: string): AgentHandle[] {
    return supervisor.all().filter(h => h.parentId === parentId);
  }

  function tree(rootId: string): AgentTree | null {
    const root = supervisor.get(rootId);
    if (!root) return null;

    function buildSubtree(handle: AgentHandle): AgentTree {
      const children = supervisor.all()
        .filter(h => h.parentId === handle.id)
        .map(child => buildSubtree(child));

      return { handle, children };
    }

    return buildSubtree(root);
  }

  function count(scope?: MessageScope): number {
    if (!scope) {
      return supervisor.activeCount();
    }

    const all = supervisor.all().filter(h => !TERMINAL_STATES.has(h.state));

    switch (scope.type) {
      case 'session':
        return all.filter(h => h.sessionId === scope.sessionId).length;
      case 'user':
        return all.filter(h => h.userId === scope.userId).length;
      case 'children':
        return all.filter(h => h.parentId === scope.parentId).length;
      case 'all':
        return all.length;
    }
  }

  function summary(): SessionSummary[] {
    const all = supervisor.all().filter(h => !TERMINAL_STATES.has(h.state));
    const bySessionMap = new Map<string, AgentHandle[]>();

    for (const handle of all) {
      const existing = bySessionMap.get(handle.sessionId);
      if (existing) {
        existing.push(handle);
      } else {
        bySessionMap.set(handle.sessionId, [handle]);
      }
    }

    const now = Date.now();
    const summaries: SessionSummary[] = [];

    for (const [sessionId, agents] of bySessionMap) {
      summaries.push({
        sessionId,
        userId: agents[0].userId,
        agentCount: agents.length,
        agents: agents.map(a => ({
          handleId: a.id,
          agentId: a.agentId,
          state: a.state,
          activity: a.activity,
          durationMs: now - a.startedAt,
        })),
      });
    }

    return summaries;
  }

  return { list, bySession, byUser, byParent, tree, count, summary };
}
