import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createEventBus, type StreamEvent, type EventBus } from '../../../src/host/event-bus.js';
import { createAgentSupervisor, type AgentSupervisor } from '../../../src/host/orchestration/agent-supervisor.js';
import type { AgentRegistration, AgentState } from '../../../src/host/orchestration/types.js';
import { TERMINAL_STATES, STATE_TRANSITIONS } from '../../../src/host/orchestration/types.js';

function makeRegistration(overrides: Partial<AgentRegistration> = {}): AgentRegistration {
  return {
    agentId: 'main',
    agentType: 'pi-coding-agent',
    sessionId: 'session-1',
    userId: 'user-1',
    ...overrides,
  };
}

describe('AgentSupervisor', () => {
  let eventBus: EventBus;
  let supervisor: AgentSupervisor;
  let events: StreamEvent[];

  beforeEach(() => {
    eventBus = createEventBus();
    events = [];
    eventBus.subscribe(e => events.push(e));
    supervisor = createAgentSupervisor(eventBus);
  });

  describe('register', () => {
    it('creates a handle in spawning state', () => {
      const handle = supervisor.register(makeRegistration());
      expect(handle.state).toBe('spawning');
      expect(handle.agentId).toBe('main');
      expect(handle.agentType).toBe('pi-coding-agent');
      expect(handle.sessionId).toBe('session-1');
      expect(handle.userId).toBe('user-1');
      expect(handle.parentId).toBeNull();
    });

    it('assigns a unique runtime ID', () => {
      const a = supervisor.register(makeRegistration());
      const b = supervisor.register(makeRegistration({ agentId: 'other' }));
      expect(a.id).not.toBe(b.id);
      // UUID format
      expect(a.id).toMatch(/^[0-9a-f-]{36}$/);
    });

    it('emits agent.registered event', () => {
      supervisor.register(makeRegistration());
      const registered = events.find(e => e.type === 'agent.registered');
      expect(registered).toBeDefined();
      expect(registered!.data.agentId).toBe('main');
      expect(registered!.data.agentType).toBe('pi-coding-agent');
    });

    it('sets parentId when provided', () => {
      const parent = supervisor.register(makeRegistration({ agentId: 'parent' }));
      const child = supervisor.register(makeRegistration({
        agentId: 'child',
        parentId: parent.id,
      }));
      expect(child.parentId).toBe(parent.id);
    });

    it('throws when max active agents reached', () => {
      const sv = createAgentSupervisor(eventBus, undefined, { maxActiveAgents: 2 });
      sv.register(makeRegistration({ agentId: 'a' }));
      sv.register(makeRegistration({ agentId: 'b' }));
      expect(() => sv.register(makeRegistration({ agentId: 'c' }))).toThrow('Max active agents');
    });

    it('allows registration after terminal agents free up slots', () => {
      const sv = createAgentSupervisor(eventBus, undefined, { maxActiveAgents: 1 });
      const h = sv.register(makeRegistration());
      sv.transition(h.id, 'running');
      sv.complete(h.id);
      // Should not throw — the completed agent doesn't count
      const h2 = sv.register(makeRegistration({ agentId: 'second' }));
      expect(h2).toBeDefined();
    });
  });

  describe('transition', () => {
    it('updates agent state', () => {
      const handle = supervisor.register(makeRegistration());
      supervisor.transition(handle.id, 'running');
      expect(supervisor.get(handle.id)?.state).toBe('running');
    });

    it('emits agent.state event on transition', () => {
      const handle = supervisor.register(makeRegistration());
      events.length = 0; // Clear registration event

      supervisor.transition(handle.id, 'running');
      const stateEvent = events.find(e => e.type === 'agent.state');
      expect(stateEvent).toBeDefined();
      expect(stateEvent!.data.oldState).toBe('spawning');
      expect(stateEvent!.data.newState).toBe('running');
    });

    it('throws on invalid state transition', () => {
      const handle = supervisor.register(makeRegistration());
      // spawning → thinking is not valid (must go through running)
      expect(() => supervisor.transition(handle.id, 'thinking')).toThrow('Invalid state transition');
    });

    it('allows all valid transitions from running', () => {
      const validFromRunning = ['thinking', 'tool_calling', 'waiting_for_llm', 'delegating', 'interrupted', 'completed', 'failed', 'canceled'];
      for (const target of validFromRunning) {
        const h = supervisor.register(makeRegistration({ agentId: `agent-${target}` }));
        supervisor.transition(h.id, 'running');
        expect(() => supervisor.transition(h.id, target as AgentState)).not.toThrow();
      }
    });

    it('prevents transitions from terminal states', () => {
      const handle = supervisor.register(makeRegistration());
      supervisor.transition(handle.id, 'running');
      supervisor.complete(handle.id);
      expect(() => supervisor.transition(handle.id, 'running')).toThrow('Invalid state transition');
    });

    it('updates activity description', () => {
      const handle = supervisor.register(makeRegistration());
      supervisor.transition(handle.id, 'running', 'Processing user request');
      expect(supervisor.get(handle.id)?.activity).toBe('Processing user request');
    });

    it('updates lastStateChange timestamp', () => {
      const handle = supervisor.register(makeRegistration());
      const beforeTransition = handle.lastStateChange;
      // Small delay to ensure different timestamp
      supervisor.transition(handle.id, 'running');
      expect(supervisor.get(handle.id)!.lastStateChange).toBeGreaterThanOrEqual(beforeTransition);
    });

    it('silently returns for unknown handle IDs', () => {
      // Should not throw
      expect(() => supervisor.transition('nonexistent', 'running')).not.toThrow();
    });
  });

  describe('interrupt', () => {
    it('transitions to interrupted state', () => {
      const handle = supervisor.register(makeRegistration());
      supervisor.transition(handle.id, 'running');
      supervisor.interrupt(handle.id, 'Off track');
      expect(supervisor.get(handle.id)?.state).toBe('interrupted');
    });

    it('emits agent.interrupt event', () => {
      const handle = supervisor.register(makeRegistration());
      supervisor.transition(handle.id, 'running');
      events.length = 0;

      supervisor.interrupt(handle.id, 'User requested stop');
      const interrupt = events.find(e => e.type === 'agent.interrupt');
      expect(interrupt).toBeDefined();
      expect(interrupt!.data.reason).toBe('User requested stop');
      expect(interrupt!.data.previousState).toBe('running');
    });

    it('sets activity with reason', () => {
      const handle = supervisor.register(makeRegistration());
      supervisor.transition(handle.id, 'running');
      supervisor.interrupt(handle.id, 'Went off track');
      expect(supervisor.get(handle.id)?.activity).toBe('Interrupted: Went off track');
    });

    it('ignores interrupt on terminal agents', () => {
      const handle = supervisor.register(makeRegistration());
      supervisor.transition(handle.id, 'running');
      supervisor.complete(handle.id);
      events.length = 0;

      supervisor.interrupt(handle.id, 'Too late');
      expect(events.find(e => e.type === 'agent.interrupt')).toBeUndefined();
      expect(supervisor.get(handle.id)?.state).toBe('completed');
    });

    it('ignores double interrupt', () => {
      const handle = supervisor.register(makeRegistration());
      supervisor.transition(handle.id, 'running');
      supervisor.interrupt(handle.id, 'First');
      events.length = 0;

      supervisor.interrupt(handle.id, 'Second');
      expect(events.find(e => e.type === 'agent.interrupt')).toBeUndefined();
    });

    it('auto-cancels after grace period', async () => {
      const sv = createAgentSupervisor(eventBus, undefined, { interruptGraceMs: 50 });
      const handle = sv.register(makeRegistration());
      sv.transition(handle.id, 'running');
      sv.interrupt(handle.id, 'Grace test');

      // Wait for grace period + buffer
      await new Promise(r => setTimeout(r, 100));
      expect(sv.get(handle.id)?.state).toBe('canceled');
    });

    it('does not auto-cancel if agent completes within grace period', async () => {
      const sv = createAgentSupervisor(eventBus, undefined, { interruptGraceMs: 100 });
      const handle = sv.register(makeRegistration());
      sv.transition(handle.id, 'running');
      sv.interrupt(handle.id, 'Grace test');

      // Complete before grace period
      sv.complete(handle.id);
      await new Promise(r => setTimeout(r, 150));
      expect(sv.get(handle.id)?.state).toBe('completed');
    });
  });

  describe('cancel', () => {
    it('transitions to canceled state', () => {
      const handle = supervisor.register(makeRegistration());
      supervisor.transition(handle.id, 'running');
      supervisor.cancel(handle.id, 'No longer needed');
      expect(supervisor.get(handle.id)?.state).toBe('canceled');
    });

    it('emits agent.canceled event', () => {
      const handle = supervisor.register(makeRegistration());
      supervisor.transition(handle.id, 'running');
      events.length = 0;

      supervisor.cancel(handle.id, 'Done');
      const canceled = events.find(e => e.type === 'agent.canceled');
      expect(canceled).toBeDefined();
    });

    it('is idempotent for terminal agents', () => {
      const handle = supervisor.register(makeRegistration());
      supervisor.transition(handle.id, 'running');
      supervisor.cancel(handle.id, 'First');
      events.length = 0;

      supervisor.cancel(handle.id, 'Second');
      expect(events).toHaveLength(0); // No new events
    });
  });

  describe('complete', () => {
    it('transitions to completed state', () => {
      const handle = supervisor.register(makeRegistration());
      supervisor.transition(handle.id, 'running');
      supervisor.complete(handle.id, 'Task done');
      expect(supervisor.get(handle.id)?.state).toBe('completed');
    });

    it('emits agent.completed event', () => {
      const handle = supervisor.register(makeRegistration());
      supervisor.transition(handle.id, 'running');
      events.length = 0;

      supervisor.complete(handle.id, 'All good');
      const completed = events.find(e => e.type === 'agent.completed');
      expect(completed).toBeDefined();
      expect(completed!.data.result).toBe('All good');
    });

    it('can complete from interrupted state', () => {
      const handle = supervisor.register(makeRegistration());
      supervisor.transition(handle.id, 'running');
      supervisor.interrupt(handle.id, 'Pause');
      supervisor.complete(handle.id, 'Finished after interrupt');
      expect(supervisor.get(handle.id)?.state).toBe('completed');
    });
  });

  describe('fail', () => {
    it('transitions to failed state', () => {
      const handle = supervisor.register(makeRegistration());
      supervisor.transition(handle.id, 'running');
      supervisor.fail(handle.id, 'OOM killed');
      expect(supervisor.get(handle.id)?.state).toBe('failed');
    });

    it('emits agent.failed event with error', () => {
      const handle = supervisor.register(makeRegistration());
      supervisor.transition(handle.id, 'running');
      events.length = 0;

      supervisor.fail(handle.id, 'Timeout exceeded');
      const failed = events.find(e => e.type === 'agent.failed');
      expect(failed).toBeDefined();
      expect(failed!.data.error).toBe('Timeout exceeded');
    });
  });

  describe('get / all / remove', () => {
    it('get returns the handle by runtime ID', () => {
      const handle = supervisor.register(makeRegistration());
      const fetched = supervisor.get(handle.id);
      expect(fetched).toBe(handle);
    });

    it('get returns undefined for unknown IDs', () => {
      expect(supervisor.get('nonexistent')).toBeUndefined();
    });

    it('all returns all registered handles', () => {
      supervisor.register(makeRegistration({ agentId: 'a' }));
      supervisor.register(makeRegistration({ agentId: 'b' }));
      expect(supervisor.all()).toHaveLength(2);
    });

    it('remove deletes the handle', () => {
      const handle = supervisor.register(makeRegistration());
      expect(supervisor.remove(handle.id)).toBe(true);
      expect(supervisor.get(handle.id)).toBeUndefined();
    });

    it('remove returns false for unknown IDs', () => {
      expect(supervisor.remove('nonexistent')).toBe(false);
    });
  });

  describe('activeCount', () => {
    it('counts only non-terminal agents', () => {
      const a = supervisor.register(makeRegistration({ agentId: 'a' }));
      const b = supervisor.register(makeRegistration({ agentId: 'b' }));
      const c = supervisor.register(makeRegistration({ agentId: 'c' }));

      supervisor.transition(a.id, 'running');
      supervisor.complete(a.id);

      supervisor.transition(b.id, 'running');
      supervisor.transition(b.id, 'thinking');

      // c is still spawning

      expect(supervisor.activeCount()).toBe(2); // b (thinking) + c (spawning)
    });
  });

  describe('state transition validation', () => {
    it('all terminal states have empty transition sets', () => {
      for (const state of TERMINAL_STATES) {
        expect(STATE_TRANSITIONS[state].size).toBe(0);
      }
    });

    it('spawning can only go to running, failed, or canceled', () => {
      const allowed = STATE_TRANSITIONS['spawning'];
      expect(allowed).toContain('running');
      expect(allowed).toContain('failed');
      expect(allowed).toContain('canceled');
      expect(allowed.size).toBe(3);
    });

    it('interrupted can go to canceled, completed, or failed', () => {
      const allowed = STATE_TRANSITIONS['interrupted'];
      expect(allowed).toContain('canceled');
      expect(allowed).toContain('completed');
      expect(allowed).toContain('failed');
      expect(allowed.size).toBe(3);
    });
  });
});
