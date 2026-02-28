/**
 * Agent Supervisor — manages individual agent lifecycle and state.
 *
 * Each running agent gets an AgentHandle tracked by the supervisor.
 * State transitions emit events on the EventBus. Interrupts and
 * cancellations are coordinated through the supervisor.
 *
 * This is a host-side module — agents interact through IPC.
 */

import { randomUUID } from 'node:crypto';
import type { EventBus } from '../event-bus.js';
import type { AuditProvider } from '../../providers/audit/types.js';
import { getLogger } from '../../logger.js';
import type {
  AgentHandle,
  AgentRegistration,
  AgentState,
} from './types.js';
import { TERMINAL_STATES, STATE_TRANSITIONS } from './types.js';

const logger = getLogger().child({ component: 'agent-supervisor' });

/** Grace period before force-killing an interrupted agent. */
const DEFAULT_INTERRUPT_GRACE_MS = 10_000;

/** Maximum active agents system-wide (safety valve). */
const MAX_ACTIVE_AGENTS = 50;

export interface AgentSupervisorConfig {
  interruptGraceMs?: number;
  maxActiveAgents?: number;
}

export interface AgentSupervisor {
  /** Register a new running agent. Returns a handle. */
  register(opts: AgentRegistration): AgentHandle;

  /** Update agent state. Emits agent.state event. Throws on invalid transition. */
  transition(handleId: string, state: AgentState, activity?: string): void;

  /**
   * Send an interrupt signal. The agent should wind down gracefully.
   * After the grace period, the supervisor emits agent.canceled if still running.
   */
  interrupt(handleId: string, reason: string): void;

  /** Cancel an agent immediately. */
  cancel(handleId: string, reason: string): void;

  /** Mark agent as completed. */
  complete(handleId: string, result?: string): void;

  /** Mark agent as failed. */
  fail(handleId: string, error: string): void;

  /** Get current handle by runtime ID. */
  get(handleId: string): AgentHandle | undefined;

  /** Remove a completed/failed/canceled handle. Returns true if found. */
  remove(handleId: string): boolean;

  /** List all handles. */
  all(): AgentHandle[];

  /** Count active (non-terminal) agents. */
  activeCount(): number;
}

export function createAgentSupervisor(
  eventBus: EventBus,
  audit?: AuditProvider,
  config?: AgentSupervisorConfig,
): AgentSupervisor {
  const handles = new Map<string, AgentHandle>();
  const interruptTimers = new Map<string, ReturnType<typeof setTimeout>>();
  const interruptGraceMs = config?.interruptGraceMs ?? DEFAULT_INTERRUPT_GRACE_MS;
  const maxActive = config?.maxActiveAgents ?? MAX_ACTIVE_AGENTS;

  function emitStateEvent(handle: AgentHandle, oldState: AgentState, detail?: Record<string, unknown>): void {
    eventBus.emit({
      type: `agent.${handle.state === 'completed' ? 'completed' : handle.state === 'failed' ? 'failed' : handle.state === 'canceled' ? 'canceled' : 'state'}`,
      requestId: handle.sessionId,
      timestamp: Date.now(),
      data: {
        handleId: handle.id,
        agentId: handle.agentId,
        agentType: handle.agentType,
        oldState,
        newState: handle.state,
        activity: handle.activity,
        parentId: handle.parentId,
        userId: handle.userId,
        ...detail,
      },
    });
  }

  function auditLog(action: string, handle: AgentHandle, extra?: Record<string, unknown>): void {
    audit?.log({
      action: `orchestration.${action}`,
      sessionId: handle.sessionId,
      args: {
        handleId: handle.id,
        agentId: handle.agentId,
        state: handle.state,
        userId: handle.userId,
        ...extra,
      },
    }).catch(err => {
      logger.warn('audit_log_failed', { action, error: (err as Error).message });
    });
  }

  function register(opts: AgentRegistration): AgentHandle {
    // Safety valve: prevent runaway agent spawning
    const active = [...handles.values()].filter(h => !TERMINAL_STATES.has(h.state)).length;
    if (active >= maxActive) {
      throw new Error(`Max active agents reached (${maxActive}). Cannot register new agent.`);
    }

    const now = Date.now();
    const handle: AgentHandle = {
      id: randomUUID(),
      agentId: opts.agentId,
      agentType: opts.agentType,
      state: 'spawning',
      parentId: opts.parentId ?? null,
      sessionId: opts.sessionId,
      userId: opts.userId,
      startedAt: now,
      lastStateChange: now,
      activity: opts.activity ?? 'Starting up',
      metadata: opts.metadata ?? {},
    };

    handles.set(handle.id, handle);

    eventBus.emit({
      type: 'agent.registered',
      requestId: handle.sessionId,
      timestamp: now,
      data: {
        handleId: handle.id,
        agentId: handle.agentId,
        agentType: handle.agentType,
        parentId: handle.parentId,
        userId: handle.userId,
      },
    });

    auditLog('register', handle);
    logger.info('agent_registered', {
      handleId: handle.id,
      agentId: handle.agentId,
      agentType: handle.agentType,
      parentId: handle.parentId,
    });

    return handle;
  }

  function transition(handleId: string, state: AgentState, activity?: string): void {
    const handle = handles.get(handleId);
    if (!handle) {
      logger.warn('transition_unknown_handle', { handleId, targetState: state });
      return;
    }

    // Validate transition
    const allowed = STATE_TRANSITIONS[handle.state];
    if (!allowed.has(state)) {
      logger.warn('invalid_state_transition', {
        handleId,
        from: handle.state,
        to: state,
      });
      throw new Error(
        `Invalid state transition: ${handle.state} → ${state} for agent ${handle.id}`
      );
    }

    const oldState = handle.state;
    handle.state = state;
    handle.lastStateChange = Date.now();
    if (activity !== undefined) {
      handle.activity = activity;
    }

    emitStateEvent(handle, oldState);

    logger.debug('agent_state_transition', {
      handleId,
      agentId: handle.agentId,
      from: oldState,
      to: state,
      activity: handle.activity,
    });
  }

  function interrupt(handleId: string, reason: string): void {
    const handle = handles.get(handleId);
    if (!handle) {
      logger.warn('interrupt_unknown_handle', { handleId });
      return;
    }

    if (TERMINAL_STATES.has(handle.state)) {
      logger.debug('interrupt_terminal_agent', { handleId, state: handle.state });
      return;
    }

    // If already interrupted, don't re-interrupt
    if (handle.state === 'interrupted') {
      logger.debug('interrupt_already_interrupted', { handleId });
      return;
    }

    const oldState = handle.state;
    handle.state = 'interrupted';
    handle.lastStateChange = Date.now();
    handle.activity = `Interrupted: ${reason}`;

    eventBus.emit({
      type: 'agent.interrupt',
      requestId: handle.sessionId,
      timestamp: Date.now(),
      data: {
        handleId: handle.id,
        agentId: handle.agentId,
        reason,
        previousState: oldState,
        userId: handle.userId,
      },
    });

    auditLog('interrupt', handle, { reason, previousState: oldState });
    logger.info('agent_interrupted', { handleId, agentId: handle.agentId, reason });

    // Set grace timer: if agent doesn't stop within grace period, force cancel
    const timer = setTimeout(() => {
      const current = handles.get(handleId);
      if (current && current.state === 'interrupted') {
        logger.warn('interrupt_grace_expired', { handleId, graceMs: interruptGraceMs });
        cancel(handleId, `Interrupt grace period expired (${reason})`);
      }
      interruptTimers.delete(handleId);
    }, interruptGraceMs);

    // Don't let the timer prevent process exit
    timer.unref?.();
    interruptTimers.set(handleId, timer);
  }

  function cancel(handleId: string, reason: string): void {
    const handle = handles.get(handleId);
    if (!handle) return;

    if (TERMINAL_STATES.has(handle.state)) return;

    // Clear any pending interrupt timer
    const timer = interruptTimers.get(handleId);
    if (timer) {
      clearTimeout(timer);
      interruptTimers.delete(handleId);
    }

    const oldState = handle.state;
    handle.state = 'canceled';
    handle.lastStateChange = Date.now();
    handle.activity = `Canceled: ${reason}`;

    emitStateEvent(handle, oldState, { reason });
    auditLog('cancel', handle, { reason, previousState: oldState });
    logger.info('agent_canceled', { handleId, agentId: handle.agentId, reason });
  }

  function complete(handleId: string, result?: string): void {
    const handle = handles.get(handleId);
    if (!handle) return;

    if (TERMINAL_STATES.has(handle.state)) return;

    // Clear any pending interrupt timer
    const timer = interruptTimers.get(handleId);
    if (timer) {
      clearTimeout(timer);
      interruptTimers.delete(handleId);
    }

    const oldState = handle.state;
    handle.state = 'completed';
    handle.lastStateChange = Date.now();
    handle.activity = result ?? 'Completed';

    emitStateEvent(handle, oldState, { result: result?.slice(0, 500) });
    auditLog('complete', handle);
    logger.info('agent_completed', { handleId, agentId: handle.agentId });
  }

  function fail(handleId: string, error: string): void {
    const handle = handles.get(handleId);
    if (!handle) return;

    if (TERMINAL_STATES.has(handle.state)) return;

    // Clear any pending interrupt timer
    const timer = interruptTimers.get(handleId);
    if (timer) {
      clearTimeout(timer);
      interruptTimers.delete(handleId);
    }

    const oldState = handle.state;
    handle.state = 'failed';
    handle.lastStateChange = Date.now();
    handle.activity = `Failed: ${error}`;

    emitStateEvent(handle, oldState, { error: error.slice(0, 1000) });
    auditLog('fail', handle, { error: error.slice(0, 500) });
    logger.info('agent_failed', { handleId, agentId: handle.agentId, error: error.slice(0, 200) });
  }

  function get(handleId: string): AgentHandle | undefined {
    return handles.get(handleId);
  }

  function remove(handleId: string): boolean {
    const handle = handles.get(handleId);
    if (!handle) return false;

    // Clear any pending interrupt timer
    const timer = interruptTimers.get(handleId);
    if (timer) {
      clearTimeout(timer);
      interruptTimers.delete(handleId);
    }

    handles.delete(handleId);
    logger.debug('agent_handle_removed', { handleId, agentId: handle.agentId });
    return true;
  }

  function all(): AgentHandle[] {
    return [...handles.values()];
  }

  function activeCount(): number {
    return [...handles.values()].filter(h => !TERMINAL_STATES.has(h.state)).length;
  }

  return {
    register,
    transition,
    interrupt,
    cancel,
    complete,
    fail,
    get,
    remove,
    all,
    activeCount,
  };
}
