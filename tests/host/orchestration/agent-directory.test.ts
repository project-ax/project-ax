import { describe, it, expect, beforeEach } from 'vitest';
import { createEventBus, type EventBus } from '../../../src/host/event-bus.js';
import { createAgentSupervisor, type AgentSupervisor } from '../../../src/host/orchestration/agent-supervisor.js';
import { createAgentDirectory, type AgentDirectory } from '../../../src/host/orchestration/agent-directory.js';
import type { AgentRegistration } from '../../../src/host/orchestration/types.js';

function makeRegistration(overrides: Partial<AgentRegistration> = {}): AgentRegistration {
  return {
    agentId: 'main',
    agentType: 'pi-coding-agent',
    sessionId: 'session-1',
    userId: 'user-1',
    ...overrides,
  };
}

describe('AgentDirectory', () => {
  let eventBus: EventBus;
  let supervisor: AgentSupervisor;
  let directory: AgentDirectory;

  beforeEach(() => {
    eventBus = createEventBus();
    supervisor = createAgentSupervisor(eventBus);
    directory = createAgentDirectory(supervisor);
  });

  describe('list', () => {
    it('returns empty array when no agents registered', () => {
      expect(directory.list()).toHaveLength(0);
    });

    it('returns all agents without filter', () => {
      supervisor.register(makeRegistration({ agentId: 'a' }));
      supervisor.register(makeRegistration({ agentId: 'b' }));
      expect(directory.list()).toHaveLength(2);
    });

    it('filters by sessionId', () => {
      supervisor.register(makeRegistration({ agentId: 'a', sessionId: 'session-1' }));
      supervisor.register(makeRegistration({ agentId: 'b', sessionId: 'session-2' }));
      const result = directory.list({ sessionId: 'session-1' });
      expect(result).toHaveLength(1);
      expect(result[0].agentId).toBe('a');
    });

    it('filters by userId', () => {
      supervisor.register(makeRegistration({ agentId: 'a', userId: 'alice' }));
      supervisor.register(makeRegistration({ agentId: 'b', userId: 'bob' }));
      const result = directory.list({ userId: 'bob' });
      expect(result).toHaveLength(1);
      expect(result[0].agentId).toBe('b');
    });

    it('filters by state', () => {
      const a = supervisor.register(makeRegistration({ agentId: 'a' }));
      const b = supervisor.register(makeRegistration({ agentId: 'b' }));
      supervisor.transition(a.id, 'running');
      // b stays in 'spawning'

      const running = directory.list({ state: 'running' });
      expect(running).toHaveLength(1);
      expect(running[0].agentId).toBe('a');
    });

    it('filters by state array', () => {
      const a = supervisor.register(makeRegistration({ agentId: 'a' }));
      const b = supervisor.register(makeRegistration({ agentId: 'b' }));
      const c = supervisor.register(makeRegistration({ agentId: 'c' }));
      supervisor.transition(a.id, 'running');
      supervisor.transition(b.id, 'running');
      supervisor.transition(b.id, 'thinking');
      // c stays in 'spawning'

      const result = directory.list({ state: ['running', 'thinking'] });
      expect(result).toHaveLength(2);
    });

    it('filters by agentType', () => {
      supervisor.register(makeRegistration({ agentId: 'pi', agentType: 'pi-coding-agent' }));
      supervisor.register(makeRegistration({ agentId: 'cc', agentType: 'claude-code' }));

      const result = directory.list({ agentType: 'claude-code' });
      expect(result).toHaveLength(1);
      expect(result[0].agentId).toBe('cc');
    });

    it('combines multiple filters (AND logic)', () => {
      supervisor.register(makeRegistration({ agentId: 'a', sessionId: 'sess-1', userId: 'alice' }));
      supervisor.register(makeRegistration({ agentId: 'b', sessionId: 'sess-1', userId: 'bob' }));
      supervisor.register(makeRegistration({ agentId: 'c', sessionId: 'sess-2', userId: 'alice' }));

      const result = directory.list({ sessionId: 'sess-1', userId: 'alice' });
      expect(result).toHaveLength(1);
      expect(result[0].agentId).toBe('a');
    });
  });

  describe('bySession', () => {
    it('returns agents for a specific session', () => {
      supervisor.register(makeRegistration({ agentId: 'a', sessionId: 'sess-1' }));
      supervisor.register(makeRegistration({ agentId: 'b', sessionId: 'sess-1' }));
      supervisor.register(makeRegistration({ agentId: 'c', sessionId: 'sess-2' }));

      expect(directory.bySession('sess-1')).toHaveLength(2);
      expect(directory.bySession('sess-2')).toHaveLength(1);
      expect(directory.bySession('sess-3')).toHaveLength(0);
    });
  });

  describe('byUser', () => {
    it('returns agents for a specific user', () => {
      supervisor.register(makeRegistration({ agentId: 'a', userId: 'alice' }));
      supervisor.register(makeRegistration({ agentId: 'b', userId: 'bob' }));

      expect(directory.byUser('alice')).toHaveLength(1);
      expect(directory.byUser('bob')).toHaveLength(1);
      expect(directory.byUser('charlie')).toHaveLength(0);
    });
  });

  describe('byParent', () => {
    it('returns direct children of a parent', () => {
      const parent = supervisor.register(makeRegistration({ agentId: 'parent' }));
      supervisor.register(makeRegistration({ agentId: 'child-1', parentId: parent.id }));
      supervisor.register(makeRegistration({ agentId: 'child-2', parentId: parent.id }));
      supervisor.register(makeRegistration({ agentId: 'unrelated' }));

      const children = directory.byParent(parent.id);
      expect(children).toHaveLength(2);
      expect(children.map(c => c.agentId)).toContain('child-1');
      expect(children.map(c => c.agentId)).toContain('child-2');
    });
  });

  describe('tree', () => {
    it('returns null for unknown root', () => {
      expect(directory.tree('nonexistent')).toBeNull();
    });

    it('returns a single-node tree for a leaf agent', () => {
      const leaf = supervisor.register(makeRegistration());
      const t = directory.tree(leaf.id);
      expect(t).not.toBeNull();
      expect(t!.handle.id).toBe(leaf.id);
      expect(t!.children).toHaveLength(0);
    });

    it('builds a multi-level tree', () => {
      const root = supervisor.register(makeRegistration({ agentId: 'root' }));
      const childA = supervisor.register(makeRegistration({ agentId: 'child-a', parentId: root.id }));
      const childB = supervisor.register(makeRegistration({ agentId: 'child-b', parentId: root.id }));
      supervisor.register(makeRegistration({ agentId: 'grandchild', parentId: childA.id }));

      const t = directory.tree(root.id);
      expect(t!.handle.agentId).toBe('root');
      expect(t!.children).toHaveLength(2);

      const childATree = t!.children.find(c => c.handle.agentId === 'child-a');
      expect(childATree!.children).toHaveLength(1);
      expect(childATree!.children[0].handle.agentId).toBe('grandchild');

      const childBTree = t!.children.find(c => c.handle.agentId === 'child-b');
      expect(childBTree!.children).toHaveLength(0);
    });
  });

  describe('count', () => {
    it('counts all active agents without scope', () => {
      const a = supervisor.register(makeRegistration({ agentId: 'a' }));
      supervisor.register(makeRegistration({ agentId: 'b' }));
      supervisor.transition(a.id, 'running');
      supervisor.complete(a.id);

      expect(directory.count()).toBe(1); // Only 'b' is active
    });

    it('counts by session scope', () => {
      supervisor.register(makeRegistration({ agentId: 'a', sessionId: 'sess-1' }));
      supervisor.register(makeRegistration({ agentId: 'b', sessionId: 'sess-1' }));
      supervisor.register(makeRegistration({ agentId: 'c', sessionId: 'sess-2' }));

      expect(directory.count({ type: 'session', sessionId: 'sess-1' })).toBe(2);
      expect(directory.count({ type: 'session', sessionId: 'sess-2' })).toBe(1);
    });

    it('counts by user scope', () => {
      supervisor.register(makeRegistration({ agentId: 'a', userId: 'alice' }));
      supervisor.register(makeRegistration({ agentId: 'b', userId: 'bob' }));

      expect(directory.count({ type: 'user', userId: 'alice' })).toBe(1);
    });

    it('counts by children scope', () => {
      const parent = supervisor.register(makeRegistration({ agentId: 'parent' }));
      supervisor.register(makeRegistration({ agentId: 'child-1', parentId: parent.id }));
      supervisor.register(makeRegistration({ agentId: 'child-2', parentId: parent.id }));

      expect(directory.count({ type: 'children', parentId: parent.id })).toBe(2);
    });
  });

  describe('summary', () => {
    it('returns empty array when no active agents', () => {
      expect(directory.summary()).toHaveLength(0);
    });

    it('groups agents by session', () => {
      supervisor.register(makeRegistration({ agentId: 'a', sessionId: 'sess-1', userId: 'alice' }));
      supervisor.register(makeRegistration({ agentId: 'b', sessionId: 'sess-1', userId: 'alice' }));
      supervisor.register(makeRegistration({ agentId: 'c', sessionId: 'sess-2', userId: 'bob' }));

      const summaries = directory.summary();
      expect(summaries).toHaveLength(2);

      const sess1 = summaries.find(s => s.sessionId === 'sess-1');
      expect(sess1).toBeDefined();
      expect(sess1!.agentCount).toBe(2);
      expect(sess1!.userId).toBe('alice');

      const sess2 = summaries.find(s => s.sessionId === 'sess-2');
      expect(sess2).toBeDefined();
      expect(sess2!.agentCount).toBe(1);
    });

    it('excludes terminal agents', () => {
      const a = supervisor.register(makeRegistration({ agentId: 'a', sessionId: 'sess-1' }));
      supervisor.register(makeRegistration({ agentId: 'b', sessionId: 'sess-1' }));
      supervisor.transition(a.id, 'running');
      supervisor.complete(a.id);

      const summaries = directory.summary();
      expect(summaries).toHaveLength(1);
      expect(summaries[0].agentCount).toBe(1);
      expect(summaries[0].agents[0].agentId).toBe('b');
    });

    it('includes duration for each agent', () => {
      supervisor.register(makeRegistration({ agentId: 'a', sessionId: 'sess-1' }));
      const summaries = directory.summary();
      expect(summaries[0].agents[0].durationMs).toBeGreaterThanOrEqual(0);
    });
  });
});
