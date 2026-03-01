import { describe, it, expect, beforeEach } from 'vitest';
import { createEventBus, type EventBus } from '../../../src/host/event-bus.js';
import { createOrchestrator, type Orchestrator } from '../../../src/host/orchestration/orchestrator.js';
import { createOrchestrationHandlers } from '../../../src/host/ipc-handlers/orchestration.js';
import type { IPCContext } from '../../../src/host/ipc-server.js';

describe('Orchestration IPC Handlers', () => {
  let eventBus: EventBus;
  let orchestrator: Orchestrator;
  let handlers: ReturnType<typeof createOrchestrationHandlers>;

  beforeEach(() => {
    eventBus = createEventBus();
    orchestrator = createOrchestrator(eventBus);
    handlers = createOrchestrationHandlers(orchestrator);
  });

  function makeCtx(overrides: Partial<IPCContext> = {}): IPCContext {
    return {
      sessionId: 'session-1',
      agentId: 'main',
      ...overrides,
    };
  }

  describe('resolveCallerHandle (via agent_orch_status)', () => {
    it('resolves correct handle when multiple agents share a session', async () => {
      const h1 = orchestrator.register({
        agentId: 'agent-a',
        agentType: 'pi-coding-agent',
        sessionId: 'shared-session',
        userId: 'user-1',
      });
      orchestrator.supervisor.transition(h1.id, 'running');

      const h2 = orchestrator.register({
        agentId: 'agent-b',
        agentType: 'pi-coding-agent',
        sessionId: 'shared-session',
        userId: 'user-1',
      });
      orchestrator.supervisor.transition(h2.id, 'running');

      // Request from agent-b should resolve to h2, not h1
      const result = await handlers.agent_orch_status(
        {},
        makeCtx({ sessionId: 'shared-session', agentId: 'agent-b' }),
      );

      expect(result.ok).toBe(true);
      expect(result.agent.id).toBe(h2.id);
      expect(result.agent.agentId).toBe('agent-b');
    });

    it('does not resolve a terminal handle for the caller', async () => {
      const h1 = orchestrator.register({
        agentId: 'agent-x',
        agentType: 'pi-coding-agent',
        sessionId: 'session-1',
        userId: 'user-1',
      });
      orchestrator.supervisor.transition(h1.id, 'running');
      orchestrator.supervisor.complete(h1.id);

      // A new handle registered for the same agent after the first completed
      const h2 = orchestrator.register({
        agentId: 'agent-x',
        agentType: 'pi-coding-agent',
        sessionId: 'session-1',
        userId: 'user-1',
      });
      orchestrator.supervisor.transition(h2.id, 'running');

      const result = await handlers.agent_orch_status(
        {},
        makeCtx({ sessionId: 'session-1', agentId: 'agent-x' }),
      );

      expect(result.ok).toBe(true);
      // Should resolve to h2 (the active one), not h1 (completed)
      expect(result.agent.id).toBe(h2.id);
      expect(result.agent.state).toBe('running');
    });
  });

  describe('agent_orch_message', () => {
    it('correctly attributes sender when multiple agents in session', async () => {
      const sender = orchestrator.register({
        agentId: 'sender-agent',
        agentType: 'pi-coding-agent',
        sessionId: 'shared',
        userId: 'user-1',
      });
      orchestrator.supervisor.transition(sender.id, 'running');

      const other = orchestrator.register({
        agentId: 'other-agent',
        agentType: 'pi-coding-agent',
        sessionId: 'shared',
        userId: 'user-1',
      });
      orchestrator.supervisor.transition(other.id, 'running');

      const recipient = orchestrator.register({
        agentId: 'recipient',
        agentType: 'pi-coding-agent',
        sessionId: 'shared',
        userId: 'user-1',
      });

      // Send as sender-agent, not other-agent
      const result = await handlers.agent_orch_message(
        {
          to: recipient.id,
          type: 'notification',
          payload: { text: 'hello' },
        },
        makeCtx({ sessionId: 'shared', agentId: 'sender-agent' }),
      );

      expect(result.ok).toBe(true);

      // Verify the message is from the correct sender
      const messages = orchestrator.pollMessages(recipient.id);
      expect(messages).toHaveLength(1);
      expect(messages[0].from).toBe(sender.id);
    });
  });

  describe('agent_orch_list', () => {
    it('enforces session scope', async () => {
      orchestrator.register({
        agentId: 'a',
        agentType: 'pi-coding-agent',
        sessionId: 'session-1',
        userId: 'user-1',
      });
      orchestrator.register({
        agentId: 'b',
        agentType: 'pi-coding-agent',
        sessionId: 'session-2',
        userId: 'user-1',
      });

      const result = await handlers.agent_orch_list(
        {},
        makeCtx({ sessionId: 'session-1' }),
      );

      expect(result.ok).toBe(true);
      expect(result.count).toBe(1);
      expect(result.agents[0].agentId).toBe('a');
    });

    it('prevents querying other sessions', async () => {
      orchestrator.register({
        agentId: 'secret',
        agentType: 'pi-coding-agent',
        sessionId: 'other-session',
        userId: 'user-1',
      });

      const result = await handlers.agent_orch_list(
        { sessionId: 'other-session' },
        makeCtx({ sessionId: 'my-session' }),
      );

      // Should be scoped to my-session, not other-session
      expect(result.ok).toBe(true);
      expect(result.count).toBe(0);
    });
  });
});
