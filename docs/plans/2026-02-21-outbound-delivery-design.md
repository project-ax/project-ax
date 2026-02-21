# Outbound Delivery for Cron & Heartbeat — Design

**Date:** 2026-02-21
**Status:** Draft

## Problem

When an agent is woken by heartbeat or cron, it produces a response that gets logged and discarded. There's no way for the agent to post proactively to a Slack channel, DM, or any other channel provider. This limits agents to purely reactive behavior — they can only respond to messages, never initiate them.

## Design Decisions

- **Job-level config only** — delivery target is set at job creation time (cron) or config time (heartbeat). Agents never get a runtime "send to channel" tool. The host owns all routing.
- **Resolution chain** — explicit target > `"last"` session > config default > discard.
- **Delivery modes** — `"channel"` (post to provider) and `"none"` (silent run). Webhook can be added later.
- **Unified mechanism** — same delivery pipeline for both cron and heartbeat.
- **Backend-agnostic stores** — `JobStore` and `SessionStore` interfaces. Phase 1 uses SQLite. Can swap to pg-boss, Postgres, Redis, etc. without touching delivery logic.
- **Stateless delivery path** — no in-memory maps. All state read from stores at fire time.

## Data Model

### CronDelivery Type

New type in `src/providers/scheduler/types.ts`:

```typescript
export interface CronDelivery {
  mode: 'channel' | 'none';
  target?: SessionAddress | 'last';
}
```

### CronJobDef Extension

```typescript
export interface CronJobDef {
  id: string;
  schedule: string;
  agentId: string;
  prompt: string;
  maxTokenBudget?: number;
  delivery?: CronDelivery;        // NEW
}
```

When `delivery` is omitted, behavior is identical to today (response discarded). Zero breaking changes.

### IPC Schema Extension

Extend `SchedulerAddCronSchema` in `src/ipc-schemas.ts`:

```typescript
export const SchedulerAddCronSchema = ipcAction('scheduler_add_cron', {
  schedule: safeString(100),
  prompt: safeString(10_000),
  maxTokenBudget: z.number().int().min(1).optional(),
  delivery: z.object({                              // NEW
    mode: z.enum(['channel', 'none']),
    target: z.union([
      z.literal('last'),
      z.object({
        provider: safeString(50),
        scope: z.enum(['dm', 'channel', 'thread', 'group']),
        identifiers: z.object({
          workspace: safeString(200).optional(),
          channel: safeString(200).optional(),
          thread: safeString(200).optional(),
          peer: safeString(200).optional(),
        }),
      }),
    ]).optional(),
  }).optional(),
});
```

### Heartbeat Config

In the scheduler config section of `Config`:

```typescript
heartbeat?: {
  interval_min?: number;
  active_hours?: { start: number; end: number };
  delivery?: CronDelivery;        // NEW — same type as cron
}
```

## Store Abstractions

### JobStore

Replaces the in-memory `Map<string, CronJobDef>` in the scheduler provider.

```typescript
export interface JobStore {
  get(jobId: string): CronJobDef | undefined;
  set(job: CronJobDef): void;
  delete(jobId: string): boolean;
  list(agentId?: string): CronJobDef[];
}
```

Phase 1: SQLite-backed. The scheduler provider takes a `JobStore` in its constructor instead of owning a `Map`.

### SessionStore

Tracks the most recent channel interaction per agent for `"last"` target resolution.

```typescript
export interface SessionStore {
  getLastChannelSession(agentId: string): SessionAddress | undefined;
  trackSession(agentId: string, session: SessionAddress): void;
}
```

Phase 1: SQLite table with upsert semantics:

```sql
CREATE TABLE IF NOT EXISTS last_sessions (
  agent_id    TEXT NOT NULL,
  provider    TEXT NOT NULL,
  scope       TEXT NOT NULL,
  identifiers TEXT NOT NULL,  -- JSON
  updated_at  INTEGER NOT NULL,
  PRIMARY KEY (agent_id)      -- one row per agent, upserted on each interaction
);
```

## Delivery Resolution

New file `src/host/delivery.ts`:

```typescript
export interface DeliveryResolution {
  mode: 'channel' | 'none';
  session?: SessionAddress;
  channelProvider?: ChannelProvider;
}

export function resolveDelivery(
  delivery: CronDelivery | undefined,
  deps: {
    sessionStore: SessionStore;
    agentId: string;
    defaultDelivery?: CronDelivery;
    channels: ChannelProvider[];
  },
): DeliveryResolution
```

Resolution logic:

1. No delivery config → `{ mode: 'none' }` (backward compat)
2. `mode: 'none'` → `{ mode: 'none' }` (explicit silent run)
3. `mode: 'channel'`, target is a `SessionAddress` → validate provider exists, return it
4. `mode: 'channel'`, target is `'last'` → call `deps.sessionStore.getLastChannelSession(agentId)`, fall back gracefully if none
5. `mode: 'channel'`, no target → try `deps.defaultDelivery`, then fall back to none

## Session Tracking

One-line addition to the existing channel message handler in `server.ts`:

```typescript
// After processing a channel message (existing flow):
conversationStore.append(sessionId, 'user', content, userId);
conversationStore.append(sessionId, 'assistant', outbound.content);
sessionStore.trackSession(agentId, msg.session);  // NEW
```

Only real channel interactions are tracked. Scheduler sessions (`provider: 'scheduler'`) are excluded — they aren't valid delivery targets.

## Server Integration

Two touch points in `src/host/server.ts`:

### Cron Handler

```typescript
// Current: response discarded
const { responseContent } = await processCompletion(...);
logger.info('scheduler_message_processed', { contentLength: responseContent.length });

// New: resolve delivery and send
const { responseContent } = await processCompletion(...);
if (responseContent.trim()) {
  const resolution = resolveDelivery(job.delivery, {
    sessionStore,
    agentId: job.agentId,
    defaultDelivery: config.scheduler?.defaultDelivery,
    channels: providers.channels,
  });
  if (resolution.mode === 'channel' && resolution.session && resolution.channelProvider) {
    const outbound = await router.processOutbound(responseContent, sessionId, canaryToken);
    if (!outbound.canaryLeaked) {
      await resolution.channelProvider.send(resolution.session, { content: outbound.content });
    }
  }
}
logger.info('scheduler_message_processed', {
  contentLength: responseContent.length,
  delivered: resolution.mode,
});
```

### Heartbeat Handler

Same pattern, reads delivery config from `config.scheduler.heartbeat.delivery` instead of per-job.

### What Doesn't Change

- Agent sandbox (no new IPC tools)
- Router (`processInbound`/`processOutbound` unchanged)
- Channel providers (`send()` interface unchanged)
- Existing channel message flow (untouched)

## Security

### Agent Isolation Preserved

- Agent still has no `channel_send` IPC tool — can't send at runtime
- Agent doesn't know whether its output gets delivered or discarded
- Delivery is transparent — a host-side concern only

### Validation at Job Creation

In the IPC handler, before persisting a cron job:

- `target.provider` must match a registered channel provider name
- If scope is `'channel'`, identifiers must include a channel ID
- If scope is `'dm'`, must include a peer ID
- Reject malformed or unknown providers

### Output Scanning

Response passes through `router.processOutbound()` (canary check + output scanning) before delivery. Same security pipeline as regular channel responses.

### "Last" Resolution

Resolved host-side only from the `SessionStore`. Agent can't influence which session gets resolved.

## Error Handling

- **Delivery failure** (Slack down, channel deleted, bot removed): log error with full context (job ID, target, error message). Don't retry — cron fires again on next schedule.
- **No valid target** (e.g., `"last"` but agent has no channel history): log warning, discard response. Not an error.
- **Agent response is always logged** regardless of delivery success/failure.
- **Audit trail** records: job fired → agent responded → delivery attempted → delivery succeeded/failed.

## Phasing

### Phase 1: Delivery Pipeline + SQLite Stores

- Add `CronDelivery` type and IPC schema extension
- Implement `JobStore` (SQLite) — replace in-memory `Map` in scheduler
- Implement `SessionStore` (SQLite) — new table for last-session tracking
- Implement `resolveDelivery()` in `src/host/delivery.ts`
- Wire into server.ts cron and heartbeat handlers
- Add session tracking to channel message handler

### Phase 2: Backend Migration

- Swap `JobStore` implementation to pg-boss, Postgres, or other backend
- Swap `SessionStore` implementation to Postgres
- Move `ConversationStore` to Postgres
- No changes to delivery logic — interfaces are the same

## Data Flow

```
1. AGENT creates cron job (during a Slack conversation)
   ── scheduler_add_cron IPC ──►
   { schedule: "0 9 * * 1", prompt: "Weekly summary",
     delivery: { mode: "channel", target: "last" } }

2. HOST validates & persists
   ── IPC handler ──► jobStore.set(job)

3. TIMER fires (Monday 9am)
   ── scheduler checks cron ──► match found

4. HOST resolves delivery target
   ── resolveDelivery() ──►
   target: "last" → sessionStore.getLastChannelSession(agentId)
   → { provider: "slack", scope: "channel",
       identifiers: { channel: "C0123" } }

5. HOST spawns agent
   ── processCompletion() ──► agent runs with prompt "Weekly summary"

6. AGENT responds
   ── stdout ──► "Here's your weekly summary: ..."

7. HOST scans output
   ── router.processOutbound() ──► canary check, output scan

8. HOST delivers
   ── channelProvider.send(resolvedSession, { content })
   ──► Slack posts to #C0123

9. HOST logs
   ── logger.info('cron_delivered', { jobId, target, contentLength })
```

For heartbeat: identical flow, delivery config comes from `config.scheduler.heartbeat.delivery`.

For silent cron: `delivery: { mode: "none" }` — steps 4 and 8 are skipped, agent runs for side effects only (memory updates, state changes).
