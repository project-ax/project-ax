# Taint Propagation System

## Context

AX has a session-scoped taint budget that blocks sensitive IPC actions when the ratio of external content exceeds a profile threshold. But taint is NOT propagated to persistent artifacts. This creates a laundering gap:

1. Session A fetches external web content (tainted), writes it to memory (taint lost)
2. Session B reads that memory entry (treated as clean), takes a sensitive action (bypasses budget)

The fix: structural taint propagation where taint metadata follows content across all persistence boundaries, and re-enters the taint budget when that content is later read.

---

## Design

### Core Mechanism: SessionTaintTracker

A host-side component that records which IPC actions in a session produced tainted content. The host already sees all IPC traffic. When `web_fetch` returns, the host knows the session is tainted. When the agent later calls `memory_write`, the host attaches a `TaintTag` automatically — no agent trust required.

### Three Propagation Paths

**Path 1: Memory** (host-side, in IPC handler)
```
web_fetch → tracker records session taint → memory_write → host attaches TaintTag
memory_read in new session → host feeds tainted content back into TaintBudget
```

**Path 2: Workspace files** (host-side, pre/post agent)
```
Agent runs in tainted session → writes files via local tools (host can't intercept)
After agent exits → host scans for new/modified files → marks them in .ax-taint.json
New session on same workspace → host pre-seeds TaintBudget from registry
```

**Path 3: Conversation history** (host-side, at memorize)
```
Tainted session produces assistant response → host marks turn with taint
memorize() extracts facts → facts inherit taint from source turns
```

---

## Implementation

### Phase 1: SessionTaintTracker

**New file: `src/taint-tracker.ts`** (~70 LOC)

```typescript
interface TaintSource {
  action: string;          // 'web_fetch', 'web_search', 'browser_snapshot'
  timestamp: Date;
  details?: string;        // e.g., URL fetched
}

const TAINT_PRODUCING_ACTIONS = new Set([
  'web_fetch', 'web_search', 'browser_navigate', 'browser_snapshot',
]);
```

- `recordTaintSource(sessionId, action, details?)` — called after taint-producing IPC actions succeed
- `isTainted(sessionId): boolean` — checks if session has any taint sources
- `getTaintTag(sessionId): TaintTag | undefined` — builds a TaintTag from the most recent source
- `endSession(sessionId)` — cleanup
- Static `isTaintProducing(action): boolean`

### Phase 2: IPC Handler Taint Propagation

**Modify: `src/ipc.ts`**

Add `taintTracker` to `IPCHandlerOptions`:

```typescript
export interface IPCHandlerOptions {
  taintBudget?: TaintBudget;
  taintTracker?: SessionTaintTracker;  // NEW
  delegation?: DelegationConfig;
  onDelegate?: (...) => Promise<string>;
}
```

Modify 5 handlers:

1. **`web_fetch` (line 86)** — after provider returns, call `taintTracker.recordTaintSource()` and `taintBudget.recordContent(sessionId, result.body, true)`

2. **`web_search` (line 91)** — same: record taint source, record content from snippets as tainted

3. **`memory_write` (line 63)** — if `taintTracker.isTainted(sessionId)`, build a `MemoryEntry` with `taint: taintTracker.getTaintTag(sessionId)` before passing to `providers.memory.write()`. Audit-log `taint_propagated`.

4. **`memory_query` (line 68)** — after provider returns results, iterate entries: if `entry.taint?.trust === 'external'`, call `taintBudget.recordContent(sessionId, entry.content, true)` and `taintTracker.recordTaintSource(sessionId, 'memory_read_tainted', entry.taint.source)`. Otherwise record as untainted.

5. **`memory_read` (line 72)** — same pattern: if returned entry has external taint, feed it back into the taint budget and tracker.

Also: `browser_snapshot` (line 106) — record taint source after snapshot returns.

### Phase 3: Workspace Taint Registry

**New file: `src/workspace-taint.ts`** (~60 LOC)

JSON sidecar (`.ax-taint.json`) in each persistent workspace directory.

```typescript
interface WorkspaceTaintEntry {
  path: string;           // relative path within workspace
  taint: TaintTag;
  sessionId: string;
  writtenAt: string;      // ISO timestamp
}
```

- `readWorkspaceTaint(workspaceDir): WorkspaceTaintEntry[]`
- `markFileTainted(workspaceDir, relativePath, taint, sessionId)`
- `scanNewFiles(workspaceDir, since: Date): string[]` — returns relative paths of files modified after `since`

Why JSON sidecar: xattrs are platform-specific, invisible in Docker, and have size limits. JSON is portable, inspectable, and sandbox-safe.

### Phase 4: Server Integration

**Modify: `src/server.ts`**

In `createServer()` (around line 100):
```typescript
const taintTracker = new SessionTaintTracker();
const handleIPC = createIPCHandler(providers, { taintBudget, taintTracker });
```

In `processCompletion()`:

a) **Before agent spawn** (after workspace creation, ~line 307): if persistent workspace, read `.ax-taint.json` and pre-seed `taintBudget` with estimated tokens from tainted files.

b) **Track agent start time** (~line 355): `const agentStartTime = new Date()` before `providers.sandbox.spawn()`.

c) **After agent exit, before memorize** (~line 424): if persistent workspace and `taintTracker.isTainted(sessionId)`, scan workspace for files modified since `agentStartTime` and mark them tainted in the registry.

d) **In memorize() call** (~line 425): annotate assistant turns with taint if session was tainted:
```typescript
const fullHistory = [
  ...clientMessages.map(m => ({
    role: m.role, content: m.content,
  })),
  {
    role: 'assistant',
    content: outbound.content,
    taint: taintTracker.isTainted(sessionId)
      ? taintTracker.getTaintTag(sessionId)
      : undefined,
  },
];
```

e) **Cleanup** (finally block): `taintTracker.endSession(sessionId)`.

### Phase 5: MemU Taint Propagation

**Modify: `src/providers/types.ts`** — add `taint?: TaintTag` to `ConversationTurn`

**Modify: `src/providers/memory/memu.ts`** — in `extractFacts()`, propagate taint from the source turn to the extracted fact's `MemoryEntry`. The fact includes `extractedFrom` (a snippet of the source turn) — use that to find the source turn and inherit its taint.

### Phase 6: Schema Cleanup

**Modify: `src/ipc-schemas.ts`** — remove `tainted: z.boolean().optional()` from `MemoryWriteSchema`. The agent must NOT be able to declare taint status. All taint decisions are host-side.

### Phase 7: TaintBudget Extension

**Modify: `src/taint-budget.ts`** — export `estimateTokens()` (currently private) so `workspace-taint.ts` and `server.ts` can use it for pre-seeding. No other changes needed — `recordContent()` already handles the budget accounting.

---

## Edge Cases

| Scenario | Behavior |
|---|---|
| `memory_write` before `web_fetch` in same session | Entry is untainted (tracker has no sources yet) |
| Mixed clean + tainted content in one `memory_write` | Entire entry marked tainted (conservative) |
| Agent launders through local file chain (fetch → write_file → read_file → memory_write) | Session is tainted from fetch, so memory_write inherits taint |
| Delegation: child fetches external content | Child session taint propagates to parent via shared `sessionId` in `IPCContext` |
| Old memory entries without taint field | Treated as clean (backward compatible) |
| Ephemeral (non-persistent) workspace | No `.ax-taint.json` needed — workspace deleted after session |
| Taint decay over time | No. Explicit user action required (future: `ax taint clear <id>`) |

---

## Files Changed

| File | Change |
|---|---|
| `src/taint-tracker.ts` | **NEW** — SessionTaintTracker class |
| `src/workspace-taint.ts` | **NEW** — JSON sidecar registry |
| `src/ipc.ts` | Modify 6 handlers + add taintTracker to options |
| `src/server.ts` | Create tracker, pre-seed workspace taint, post-scan workspace, annotate memorize turns |
| `src/taint-budget.ts` | Export `estimateTokens()` |
| `src/providers/types.ts` | Add `taint?: TaintTag` to `ConversationTurn` |
| `src/providers/memory/memu.ts` | Propagate taint from turns to extracted facts |
| `src/ipc-schemas.ts` | Remove unused `tainted` boolean from MemoryWriteSchema |
| `tests/taint-tracker.test.ts` | **NEW** — ~15 tests |
| `tests/workspace-taint.test.ts` | **NEW** — ~10 tests |
| `tests/integration/taint-propagation.test.ts` | **NEW** — ~20 tests |

---

## Verification

1. `npm test` — all existing tests pass (no regressions)
2. New unit tests: taint-tracker, workspace-taint
3. Integration test: web_fetch → memory_write → new session memory_read → verify taint budget blocks sensitive action
4. Integration test: persistent workspace with web_fetch → verify `.ax-taint.json` has entries → new session pre-seeded
5. Integration test: memorize() with tainted session → verify extracted facts carry taint tags
6. Backward compat: existing memory entries without taint → read as clean, no budget impact
7. Schema test: verify `memory_write` IPC request with `tainted` field is now rejected (strict schema)
