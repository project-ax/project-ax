# Repository Restructure Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Restructure src/ into host/, agent/, providers/ zones with co-located types so the trust boundary and architecture are visible from the directory tree.

**Architecture:** Mechanical file moves + import updates. No logic changes. Existing tests are the verification.

**Tech Stack:** TypeScript, git mv (preserve history), vitest

**Design doc:** `docs/plans/2026-02-10-repo-restructure-design.md`

---

### Task 1: Create directory structure

**Files:**
- Create: `src/host/` directory
- Create: `src/agent/runners/` directory (will exist after git mv in Task 3)

**Step 1: Create host directory**
```bash
mkdir -p src/host
```

**Step 2: Verify**
```bash
ls src/host/
```
Expected: empty directory exists

**Step 3: Commit**
```bash
git add src/host
git commit -m "chore: create host/ directory for trusted-process code"
```

---

### Task 2: Move host-side files into src/host/

These files run in the trusted host process. Move them with `git mv` to preserve history.

**Files to move:**
| Before | After |
|--------|-------|
| `src/server.ts` | `src/host/server.ts` |
| `src/router.ts` | `src/host/router.ts` |
| `src/ipc.ts` | `src/host/ipc-server.ts` |
| `src/anthropic-proxy.ts` | `src/host/proxy.ts` |
| `src/taint-budget.ts` | `src/host/taint-budget.ts` |
| `src/registry.ts` | `src/host/registry.ts` |
| `src/provider-map.ts` | `src/host/provider-map.ts` |
| `src/oauth.ts` | `src/host/oauth.ts` |

**Step 1: Move files with git mv**
```bash
git mv src/server.ts src/host/server.ts
git mv src/router.ts src/host/router.ts
git mv src/ipc.ts src/host/ipc-server.ts
git mv src/anthropic-proxy.ts src/host/proxy.ts
git mv src/taint-budget.ts src/host/taint-budget.ts
git mv src/registry.ts src/host/registry.ts
git mv src/provider-map.ts src/host/provider-map.ts
git mv src/oauth.ts src/host/oauth.ts
```

**Step 2: Update imports INSIDE the moved files**

These files used `./foo.js` to reference peers and shared files. Now they're one level deeper, so:
- Peer references (moved files referencing each other): stay `./` since they're in the same directory
- Shared file references: `./config.js` → `../config.js`, `./db.js` → `../db.js`, etc.
- Provider references: `./providers/` → `../providers/`

Files and their import changes:

**`src/host/server.ts`** (was `src/server.ts`):
- `./paths.js` → `../paths.js`
- `./providers/types.js` → `../providers/types.js`  *(will change again in Task 5)*
- `./db.js` → `../db.js`
- `./config.js` → `../config.js`
- `./logger.js` → `../logger.js`
- `./registry.js` → `./registry.js` (same dir, no change)
- `./router.js` → `./router.js` (same dir, no change)
- `./ipc.js` → `./ipc-server.js` (renamed)
- `./taint-budget.js` → `./taint-budget.js` (same dir, no change)
- `./anthropic-proxy.js` → `./proxy.js` (renamed)

**`src/host/router.ts`** (was `src/router.ts`):
- `./providers/types.js` → `../providers/types.js`
- `./taint-budget.js` → `./taint-budget.js` (same dir, no change)
- `./db.js` → `../db.js` (if referenced)

**`src/host/ipc-server.ts`** (was `src/ipc.ts`):
- `./ipc-schemas.js` → `../ipc-schemas.js`
- `./providers/types.js` → `../providers/types.js`
- `./taint-budget.js` → `./taint-budget.js` (same dir, no change)
- `./logger.js` → `../logger.js`

**`src/host/proxy.ts`** (was `src/anthropic-proxy.ts`):
- `./logger.js` → `../logger.js` (if referenced)

**`src/host/taint-budget.ts`** (was `src/taint-budget.ts`):
- No external imports from moved files typically

**`src/host/registry.ts`** (was `src/registry.ts`):
- `./provider-map.js` → `./provider-map.js` (same dir, no change)
- `./providers/types.js` → `../providers/types.js`

**`src/host/provider-map.ts`** (was `src/provider-map.ts`):
- `./providers/` → `../providers/` in all PROVIDER_MAP path values

**`src/host/oauth.ts`** (was `src/oauth.ts`):
- Check for any `./` imports that need `../` prefix

**Step 3: Update imports in files that reference the moved files**

These files import from the old locations and need updating:

**`src/host/server.ts`** references peers — already handled in Step 2.

**`src/cli/index.ts`**:
- If it imports from `../server.js` → `../host/server.js`
- If it imports from `../registry.js` → `../host/registry.js`

**`src/onboarding/configure.ts`**:
- If it imports from `../oauth.js` → `../host/oauth.js`

**`src/dotenv.ts`**:
- If it imports from `./oauth.js` → `./host/oauth.js`

**`src/config.ts`**:
- Check for any refs to moved files

**`src/host.ts`** (entry point):
- Only imports from `./cli/index.js` — no change needed

**Step 4: Build check**
```bash
npx tsc --noEmit
```
Fix any remaining import errors.

**Step 5: Run tests**
```bash
npx vitest run 2>&1 | tail -5
```
Expected: All tests pass (some test imports will need updating — fix any failures)

**Step 6: Update test imports that reference moved files**

Tests that import from old paths:

| Test file | Old import | New import |
|-----------|-----------|------------|
| `tests/server.test.ts` | `../src/server.js` | `../src/host/server.js` |
| `tests/router.test.ts` | `../src/router.js` | `../src/host/router.js` |
| `tests/ipc.test.ts` | `../src/ipc.js` | `../src/host/ipc-server.js` |
| `tests/anthropic-proxy.test.ts` | `../src/anthropic-proxy.js` | `../src/host/proxy.js` |
| `tests/taint-budget.test.ts` | `../src/taint-budget.js` | `../src/host/taint-budget.js` |
| `tests/registry.test.ts` | `../src/registry.js` | `../src/host/registry.js` |
| `tests/provider-map.test.ts` | `../src/provider-map.js` | `../src/host/provider-map.js` |
| `tests/oauth.test.ts` | `../src/oauth.js` | `../src/host/oauth.js` |
| `tests/ipc-delegation.test.ts` | `../src/ipc.js` | `../src/host/ipc-server.js` |
| `tests/sandbox-isolation.test.ts` | Various refs to moved files |
| `tests/integration/phase1.test.ts` | `../../src/router.js` → `../../src/host/router.js`, `../../src/taint-budget.js` → `../../src/host/taint-budget.js` |
| `tests/integration/e2e.test.ts` | `../../src/router.js` → `../../src/host/router.js`, `../../src/ipc.js` → `../../src/host/ipc-server.js` |
| `tests/container/agents/claude-code.test.ts` | `../../../src/anthropic-proxy.js` → `../../../src/host/proxy.js` |
| `tests/container/agents/pi-session.test.ts` | `../../../src/anthropic-proxy.js` → `../../../src/host/proxy.js` |

**Step 7: Re-run tests**
```bash
npx vitest run 2>&1 | tail -5
```
Expected: All pass

**Step 8: Commit**
```bash
git add -A
git commit -m "refactor: move host-side files into src/host/"
```

---

### Task 3: Rename container/ to agent/

**Files to move:**
| Before | After |
|--------|-------|
| `src/container/agent-runner.ts` | `src/agent/runner.ts` |
| `src/container/ipc-client.ts` | `src/agent/ipc-client.ts` |
| `src/container/ipc-transport.ts` | `src/agent/ipc-transport.ts` |
| `src/container/local-tools.ts` | `src/agent/local-tools.ts` |
| `src/container/ipc-tools.ts` | `src/agent/ipc-tools.ts` |
| `src/container/ipc-mcp-server.ts` | `src/agent/mcp-server.ts` |
| `src/container/tcp-bridge.ts` | `src/agent/tcp-bridge.ts` |
| `src/container/agents/pi-session.ts` | `src/agent/runners/pi-session.ts` |
| `src/container/agents/claude-code.ts` | `src/agent/runners/claude-code.ts` |

**Step 1: Create agent directory and move files**
```bash
mkdir -p src/agent/runners
git mv src/container/agent-runner.ts src/agent/runner.ts
git mv src/container/ipc-client.ts src/agent/ipc-client.ts
git mv src/container/ipc-transport.ts src/agent/ipc-transport.ts
git mv src/container/local-tools.ts src/agent/local-tools.ts
git mv src/container/ipc-tools.ts src/agent/ipc-tools.ts
git mv src/container/ipc-mcp-server.ts src/agent/mcp-server.ts
git mv src/container/tcp-bridge.ts src/agent/tcp-bridge.ts
git mv src/container/agents/pi-session.ts src/agent/runners/pi-session.ts
git mv src/container/agents/claude-code.ts src/agent/runners/claude-code.ts
```

Then clean up empty old directories:
```bash
rm -rf src/container
```

**Step 2: Update imports INSIDE agent/ files**

Internal references between agent files stay the same (they're in the same relative structure), EXCEPT:

**`src/agent/runner.ts`** (was `agent-runner.ts`):
- `./ipc-client.js` → stays `./ipc-client.js`
- `./ipc-transport.js` → stays `./ipc-transport.js`
- `./ipc-tools.js` → stays `./ipc-tools.js`
- `../logger.js` → stays `../logger.js`

**`src/agent/runners/pi-session.ts`** (was `container/agents/pi-session.ts`):
- `../ipc-client.js` → stays `../ipc-client.js`
- `../agent-runner.js` → `../runner.js` (RENAMED)
- `../../logger.js` → stays `../../logger.js`

**`src/agent/runners/claude-code.ts`** (was `container/agents/claude-code.ts`):
- Check all relative imports

**`src/agent/mcp-server.ts`** (was `ipc-mcp-server.ts`):
- `./ipc-client.js` → stays `./ipc-client.js`

**Step 3: Update imports in files OUTSIDE agent/ that reference it**

**`src/host/server.ts`**:
- Any reference to `./container/` should now be `../agent/` or just the spawn command string
- Check for `container/agent-runner` in spawn command strings (these are runtime paths, may reference dist/)

**Step 4: Update test imports**

| Test file | Old import path | New import path |
|-----------|----------------|-----------------|
| `tests/container/agent-runner.test.ts` | `../../src/container/agent-runner.js` | `../../src/agent/runner.js` |
| `tests/container/agent-session.test.ts` | `../../src/container/agent-runner.js` | `../../src/agent/runner.js` |
| `tests/container/agent-session.test.ts` | `../../src/container/ipc-client.js` | `../../src/agent/ipc-client.js` |
| `tests/container/ipc-client.test.ts` | `../../src/container/ipc-client.js` | `../../src/agent/ipc-client.js` |
| `tests/container/ipc-transport.test.ts` | `../../src/container/ipc-transport.js` | `../../src/agent/ipc-transport.js` |
| `tests/container/ipc-transport.test.ts` | `../../src/container/ipc-client.js` | `../../src/agent/ipc-client.js` |
| `tests/container/ipc-mcp-server.test.ts` | `../../src/container/ipc-mcp-server.js` | `../../src/agent/mcp-server.js` |
| `tests/container/ipc-mcp-server.test.ts` | `../../src/container/ipc-client.js` | `../../src/agent/ipc-client.js` |
| `tests/container/local-tools.test.ts` | `../../src/container/local-tools.js` | `../../src/agent/local-tools.js` |
| `tests/container/ipc-tools.test.ts` | `../../src/container/ipc-tools.js` | `../../src/agent/ipc-tools.js` |
| `tests/container/tcp-bridge.test.ts` | `../../src/container/tcp-bridge.js` | `../../src/agent/tcp-bridge.js` |
| `tests/container/agents/dispatch.test.ts` | `../../../src/container/agent-runner.js` | `../../../src/agent/runner.js` |
| `tests/container/agents/pi-session.test.ts` | (check all imports) |
| `tests/container/agents/claude-code.test.ts` | (check all imports) |
| `tests/sandbox-isolation.test.ts` | `../src/container/ipc-mcp-server.js` → `../src/agent/mcp-server.js`, `../src/container/ipc-client.js` → `../src/agent/ipc-client.js` |

**Step 5: Build check + test**
```bash
npx tsc --noEmit && npx vitest run 2>&1 | tail -5
```

**Step 6: Commit**
```bash
git add -A
git commit -m "refactor: rename container/ to agent/, drop redundant prefixes"
```

---

### Task 4: Rename host.ts → main.ts

**Step 1: Rename**
```bash
git mv src/host.ts src/main.ts
```

**Step 2: Update package.json if needed**
Check if any scripts reference `src/host.ts`. The entry point is `src/cli/index.ts` (via `bin/ax.js`), so `host.ts` is just a legacy redirect — the rename is cosmetic. No script changes needed.

**Step 3: Commit**
```bash
git add -A
git commit -m "refactor: rename host.ts to main.ts"
```

---

### Task 5: Split providers/types.ts into co-located types

This is the most import-intensive change. The monolithic `src/providers/types.ts` (376 lines) splits into:
- `src/types.ts` — shared cross-cutting types
- `src/providers/<category>/types.ts` — per-provider types

**Step 1: Create src/types.ts with shared types**

Extract from `src/providers/types.ts`:
- `ContentBlock`, `Message`, `TaintTag` (used by host, agent, AND multiple provider categories)
- `Config`, `ProviderRegistry`, `AgentType` (used by host, config, onboarding)

```typescript
// src/types.ts — Cross-cutting types shared between host, agent, and providers

import type { ProfileName } from './onboarding/prompts.js';

// Message types (used by host, agent, and LLM/channel providers)
export type ContentBlock =
  | { type: 'text'; text: string }
  | { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> }
  | { type: 'tool_result'; tool_use_id: string; content: string };

export interface Message {
  role: 'user' | 'assistant' | 'system';
  content: string | ContentBlock[];
}

// Taint tracking (used everywhere)
export interface TaintTag {
  source: string;
  trust: 'user' | 'external' | 'system';
  timestamp: Date;
}

// Agent types
export type AgentType = 'pi-agent-core' | 'pi-coding-agent' | 'claude-code';

// Config (used by host, providers, onboarding)
export interface Config {
  agent?: AgentType;
  max_tokens?: number;
  profile: ProfileName;
  providers: {
    llm: string;
    memory: string;
    scanner: string;
    channels: string[];
    web: string;
    browser: string;
    credentials: string;
    skills: string;
    audit: string;
    sandbox: string;
    scheduler: string;
    skillScreener?: string;
  };
  sandbox: {
    timeout_sec: number;
    memory_mb: number;
  };
  scheduler: {
    active_hours: {
      start: string;
      end: string;
      timezone: string;
    };
    max_token_budget: number;
    heartbeat_interval_min: number;
    proactive_hint_confidence_threshold?: number;
    proactive_hint_cooldown_sec?: number;
  };
}

// Provider registry (used by host to assemble providers)
// Imports the provider interfaces from their co-located types
import type { LLMProvider } from './providers/llm/types.js';
import type { MemoryProvider } from './providers/memory/types.js';
import type { ScannerProvider } from './providers/scanner/types.js';
import type { ChannelProvider } from './providers/channel/types.js';
import type { WebProvider } from './providers/web/types.js';
import type { BrowserProvider } from './providers/browser/types.js';
import type { CredentialProvider } from './providers/credentials/types.js';
import type { SkillStoreProvider } from './providers/skills/types.js';
import type { AuditProvider } from './providers/audit/types.js';
import type { SandboxProvider } from './providers/sandbox/types.js';
import type { SchedulerProvider } from './providers/scheduler/types.js';
import type { SkillScreenerProvider } from './providers/skills/types.js';

export interface ProviderRegistry {
  llm: LLMProvider;
  memory: MemoryProvider;
  scanner: ScannerProvider;
  channels: ChannelProvider[];
  web: WebProvider;
  browser: BrowserProvider;
  credentials: CredentialProvider;
  skills: SkillStoreProvider;
  audit: AuditProvider;
  sandbox: SandboxProvider;
  scheduler: SchedulerProvider;
  skillScreener?: SkillScreenerProvider;
}
```

**Step 2: Create per-provider types.ts files**

Each file gets the types relevant to its category. They import `TaintTag` and `Config` from `../../types.js`.

Create these 11 files:

**`src/providers/llm/types.ts`:**
```typescript
import type { ContentBlock, Message, TaintTag } from '../../types.js';
export type { ContentBlock, Message, TaintTag };

export interface ToolDef { name: string; description: string; parameters: Record<string, unknown>; }
export interface ChatRequest { model: string; messages: Message[]; tools?: ToolDef[]; maxTokens?: number; stream?: boolean; }
export interface ChatChunk { type: 'text' | 'tool_use' | 'done'; content?: string; toolCall?: { id: string; name: string; args: Record<string, unknown> }; usage?: { inputTokens: number; outputTokens: number }; }
export interface LLMProvider { name: string; chat(req: ChatRequest): AsyncIterable<ChatChunk>; models(): Promise<string[]>; }
```

**`src/providers/memory/types.ts`:**
```typescript
import type { TaintTag } from '../../types.js';
export type { TaintTag };

export interface MemoryEntry { id?: string; scope: string; content: string; tags?: string[]; taint?: TaintTag; createdAt?: Date; }
export interface MemoryQuery { scope: string; query?: string; limit?: number; tags?: string[]; }
export interface ConversationTurn { role: 'user' | 'assistant'; content: string; }
export interface ProactiveHint { source: 'memory' | 'pattern' | 'trigger'; kind: 'pending_task' | 'temporal_pattern' | 'follow_up' | 'anomaly' | 'custom'; reason: string; suggestedPrompt: string; confidence: number; scope: string; memoryId?: string; cooldownMinutes?: number; }
export interface MemoryProvider {
  write(entry: MemoryEntry): Promise<string>;
  query(q: MemoryQuery): Promise<MemoryEntry[]>;
  read(id: string): Promise<MemoryEntry | null>;
  delete(id: string): Promise<void>;
  list(scope: string, limit?: number): Promise<MemoryEntry[]>;
  memorize?(conversation: ConversationTurn[]): Promise<void>;
  onProactiveHint?(handler: (hint: ProactiveHint) => void): void;
}
```

(Continue this pattern for all 11 categories — scanner, channel, web, browser, credentials, skills, audit, sandbox, scheduler)

**NOTE:** `ProactiveHint` is used by both memory and scheduler providers. Put it in `memory/types.ts` (origin) and import it from there in `scheduler/types.ts`.

**Step 3: Update all imports from `providers/types.js`**

Every file that imports from `../types.js` (inside providers/) or `./providers/types.js` (from src root) or `../../src/providers/types.js` (from tests) needs updating.

**Provider implementation files** (30+ files): Change `from '../types.js'` to `from './types.js'` (types are now co-located).

**Host files** (in `src/host/`): Change `from '../providers/types.js'` to `from '../types.js'` for shared types (Config, ProviderRegistry) or specific provider types from their co-located location.

**Test files**: Change `from '../../src/providers/types.js'` to import from the specific provider types or from `../../src/types.js`.

**Step 4: Delete old `src/providers/types.ts`**

**Step 5: Build check + test**
```bash
npx tsc --noEmit && npx vitest run 2>&1 | tail -5
```

**Step 6: Commit**
```bash
git add -A
git commit -m "refactor: split providers/types.ts into co-located per-provider types"
```

---

### Task 6: Move test files to mirror source structure

**Step 1: Move host-side tests**
```bash
mkdir -p tests/host
git mv tests/server.test.ts tests/host/server.test.ts
git mv tests/router.test.ts tests/host/router.test.ts
git mv tests/ipc.test.ts tests/host/ipc-server.test.ts
git mv tests/anthropic-proxy.test.ts tests/host/proxy.test.ts
git mv tests/taint-budget.test.ts tests/host/taint-budget.test.ts
git mv tests/registry.test.ts tests/host/registry.test.ts
git mv tests/provider-map.test.ts tests/host/provider-map.test.ts
git mv tests/oauth.test.ts tests/host/oauth.test.ts
git mv tests/ipc-delegation.test.ts tests/host/ipc-delegation.test.ts
```

**Step 2: Move agent tests**
```bash
mkdir -p tests/agent/runners
git mv tests/container/agent-runner.test.ts tests/agent/runner.test.ts
git mv tests/container/agent-session.test.ts tests/agent/session.test.ts
git mv tests/container/ipc-client.test.ts tests/agent/ipc-client.test.ts
git mv tests/container/ipc-transport.test.ts tests/agent/ipc-transport.test.ts
git mv tests/container/local-tools.test.ts tests/agent/local-tools.test.ts
git mv tests/container/ipc-tools.test.ts tests/agent/ipc-tools.test.ts
git mv tests/container/ipc-mcp-server.test.ts tests/agent/mcp-server.test.ts
git mv tests/container/tcp-bridge.test.ts tests/agent/tcp-bridge.test.ts
git mv tests/container/agents/dispatch.test.ts tests/agent/runners/dispatch.test.ts
git mv tests/container/agents/pi-session.test.ts tests/agent/runners/pi-session.test.ts
git mv tests/container/agents/claude-code.test.ts tests/agent/runners/claude-code.test.ts
rm -rf tests/container
```

**Step 3: Move provider tests into nested directories**
```bash
mkdir -p tests/providers/{audit,memory,scanner,channel,web,browser,credentials,skills,sandbox,scheduler}

git mv tests/providers/audit-file.test.ts tests/providers/audit/file.test.ts
git mv tests/providers/audit-sqlite.test.ts tests/providers/audit/sqlite.test.ts
git mv tests/providers/memory-file.test.ts tests/providers/memory/file.test.ts
git mv tests/providers/memory-sqlite.test.ts tests/providers/memory/sqlite.test.ts
git mv tests/providers/memory-memu.test.ts tests/providers/memory/memu.test.ts
git mv tests/providers/scanner-basic.test.ts tests/providers/scanner/basic.test.ts
git mv tests/providers/scanner-patterns.test.ts tests/providers/scanner/patterns.test.ts
git mv tests/providers/scanner-promptfoo.test.ts tests/providers/scanner/promptfoo.test.ts
git mv tests/providers/channel-slack.test.ts tests/providers/channel/slack.test.ts
git mv tests/providers/web-fetch.test.ts tests/providers/web/fetch.test.ts
git mv tests/providers/web-tavily.test.ts tests/providers/web/tavily.test.ts
git mv tests/providers/browser-container.test.ts tests/providers/browser/container.test.ts
git mv tests/providers/creds-env.test.ts tests/providers/credentials/env.test.ts
git mv tests/providers/creds-encrypted.test.ts tests/providers/credentials/encrypted.test.ts
git mv tests/providers/creds-keychain.test.ts tests/providers/credentials/keychain.test.ts
git mv tests/providers/skills-readonly.test.ts tests/providers/skills/readonly.test.ts
git mv tests/providers/skills-git.test.ts tests/providers/skills/git.test.ts
git mv tests/providers/sandbox-subprocess.test.ts tests/providers/sandbox/subprocess.test.ts
git mv tests/providers/sandbox-docker.test.ts tests/providers/sandbox/docker.test.ts
git mv tests/providers/sandbox-nsjail.test.ts tests/providers/sandbox/nsjail.test.ts
git mv tests/providers/scheduler-cron.test.ts tests/providers/scheduler/cron.test.ts
git mv tests/providers/scheduler-full.test.ts tests/providers/scheduler/full.test.ts
```

**Step 4: Update all test imports**

Test imports need updating for both:
1. The test file's own new location (affects relative path depth)
2. The source file's new location

Pattern for provider tests (now one level deeper):
- Old: `from '../../src/providers/memory/file.js'` → New: `from '../../../src/providers/memory/file.js'`
- Old: `from '../../src/providers/types.js'` → New: `from '../../../src/providers/memory/types.js'` (or `../../../src/types.js` for shared types)

Pattern for host tests (new tests/host/ dir):
- Old `tests/server.test.ts`: `from '../src/server.js'` → Now `tests/host/server.test.ts`: `from '../../src/host/server.js'`

Pattern for agent tests:
- Same depth change as before (tests/container → tests/agent, same nesting)

**Step 5: Build check + test**
```bash
npx tsc --noEmit && npx vitest run 2>&1 | tail -5
```

**Step 6: Commit**
```bash
git add -A
git commit -m "refactor: mirror source structure in tests/"
```

---

### Task 7: Update documentation and configuration

**Step 1: Update CLAUDE.md**
- File path references in Architecture Overview section
- Provider subdirectory pattern example
- Any references to `container/`, `ipc.ts`, `anthropic-proxy.ts`

**Step 2: Update `docs/plans/ax-architecture-doc.md`**
- File structure section (Section 5)
- Data flow paths
- Any file path references

**Step 3: Update `src/host/server.ts` spawn command**
Check if the agent subprocess spawn command references `container/agent-runner` — it may reference `dist/container/agent-runner.js`. Update to `dist/agent/runner.js`.

**Step 4: Update `src/host/provider-map.ts` paths**
All `PROVIDER_MAP` values use paths relative to the file location. Since `provider-map.ts` moved from `src/` to `src/host/`:
- `'./providers/llm/anthropic.js'` → `'../providers/llm/anthropic.js'`
- Apply to ALL entries in the map

**Step 5: Update vitest.config.ts if it has path patterns**
Check for any `include`/`exclude` patterns that reference old paths.

**Step 6: Update tsconfig.json if it has path mappings**

**Step 7: Build + full test run**
```bash
npm run build && npm test
```

**Step 8: Commit**
```bash
git add -A
git commit -m "refactor: update docs and config for new directory structure"
```

---

### Task 8: Clean up and verify

**Step 1: Remove stale .gitkeep files and empty directories**
```bash
find src -name '.gitkeep' -delete
find tests -name '.gitkeep' -delete
find src -type d -empty -delete
find tests -type d -empty -delete
```

**Step 2: Full verification**
```bash
npm run build && npm test
```

**Step 3: Verify git status is clean**
```bash
git status
```

**Step 4: Final commit if needed**
```bash
git add -A
git commit -m "chore: clean up empty dirs and stale .gitkeep files"
```

---

## Execution Notes

- **All changes are mechanical** — file moves and import path updates. Zero logic changes.
- **Order matters:** Tasks 1-4 (moves) must happen before Task 5 (types split) to avoid double-updating imports.
- **Build check between tasks** catches import errors early.
- **~150 files affected** across source and tests. Use `grep` to find all instances of old paths and update systematically.
- **The `dist/` directory** will be regenerated by `npm run build` — don't manually update it.
