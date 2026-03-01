# Agent Orchestration Architecture

**Date:** 2026-02-28
**Status:** Implementing

## Problem

AX can spawn agents and delegate tasks, but the current model is fire-and-forget: spawn a subprocess, wait for stdout, done. There's no way to:

1. **See what's running** — List all active agents scoped by user, session, or parent agent
2. **Inspect agent state** — Know what an agent is currently doing (thinking, calling tools, waiting for LLM, idle)
3. **Interrupt an agent** — Stop an agent that's gone off the rails without killing the whole session
4. **Agent-to-agent messaging** — Let agents talk to each other directly, not just via parent delegation

The existing `EventBus` handles real-time observability for LLM streaming. The `AgentRegistry` stores static metadata. The `delegation.ts` handler supports spawning subagents with depth/concurrency limits. But none of these pieces know about each other, and there's no unified runtime view of what's actually happening.

## Research Context

We studied:
- **OpenClaw's Agent Teams RFC** — team_create, shared task lists, mailbox messaging, plan approval workflows
- **Google A2A Protocol** — Agent Cards for discovery, task lifecycle states (submitted/working/input-required/completed/failed/canceled), JSON-RPC over HTTP, SSE streaming
- **Confluent's four event-driven patterns** — orchestrator-worker, hierarchical, blackboard, market-based
- **OpenAI Agents SDK** — lightweight handoff-based routines with explicit transfer functions
- **LangGraph** — graph-based state machines with durable execution and human-in-the-loop interrupts
- **Google Research findings** — flat topologies amplify errors 17.2x; centralized orchestrators contain them to 4.4x

## Design Principles

1. **Extend, don't replace.** The existing EventBus, AgentRegistry, and delegation handler are good foundations. We build on them.
2. **Hybrid topology.** High-level orchestrator for governance + direct peer messaging for speed. Not pure hierarchy, not pure mesh.
3. **Event-driven core.** The EventBus becomes the nervous system. Agent state changes, messages, interrupts — everything flows through events.
4. **A2A-inspired task lifecycle.** Agents progress through well-defined states. Transitions emit events. Observers react.
5. **Security preserved.** Agents still run in sandboxes. Messages between agents flow through the trusted host. No sandbox-to-sandbox leaks.

## Architecture

### Three New Modules

```
src/host/orchestration/
├── types.ts              — Shared orchestration types
├── agent-supervisor.ts   — Manages individual agent lifecycle + state
├── orchestrator.ts       — Central coordinator: routing, messaging, queries
└── agent-directory.ts    — Runtime agent discovery and scoping
```

### 1. Agent Supervisor (`agent-supervisor.ts`)

Manages the lifecycle of a single running agent. Tracks state transitions, handles interrupts, collects events.

**Agent States** (inspired by A2A task lifecycle):

```
spawning → running → [thinking | tool_calling | waiting_for_llm | delegating] → completed
                  ↘ interrupted → completed
                  ↘ failed
                  ↘ canceled
```

```typescript
type AgentState =
  | 'spawning'         // Sandbox process starting
  | 'running'          // Active, processing
  | 'thinking'         // LLM is generating (extended thinking)
  | 'tool_calling'     // Agent is executing a tool
  | 'waiting_for_llm'  // Waiting for LLM response
  | 'delegating'       // Spawned a subagent, waiting for result
  | 'interrupted'      // Human or system requested stop
  | 'completed'        // Finished successfully
  | 'failed'           // Crashed or errored
  | 'canceled';        // Explicitly canceled by user/parent

interface AgentHandle {
  /** Unique runtime ID for this agent execution (not the registry ID). */
  id: string;
  /** Registry agent ID (e.g. 'main', 'researcher'). */
  agentId: string;
  /** Agent type. */
  agentType: AgentType;
  /** Current lifecycle state. */
  state: AgentState;
  /** Parent handle ID (null for top-level agents). */
  parentId: string | null;
  /** Session this agent is serving. */
  sessionId: string;
  /** User who initiated this agent. */
  userId: string;
  /** When this agent was spawned. */
  startedAt: number;
  /** When the state last changed. */
  lastStateChange: number;
  /** Human-readable description of current activity. */
  activity: string;
  /** Metadata: model being used, tools available, etc. */
  metadata: Record<string, unknown>;
}
```

**Key operations:**

```typescript
interface AgentSupervisor {
  /** Register a new running agent. Returns a handle. */
  register(opts: AgentRegistration): AgentHandle;

  /** Update agent state. Emits agent.state event. */
  transition(handleId: string, state: AgentState, activity?: string): void;

  /** Send an interrupt signal. Agent should wind down gracefully. */
  interrupt(handleId: string, reason: string): void;

  /** Cancel an agent. Kills the process if still running. */
  cancel(handleId: string, reason: string): void;

  /** Mark agent as completed. Cleans up. */
  complete(handleId: string, result?: string): void;

  /** Mark agent as failed. */
  fail(handleId: string, error: string): void;

  /** Get current handle by ID. */
  get(handleId: string): AgentHandle | undefined;

  /** Remove handle (after completion/failure). */
  remove(handleId: string): void;
}
```

**How interrupts work:**

The host process controls the sandbox subprocess. When `interrupt()` is called:
1. State transitions to `'interrupted'`
2. An `agent.interrupt` event is emitted on the EventBus
3. The IPC heartbeat mechanism is used to send an interrupt signal to the agent
4. The agent has a grace period (configurable, default 10s) to finish current work
5. If the agent doesn't stop, the supervisor sends SIGTERM to the sandbox process
6. A final `agent.state` event is emitted with state `'canceled'`

### 2. Orchestrator (`orchestrator.ts`)

The central nervous system. Extends the EventBus with agent-aware routing and direct messaging.

```typescript
interface Orchestrator {
  /** The underlying event bus (unchanged interface). */
  readonly eventBus: EventBus;

  /** The agent supervisor. */
  readonly supervisor: AgentSupervisor;

  /** The agent directory. */
  readonly directory: AgentDirectory;

  /** Send a direct message from one agent to another. */
  send(from: string, to: string, message: AgentMessage): void;

  /** Broadcast a message to all agents in a scope. */
  broadcast(from: string, scope: MessageScope, message: AgentMessage): void;

  /** Subscribe to messages for a specific agent. */
  onMessage(handleId: string, listener: (msg: AgentMessage) => void): () => void;

  /** Query active agents with filters. */
  query(filter: AgentQuery): AgentHandle[];
}
```

**Agent Messages:**

```typescript
interface AgentMessage {
  /** Unique message ID. */
  id: string;
  /** Sender agent handle ID. */
  from: string;
  /** Recipient agent handle ID (or scope for broadcast). */
  to: string;
  /** Message type. */
  type: 'request' | 'response' | 'notification' | 'interrupt';
  /** Message payload. */
  payload: Record<string, unknown>;
  /** Timestamp. */
  timestamp: number;
  /** Optional: correlation ID for request/response pairs. */
  correlationId?: string;
}

type MessageScope =
  | { type: 'session'; sessionId: string }     // All agents in a session
  | { type: 'user'; userId: string }           // All agents for a user
  | { type: 'children'; parentId: string }     // All children of a parent
  | { type: 'all' };                           // All active agents (admin only)
```

**How messages flow:**

```
Agent A (sandbox)                    Host (trusted)                    Agent B (sandbox)
     │                                    │                                    │
     ├── IPC: agent_message ─────────────►│                                    │
     │   {to: handleB, payload: ...}      │                                    │
     │                                    ├── Validate message ────────────►   │
     │                                    ├── Emit agent.message event         │
     │                                    ├── Route to B's mailbox ───────────►│
     │                                    │   (IPC push or next-poll)          │
     │                                    │                                    │
```

Messages always flow through the host. No sandbox-to-sandbox communication.

### 3. Agent Directory (`agent-directory.ts`)

Runtime discovery and scoping. Think of it as the dynamic complement to the static AgentRegistry.

```typescript
interface AgentDirectory {
  /** List all active agents, optionally filtered. */
  list(filter?: AgentQuery): AgentHandle[];

  /** Find agents by session. */
  bySession(sessionId: string): AgentHandle[];

  /** Find agents by user. */
  byUser(userId: string): AgentHandle[];

  /** Find agents by parent (direct children only). */
  byParent(parentId: string): AgentHandle[];

  /** Get the full agent tree (parent + all descendants). */
  tree(rootId: string): AgentTree;

  /** Count active agents by scope. */
  count(scope?: MessageScope): number;
}

interface AgentQuery {
  sessionId?: string;
  userId?: string;
  parentId?: string;
  agentId?: string;
  state?: AgentState | AgentState[];
  agentType?: AgentType;
}

interface AgentTree {
  handle: AgentHandle;
  children: AgentTree[];
}
```

### New Event Types

All orchestration events flow through the existing EventBus:

```
agent.registered   — New agent handle created
agent.state        — State transition (includes old state, new state, activity)
agent.interrupt    — Interrupt signal sent to agent
agent.message      — Agent-to-agent message routed
agent.completed    — Agent finished (includes result summary)
agent.failed       — Agent crashed (includes error)
agent.canceled     — Agent explicitly canceled
```

### New IPC Actions

Added to `ipc-schemas.ts` for agent-side access:

```typescript
// Agent queries its own state and siblings
agent_status      — Get own handle or another agent's state
agent_list        — List sibling agents (same session/parent)

// Agent-to-agent messaging
agent_message     — Send a message to another agent
agent_poll        — Poll for incoming messages (pull-based, sandbox-safe)

// Agent signals
agent_interrupt   — Request interrupt of a child agent (depth-limited)
```

### Integration with Existing Code

**EventBus** — Unchanged interface. Orchestrator wraps it and adds agent-aware event types.

**AgentRegistry** — Still handles static agent metadata (capabilities, descriptions). The AgentDirectory handles runtime state. They compose: directory entries reference registry entries by `agentId`.

**Delegation handler** — Updated to register spawned agents with the Supervisor and track them in the Directory. The `onDelegate` callback now returns an AgentHandle instead of just a response string.

**server-completions.ts** — The `processCompletion` function registers the top-level agent with the Supervisor at spawn time and updates state transitions as the agent progresses. The EventBus emissions already in place (`completion.agent`, `llm.start`, etc.) continue to work — the Supervisor listens to them to auto-update agent state.

### How It All Fits Together

```
┌─────────────────────────────────────────────────────────┐
│                      Orchestrator                        │
│                                                          │
│  ┌──────────────┐  ┌───────────────┐  ┌──────────────┐ │
│  │  Agent        │  │   Event Bus   │  │   Agent      │ │
│  │  Supervisor   │──│  (existing)   │──│   Directory  │ │
│  │              │  │               │  │              │ │
│  │ - register   │  │ - emit        │  │ - list       │ │
│  │ - transition │  │ - subscribe   │  │ - bySession  │ │
│  │ - interrupt  │  │ - per-request │  │ - byUser     │ │
│  │ - cancel     │  │               │  │ - tree       │ │
│  └──────────────┘  └───────────────┘  └──────────────┘ │
│                           │                              │
│              ┌────────────┴────────────┐                │
│              │    Message Router       │                │
│              │  (agent-to-agent msgs   │                │
│              │   flow through host)    │                │
│              └─────────────────────────┘                │
└─────────────────────────────────────────────────────────┘
         │                    │                    │
    ┌────┴────┐         ┌────┴────┐         ┌────┴────┐
    │ Agent A │         │ Agent B │         │ Agent C │
    │(sandbox)│         │(sandbox)│         │(sandbox)│
    └─────────┘         └─────────┘         └─────────┘
```

## Files

| File | Action | Purpose |
|------|--------|---------|
| `src/host/orchestration/types.ts` | Create | Shared orchestration types |
| `src/host/orchestration/agent-supervisor.ts` | Create | Agent lifecycle + state management |
| `src/host/orchestration/orchestrator.ts` | Create | Central coordinator |
| `src/host/orchestration/agent-directory.ts` | Create | Runtime discovery + scoping |
| `src/ipc-schemas.ts` | Modify | Add orchestration IPC action schemas |
| `src/host/ipc-handlers/orchestration.ts` | Create | IPC handlers for orchestration actions |
| `tests/host/orchestration/agent-supervisor.test.ts` | Create | Supervisor tests |
| `tests/host/orchestration/orchestrator.test.ts` | Create | Orchestrator tests |
| `tests/host/orchestration/agent-directory.test.ts` | Create | Directory tests |

## Security Considerations

- **Messages are host-mediated.** Agents cannot bypass the host to send messages directly to another sandbox. This preserves the security boundary.
- **Interrupt signals are privileged.** Only parent agents (or the system) can interrupt child agents. Sibling agents cannot interrupt each other.
- **Message payloads are validated.** All agent messages go through Zod schema validation on the IPC boundary. Max payload sizes enforced.
- **No credential leaks.** Agent messages never contain credentials. The host strips any sensitive data before routing.
- **Audit trail.** All state transitions and messages are logged to the audit provider.
- **Scope enforcement.** Agents can only query/message agents within their visibility scope (same session, same parent tree). No cross-session leaks.
