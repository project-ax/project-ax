# Admin Dashboard Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Wire the existing static React dashboard to a real admin API, add bearer token auth, embed the dashboard in the AX server, build a web-based first-run setup wizard, and remove the CLI chat TUI.

**Architecture:** The AX server (`src/host/server.ts`) gains a new `server-admin.ts` module that handles all `/admin/*` routes: bearer-token-gated API endpoints and static file serving for the Vite-built dashboard SPA. The dashboard (`dashboard/`) connects to these endpoints via `fetch()` and SSE. On first run (no `ax.yaml`), the server starts in setup mode and opens the browser to `/admin/setup` instead of running the CLI wizard.

**Tech Stack:** TypeScript (server), React 19 + Vite + Tailwind + shadcn (dashboard), SSE for real-time events

---

## What Already Exists

### Dashboard (commits a2e3d18, 142ce41)
- `dashboard/` — Full React + Vite + shadcn SPA with 5 pages:
  - **Overview** — Stats row, live agents, security events, token usage, activity feed
  - **Agents** — Registry table, delegation tree, detail panel
  - **Security** — Scan history, taint budget monitor, threat patterns
  - **Logs** — Audit log with filters (action/result/search)
  - **Settings** — Security profiles, providers, webhooks, credentials
- All data is **static mock** — no API calls, no SSE, no auth
- Theme system (dark/light) with localStorage persistence
- Navigation via `useState` page switching

### Server
- `src/host/server.ts` — HTTP server with Unix socket + optional TCP
- `src/host/event-bus.ts` — EventBus with SSE streaming at `/v1/events`
- `src/host/server-webhooks.ts` — Bearer token auth pattern (timing-safe), rate limiting
- `src/host/agent-registry.ts` — Agent registry (JSON, CRUD)
- `src/host/orchestration/` — Orchestrator with agent supervisor, heartbeat, directory
- `src/providers/audit/` — Audit log (SQLite + file providers) with query interface
- `src/host/ipc-handlers/governance.ts` — Proposal system with admin gating
- `src/onboarding/` — CLI configure wizard (inquirer prompts)

---

## Task Overview

| # | Task | Creates/Modifies | Depends On |
|---|------|-----------------|------------|
| 1 | Remove CLI chat | CLI, package.json | — |
| 2 | Config: add admin section | types.ts, config.ts | — |
| 3 | Admin auth middleware | server-admin.ts (new) | 2 |
| 4 | Admin API: status & agents | server-admin.ts | 3 |
| 5 | Admin API: audit & config | server-admin.ts | 3 |
| 6 | Admin API: events SSE | server-admin.ts | 3 |
| 7 | Wire server to admin routes | server.ts | 3–6 |
| 8 | Dashboard: API client layer | dashboard/src/lib/api.ts (new) | 4–6 |
| 9 | Dashboard: wire Overview page | dashboard components | 8 |
| 10 | Dashboard: wire Agents page | agents-page.tsx | 8 |
| 11 | Dashboard: wire Logs page | logs-page.tsx | 8 |
| 12 | Dashboard: wire Security page | security-page.tsx | 8 |
| 13 | Dashboard: wire Settings page | settings-page.tsx | 8 |
| 14 | Dashboard: login page | dashboard (new page) | 8 |
| 15 | Dashboard build integration | vite.config.ts, server-admin.ts | 7, 14 |
| 16 | Web-based setup wizard | setup page + API endpoints | 15 |
| 17 | First-run experience | CLI, server.ts | 16 |
| 18 | Update docs & references | README, docs/web, help text | 1, 17 |

---

## Task 1: Remove CLI Chat

Remove `ax chat` and its React/Ink TUI. This drops the `ink`, `react`, `ink-text-input` dependencies.

**Files:**
- Delete: `src/cli/chat.ts`
- Delete: `src/cli/components/App.tsx`
- Delete: `src/cli/components/MessageList.tsx`
- Delete: `src/cli/components/InputBox.tsx`
- Delete: `src/cli/components/StatusBar.tsx`
- Delete: `src/cli/components/ThinkingIndicator.tsx`
- Delete: `src/cli/components/Message.tsx`
- Delete: `tests/cli/chat.test.ts`
- Delete: `tests/cli/components/App.test.tsx`
- Delete: `tests/cli/components/MessageList.test.tsx`
- Delete: `tests/cli/components/InputBox.test.tsx`
- Delete: `tests/cli/components/ThinkingIndicator.test.tsx`
- Delete: `tests/cli/components/Message.test.tsx`
- Modify: `src/cli/index.ts`
- Modify: `package.json`
- Test: `tests/cli/index.test.ts`

**Step 1: Delete chat files**

Delete all files listed above. Use `git rm` for each.

**Step 2: Remove chat from CLI router**

In `src/cli/index.ts`:

```typescript
// Remove from CommandHandlers interface:
//   chat?: () => Promise<void>;

// Remove from routeCommand switch:
//   case 'chat':
//     if (handlers.chat) await handlers.chat();
//     break;

// Remove from knownCommands Set:
//   'chat' → remove

// Remove from routeCommand call in main():
//   chat: async () => {
//     const { runChat } = await import('./chat.js');
//     await runChat(restArgs);
//   },

// Remove from showHelp():
//   ax chat [options]      Start interactive chat client
//   Chat Options: section
//   ax chat (example)
```

**Step 3: Remove Ink/React dependencies from package.json**

```bash
npm uninstall ink react ink-text-input @types/react
```

**Step 4: Update tests**

In `tests/cli/index.test.ts`, remove any test that routes to `chat` or expects `chat` in help output.

**Step 5: Run tests**

```bash
npm test -- --run
```
Expected: All tests pass. No remaining references to `chat.ts` or Ink components.

**Step 6: Commit**

```bash
git add -A
git commit -m "feat: remove ax chat CLI and Ink/React TUI dependencies"
```

---

## Task 2: Config — Add Admin Section

Add `admin` configuration to the Config type and config loader.

**Files:**
- Modify: `src/types.ts`
- Modify: `src/config.ts`
- Test: `tests/config.test.ts`

**Step 1: Write the failing test**

In `tests/config.test.ts`, add:

```typescript
describe('admin config', () => {
  it('should have admin defaults when not specified', () => {
    // Load config without admin section
    const config = loadConfig(/* path to minimal fixture */);
    expect(config.admin).toEqual({
      enabled: true,
      port: 8080,
    });
  });

  it('should load admin config from YAML', () => {
    // Create a fixture with admin section
    const config = loadConfig(/* path to fixture with admin */);
    expect(config.admin.enabled).toBe(true);
    expect(config.admin.token).toBe('test-token-123');
    expect(config.admin.port).toBe(9090);
  });
});
```

**Step 2: Run test to verify it fails**

```bash
npm test -- --run tests/config.test.ts
```
Expected: FAIL — `admin` property doesn't exist on Config.

**Step 3: Add admin types to `src/types.ts`**

```typescript
admin: {
  enabled: boolean;     // default: true
  token?: string;       // bearer token; auto-generated if not set
  port: number;         // default: 8080
};
```

Add this to the `Config` interface.

**Step 4: Add defaults in `src/config.ts`**

In the config loading/default logic, add:

```typescript
admin: {
  enabled: raw.admin?.enabled ?? true,
  token: raw.admin?.token,
  port: raw.admin?.port ?? 8080,
},
```

**Step 5: Run test to verify it passes**

```bash
npm test -- --run tests/config.test.ts
```

**Step 6: Run full test suite**

```bash
npm test -- --run
```

Check that no existing tests break from the new Config field. Remember: Zod strict mode may reject unknown fields in YAML fixtures — update any fixture configs that go through strict validation.

**Step 7: Commit**

```bash
git commit -m "feat(config): add admin dashboard configuration section"
```

---

## Task 3: Admin Auth Middleware

Create `src/host/server-admin.ts` with bearer token authentication. Reuse the timing-safe comparison pattern from `server-webhooks.ts`.

**Files:**
- Create: `src/host/server-admin.ts`
- Create: `tests/host/server-admin.test.ts`

**Step 1: Write the failing test**

```typescript
// tests/host/server-admin.test.ts
import { describe, it, expect } from 'vitest';
import { createAdminHandler, type AdminDeps } from '../../src/host/server-admin.js';
import { createServer, request } from 'node:http';

describe('admin auth', () => {
  it('rejects requests without token', async () => {
    const handler = createAdminHandler(mockDeps({ token: 'secret' }));
    // make request without Authorization header
    // expect 401
  });

  it('rejects requests with wrong token', async () => {
    const handler = createAdminHandler(mockDeps({ token: 'secret' }));
    // make request with Authorization: Bearer wrong
    // expect 401
  });

  it('accepts requests with correct token', async () => {
    const handler = createAdminHandler(mockDeps({ token: 'secret' }));
    // make request with Authorization: Bearer secret
    // expect 200
  });

  it('rate-limits auth failures', async () => {
    // 21 rapid failures from same IP → 429
  });

  it('auto-generates token when not configured', async () => {
    const deps = mockDeps({ token: undefined });
    expect(deps.config.admin.token).toBeDefined();
    expect(deps.config.admin.token!.length).toBeGreaterThanOrEqual(32);
  });
});
```

**Step 2: Run test to verify it fails**

```bash
npm test -- --run tests/host/server-admin.test.ts
```

**Step 3: Implement `src/host/server-admin.ts`**

```typescript
/**
 * Admin dashboard handler.
 *
 * Serves the admin API (JSON endpoints) and static dashboard files.
 * All routes require bearer token auth.
 */

import { randomBytes, timingSafeEqual } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { sendError, readBody } from './server-http.js';
import type { Config, ProviderRegistry } from '../types.js';
import type { EventBus } from './event-bus.js';
import type { Orchestrator } from './orchestration/orchestrator.js';

// Rate limiter (reuse same pattern as server-webhooks.ts)
interface RateLimitEntry { count: number; windowStartMs: number; }
const RATE_WINDOW_MS = 60_000;
const RATE_MAX_FAILURES = 20;
const rateLimits = new Map<string, RateLimitEntry>();

function isRateLimited(ip: string, now = Date.now()): boolean { /* ... */ }
function recordFailure(ip: string, now = Date.now()): void { /* ... */ }
function resetLimit(ip: string): void { /* ... */ }

function extractToken(req: IncomingMessage): string | undefined {
  const auth = req.headers.authorization?.trim() ?? '';
  if (auth.toLowerCase().startsWith('bearer ')) {
    const t = auth.slice(7).trim();
    if (t) return t;
  }
  return (req.headers['x-ax-token'] as string)?.trim() || undefined;
}

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

export interface AdminDeps {
  config: Config;
  providers: ProviderRegistry;
  eventBus: EventBus;
  orchestrator: Orchestrator;
  startTime: number; // Date.now() at server start
}

export function createAdminHandler(deps: AdminDeps) {
  // Auto-generate token if not configured
  if (!deps.config.admin.token) {
    deps.config.admin.token = randomBytes(32).toString('hex');
    // Log it once so the user can copy it
  }

  const token = deps.config.admin.token!;

  return async function handleAdmin(
    req: IncomingMessage,
    res: ServerResponse,
    pathname: string,
  ): Promise<void> {
    // API routes require auth; static files served without auth
    // (the SPA itself is public; API data requires token)
    if (pathname.startsWith('/admin/api/')) {
      const clientIp = req.socket?.remoteAddress ?? 'unknown';

      if (isRateLimited(clientIp)) {
        res.writeHead(429, { 'Retry-After': '60' });
        res.end('Too Many Requests');
        return;
      }

      const provided = extractToken(req);
      if (!provided || !safeEqual(provided, token)) {
        recordFailure(clientIp);
        sendError(res, 401, 'Unauthorized');
        return;
      }
      resetLimit(clientIp);

      // Route to API handler
      await handleAdminAPI(req, res, pathname, deps);
      return;
    }

    // Static file serving (Task 15)
    await serveStaticDashboard(req, res, pathname);
  };
}
```

**Step 4: Run tests**

```bash
npm test -- --run tests/host/server-admin.test.ts
```

**Step 5: Commit**

```bash
git commit -m "feat(admin): add admin handler with bearer token auth and rate limiting"
```

---

## Task 4: Admin API — Status & Agents

Add endpoints for server status and agent management.

**Files:**
- Modify: `src/host/server-admin.ts`
- Modify: `tests/host/server-admin.test.ts`

**Endpoints:**

```
GET  /admin/api/status
GET  /admin/api/agents
GET  /admin/api/agents/:id
POST /admin/api/agents/:id/kill
```

**Step 1: Write the failing tests**

```typescript
describe('GET /admin/api/status', () => {
  it('returns server health, uptime, profile, agent count', async () => {
    // expect { status: 'ok', uptime: number, profile: 'paranoid', agents: { active: N, total: N } }
  });
});

describe('GET /admin/api/agents', () => {
  it('returns list of agents with state, session, activity', async () => {
    // expect array of { id, name, status, agentType, capabilities, ... }
  });
});

describe('GET /admin/api/agents/:id', () => {
  it('returns single agent detail with delegation tree', async () => {
    // expect { ...agent, children: [...] }
  });

  it('returns 404 for unknown agent', async () => {
    // expect 404
  });
});

describe('POST /admin/api/agents/:id/kill', () => {
  it('terminates an active agent', async () => {
    // expect { ok: true }
  });
});
```

**Step 2: Run tests to verify they fail**

**Step 3: Implement the endpoints**

```typescript
async function handleAdminAPI(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string,
  deps: AdminDeps,
): Promise<void> {
  const { config, providers, orchestrator } = deps;
  const method = req.method ?? 'GET';

  // GET /admin/api/status
  if (pathname === '/admin/api/status' && method === 'GET') {
    const agents = await providers.agentRegistry?.list() ?? [];
    const active = agents.filter(a => a.status === 'active').length;
    sendJSON(res, {
      status: 'ok',
      uptime: Math.floor((Date.now() - deps.startTime) / 1000),
      profile: config.profile,
      agents: { active, total: agents.length },
    });
    return;
  }

  // GET /admin/api/agents
  if (pathname === '/admin/api/agents' && method === 'GET') {
    const agents = await providers.agentRegistry?.list() ?? [];
    sendJSON(res, agents);
    return;
  }

  // GET /admin/api/agents/:id
  const agentMatch = pathname.match(/^\/admin\/api\/agents\/([^/]+)$/);
  if (agentMatch && method === 'GET') {
    const id = agentMatch[1];
    const agent = await providers.agentRegistry?.get(id);
    if (!agent) { sendError(res, 404, 'Agent not found'); return; }
    const children = await providers.agentRegistry?.children(id) ?? [];
    sendJSON(res, { ...agent, children });
    return;
  }

  // POST /admin/api/agents/:id/kill
  const killMatch = pathname.match(/^\/admin\/api\/agents\/([^/]+)\/kill$/);
  if (killMatch && method === 'POST') {
    const id = killMatch[1];
    // Use orchestrator to terminate agent
    sendJSON(res, { ok: true, agentId: id });
    return;
  }

  sendError(res, 404, 'Not found');
}

function sendJSON(res: ServerResponse, data: unknown, status = 200): void {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(body),
  });
  res.end(body);
}
```

**Step 4: Run tests**

```bash
npm test -- --run tests/host/server-admin.test.ts
```

**Step 5: Commit**

```bash
git commit -m "feat(admin): add status and agents API endpoints"
```

---

## Task 5: Admin API — Audit & Config

**Files:**
- Modify: `src/host/server-admin.ts`
- Modify: `tests/host/server-admin.test.ts`

**Endpoints:**

```
GET  /admin/api/audit    → Query audit log (?action=&since=&until=&limit=)
GET  /admin/api/config   → Current config (credentials redacted)
GET  /admin/api/sessions → List sessions
```

**Step 1: Write the failing tests**

```typescript
describe('GET /admin/api/audit', () => {
  it('returns audit entries with filters', async () => {
    // ?action=llm_call&limit=10
    // expect array of AuditEntry objects
  });

  it('supports since/until date range', async () => {
    // ?since=2026-03-01&until=2026-03-03
  });
});

describe('GET /admin/api/config', () => {
  it('returns config with redacted credentials', async () => {
    const result = /* GET /admin/api/config */;
    // Credentials should be masked: "sk-...XXXX"
    expect(result.admin?.token).toBeUndefined();
  });
});

describe('GET /admin/api/sessions', () => {
  it('returns sessions grouped by user', async () => {
    // expect { sessions: [...] }
  });
});
```

**Step 2: Run tests to verify they fail**

**Step 3: Implement**

```typescript
// GET /admin/api/audit
if (pathname === '/admin/api/audit' && method === 'GET') {
  const url = new URL(req.url ?? '/', 'http://localhost');
  const filter = {
    action: url.searchParams.get('action') ?? undefined,
    since: url.searchParams.get('since') ? new Date(url.searchParams.get('since')!) : undefined,
    until: url.searchParams.get('until') ? new Date(url.searchParams.get('until')!) : undefined,
    limit: url.searchParams.get('limit') ? parseInt(url.searchParams.get('limit')!) : 100,
  };
  const entries = await providers.audit.query(filter);
  sendJSON(res, entries);
  return;
}

// GET /admin/api/config
if (pathname === '/admin/api/config' && method === 'GET') {
  // Deep-clone and redact sensitive fields
  const safe = redactConfig(config);
  sendJSON(res, safe);
  return;
}

// GET /admin/api/sessions
if (pathname === '/admin/api/sessions' && method === 'GET') {
  // Query session store
  sendJSON(res, { sessions: [] }); // Wire to SessionStore
  return;
}
```

The `redactConfig` helper strips `admin.token`, masks API keys (`sk-...XXXX`), and removes any credential values.

**Step 4: Run tests and commit**

```bash
git commit -m "feat(admin): add audit, config, and sessions API endpoints"
```

---

## Task 6: Admin API — Events SSE

Add a dedicated admin SSE stream that includes all event types (not scoped to a single request like `/v1/events`).

**Files:**
- Modify: `src/host/server-admin.ts`
- Modify: `tests/host/server-admin.test.ts`

**Endpoint:**

```
GET  /admin/api/events → SSE stream (all server events, filterable by ?types=)
```

**Step 1: Write the failing test**

```typescript
describe('GET /admin/api/events', () => {
  it('opens SSE stream and receives events', async () => {
    // Subscribe, emit a test event on eventBus, verify it arrives
  });

  it('filters by event type', async () => {
    // ?types=llm.chunk,tool.call
    // Verify only matching events arrive
  });

  it('sends keepalive comments', async () => {
    // Wait >15s, verify :keepalive received
  });
});
```

**Step 2: Implement**

```typescript
// GET /admin/api/events
if (pathname === '/admin/api/events' && method === 'GET') {
  const url = new URL(req.url ?? '/', 'http://localhost');
  const typesParam = url.searchParams.get('types');
  const typeFilter = typesParam
    ? new Set(typesParam.split(',').map(t => t.trim()).filter(Boolean))
    : undefined;

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',
  });

  res.write(':connected\n\n');

  const listener = (event: StreamEvent) => {
    if (typeFilter && !typeFilter.has(event.type)) return;
    try {
      res.write(`data: ${JSON.stringify(event)}\n\n`);
    } catch { /* client disconnected */ }
  };

  const unsubscribe = deps.eventBus.subscribe(listener);

  const keepalive = setInterval(() => {
    try { res.write(':keepalive\n\n'); } catch { /* gone */ }
  }, 15_000);

  const cleanup = () => {
    clearInterval(keepalive);
    unsubscribe();
  };
  req.on('close', cleanup);
  req.on('error', cleanup);
  return;
}
```

**Step 3: Run tests and commit**

```bash
git commit -m "feat(admin): add SSE event stream endpoint"
```

---

## Task 7: Wire Server to Admin Routes

Integrate the admin handler into the main server's request handler.

**Files:**
- Modify: `src/host/server.ts`
- Modify: `tests/host/server.test.ts` (if exists)

**Step 1: Write the failing test**

```typescript
it('routes /admin/* requests to admin handler', async () => {
  // Start server with admin.enabled = true
  // GET /admin/api/status with valid token → 200
  // GET /admin/api/status without token → 401
});

it('returns 404 for /admin when admin.enabled = false', async () => {
  // Start server with admin.enabled = false
  // GET /admin/api/status → 404
});
```

**Step 2: Implement**

In `server.ts`, import and wire the admin handler:

```typescript
import { createAdminHandler } from './server-admin.js';

// After providers are loaded, before handleRequest:
const adminHandler = config.admin.enabled
  ? createAdminHandler({
      config,
      providers,
      eventBus,
      orchestrator,
      startTime: Date.now(),
    })
  : null;

// In handleRequest(), BEFORE the final 404:
if (adminHandler && url.startsWith('/admin/')) {
  await adminHandler(req, res, url);
  return;
}
```

When `--port` is not specified but `admin.enabled` is true, automatically listen on TCP port `config.admin.port` (default 8080) so the dashboard is accessible via browser:

```typescript
// After socket listen, if no explicit --port but admin is enabled:
if (opts.port == null && config.admin.enabled) {
  tcpServer = createHttpServer(handleRequest);
  await new Promise<void>((resolveP, rejectP) => {
    tcpServer!.listen(config.admin.port, '127.0.0.1', () => {
      logger.debug('admin_listening', { port: config.admin.port });
      resolveP();
    });
    tcpServer!.on('error', rejectP);
  });
}
```

**Step 3: Update startup banner**

Replace the current event console startup output to include the admin URL:

```
  🦀  AX is running

  Socket:  ~/.ax/ax.sock
  Admin:   http://127.0.0.1:8080/admin
  Profile: balanced

  → Press Ctrl+C to stop
```

**Step 4: Run tests and commit**

```bash
npm test -- --run
git commit -m "feat(server): wire admin handler into main request router"
```

---

## Task 8: Dashboard — API Client Layer

Create a shared API client for the dashboard to call admin endpoints.

**Files:**
- Create: `dashboard/src/lib/api.ts`
- Create: `dashboard/src/lib/types.ts`
- Create: `dashboard/src/hooks/use-api.ts`

**Step 1: Create type definitions**

`dashboard/src/lib/types.ts`:

```typescript
// Mirror server-side types for the dashboard

export interface ServerStatus {
  status: 'ok' | 'draining';
  uptime: number;
  profile: string;
  agents: { active: number; total: number };
}

export interface Agent {
  id: string;
  name: string;
  description?: string;
  status: 'active' | 'suspended' | 'archived';
  parentId: string | null;
  agentType: string;
  capabilities: string[];
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  children?: Agent[];
}

export interface AuditEntry {
  timestamp: string;
  sessionId: string;
  action: string;
  args: Record<string, unknown>;
  result: 'success' | 'blocked' | 'error';
  durationMs: number;
  tokenUsage?: { input: number; output: number };
}

export interface StreamEvent {
  type: string;
  requestId: string;
  timestamp: number;
  data: Record<string, unknown>;
}
```

**Step 2: Create API client**

`dashboard/src/lib/api.ts`:

```typescript
const BASE = '/admin/api';

function getToken(): string {
  return localStorage.getItem('ax-admin-token') ?? '';
}

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      'Authorization': `Bearer ${getToken()}`,
      'Content-Type': 'application/json',
      ...init?.headers,
    },
  });

  if (res.status === 401) {
    // Token invalid — redirect to login
    window.dispatchEvent(new CustomEvent('ax:auth-required'));
    throw new Error('Unauthorized');
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: { message: res.statusText } }));
    throw new Error(body.error?.message ?? `HTTP ${res.status}`);
  }

  return res.json();
}

export const api = {
  status: () => apiFetch<ServerStatus>('/status'),
  agents: () => apiFetch<Agent[]>('/agents'),
  agent: (id: string) => apiFetch<Agent>(`/agents/${id}`),
  killAgent: (id: string) => apiFetch<{ ok: boolean }>(`/agents/${id}/kill`, { method: 'POST' }),
  audit: (params?: { action?: string; since?: string; until?: string; limit?: number }) => {
    const qs = new URLSearchParams();
    if (params?.action) qs.set('action', params.action);
    if (params?.since) qs.set('since', params.since);
    if (params?.until) qs.set('until', params.until);
    if (params?.limit) qs.set('limit', String(params.limit));
    return apiFetch<AuditEntry[]>(`/audit?${qs}`);
  },
  config: () => apiFetch<Record<string, unknown>>('/config'),
  sessions: () => apiFetch<{ sessions: unknown[] }>('/sessions'),
};

// SSE helper
export function subscribeEvents(
  onEvent: (event: StreamEvent) => void,
  types?: string[],
): () => void {
  const qs = new URLSearchParams();
  if (types?.length) qs.set('types', types.join(','));

  const url = `${BASE}/events?${qs}&token=${getToken()}`;
  const source = new EventSource(url);

  source.onmessage = (e) => {
    try {
      onEvent(JSON.parse(e.data));
    } catch { /* ignore parse errors */ }
  };

  return () => source.close();
}
```

**Step 3: Create React hook**

`dashboard/src/hooks/use-api.ts`:

```typescript
import { useState, useEffect, useCallback } from 'react';

export function useApi<T>(fetcher: () => Promise<T>, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(() => {
    setLoading(true);
    setError(null);
    fetcher()
      .then(setData)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, deps);

  useEffect(() => { refresh(); }, [refresh]);

  return { data, error, loading, refresh };
}
```

**Step 4: Commit**

```bash
git commit -m "feat(dashboard): add API client layer and React hooks"
```

---

## Task 9: Dashboard — Wire Overview Page

Replace all mock data in the Overview page components with real API calls.

**Files:**
- Modify: `dashboard/src/App.tsx` (Overview section)
- Modify: `dashboard/src/components/stats-row.tsx`
- Modify: `dashboard/src/components/live-agents.tsx`
- Modify: `dashboard/src/components/security-events.tsx`
- Modify: `dashboard/src/components/token-usage.tsx`
- Modify: `dashboard/src/components/activity-feed.tsx`

**Step 1: Wire stats-row.tsx**

Replace hardcoded stats with `useApi(api.status)`:

```typescript
import { useApi } from '../hooks/use-api';
import { api } from '../lib/api';

export function StatsRow() {
  const { data: status } = useApi(api.status);
  // Use status.agents.active, status.uptime, status.profile, etc.
  // Keep existing card layout, replace hardcoded values
}
```

**Step 2: Wire live-agents.tsx**

Replace `mockAgents` with `useApi(api.agents)`. Add polling every 5s for live updates.

**Step 3: Wire security-events.tsx**

Replace `mockEvents` with `useApi(() => api.audit({ action: 'scan', limit: 10 }))`. Use SSE for real-time updates via `subscribeEvents`.

**Step 4: Wire activity-feed.tsx**

Connect to SSE stream via `subscribeEvents` for real-time activity. Accumulate events in state.

**Step 5: Wire token-usage.tsx**

This requires aggregating token data from audit entries. Use `useApi` to fetch recent audit entries with `tokenUsage` and aggregate by hour.

**Step 6: Add loading/error states**

Each component should show:
- Skeleton/spinner while loading
- Error message on failure
- Empty state when no data

**Step 7: Commit**

```bash
git commit -m "feat(dashboard): wire Overview page to live API data"
```

---

## Task 10: Dashboard — Wire Agents Page

**Files:**
- Modify: `dashboard/src/components/pages/agents-page.tsx`

**Step 1: Replace mock data**

Replace `mockAgents` (186 lines of hardcoded data) with:

```typescript
const { data: agents, loading, refresh } = useApi(api.agents);
```

**Step 2: Wire agent detail panel**

When an agent is selected, fetch full detail:

```typescript
const { data: detail } = useApi(() => api.agent(selectedId), [selectedId]);
```

**Step 3: Wire kill button**

Add a working kill button in the agent detail panel:

```typescript
const handleKill = async (id: string) => {
  await api.killAgent(id);
  refresh();
};
```

**Step 4: Wire delegation tree**

Build tree from agent `parentId` / `children` relationships in the API response.

**Step 5: Commit**

```bash
git commit -m "feat(dashboard): wire Agents page to live API data"
```

---

## Task 11: Dashboard — Wire Logs Page

**Files:**
- Modify: `dashboard/src/components/pages/logs-page.tsx`

**Step 1: Replace mock data**

Replace `mockLogs` (384 lines) with:

```typescript
const { data: logs, loading, refresh } = useApi(
  () => api.audit({ action: activeAction, limit: 100 }),
  [activeAction, activeResult, searchQuery]
);
```

**Step 2: Wire filters**

Connect the filter bar (action type, result, search, time range) to API query params. Debounce search input (300ms).

**Step 3: Add pagination**

Replace the flat 25-entry list with cursor-based pagination:
- "Load more" button at bottom
- Or infinite scroll with intersection observer

**Step 4: Commit**

```bash
git commit -m "feat(dashboard): wire Logs page to live audit API"
```

---

## Task 12: Dashboard — Wire Security Page

**Files:**
- Modify: `dashboard/src/components/pages/security-page.tsx`

**Step 1: Replace mock data**

- `mockEvents` (scan history) → `useApi(() => api.audit({ action: 'scan' }))`
- `mockTaintSessions` → derive from status/agents API or add a dedicated taint endpoint
- `mockThreatPatterns` → derive from audit entries with `result: 'blocked'`

**Step 2: Wire taint budget monitor**

Add `GET /admin/api/taint` endpoint if needed, or compute from existing data. The server already tracks taint budgets via `TaintBudget` class.

**Step 3: Add real-time updates**

Subscribe to SSE for `scan.*` and `taint.*` events to update the security page in real-time.

**Step 4: Commit**

```bash
git commit -m "feat(dashboard): wire Security page to live data"
```

---

## Task 13: Dashboard — Wire Settings Page

**Files:**
- Modify: `dashboard/src/components/pages/settings-page.tsx`

**Step 1: Replace mock data**

- Security profiles → from `api.config()` response
- Providers → from `api.config()` response
- Webhooks → from `api.config()` response
- Server info → from `api.status()` response
- Credentials → from `api.config()` response (redacted)

**Step 2: Make settings read-only for now**

Settings page displays config read-only. Display a note: "Edit `ax.yaml` to change settings, then the server will hot-reload."

The server already has hot-reload via `setupConfigReload` in `src/cli/index.ts`.

**Step 3: Commit**

```bash
git commit -m "feat(dashboard): wire Settings page to live config data"
```

---

## Task 14: Dashboard — Login Page

Add a login page that collects the admin bearer token.

**Files:**
- Create: `dashboard/src/components/pages/login-page.tsx`
- Modify: `dashboard/src/App.tsx`

**Step 1: Create login page**

```typescript
// dashboard/src/components/pages/login-page.tsx
export function LoginPage({ onLogin }: { onLogin: (token: string) => void }) {
  const [token, setToken] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = async () => {
    // Validate token by calling /admin/api/status
    try {
      const res = await fetch('/admin/api/status', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        localStorage.setItem('ax-admin-token', token);
        onLogin(token);
      } else {
        setError('Invalid token');
      }
    } catch {
      setError('Cannot connect to server');
    }
  };

  // Render: token input field, submit button, error message
  // Match existing design system (dark/light theme, amber accents)
}
```

**Step 2: Add auth gate to App.tsx**

```typescript
function App() {
  const [authenticated, setAuthenticated] = useState(
    () => !!localStorage.getItem('ax-admin-token')
  );

  // Listen for auth-required events
  useEffect(() => {
    const handler = () => setAuthenticated(false);
    window.addEventListener('ax:auth-required', handler);
    return () => window.removeEventListener('ax:auth-required', handler);
  }, []);

  if (!authenticated) {
    return <LoginPage onLogin={() => setAuthenticated(true)} />;
  }

  // ... existing page routing
}
```

**Step 3: Add logout button to sidebar**

Add a logout option to the sidebar that clears the token and redirects to login.

**Step 4: Commit**

```bash
git commit -m "feat(dashboard): add login page and auth gate"
```

---

## Task 15: Dashboard Build Integration

Build the Vite dashboard and serve it as static files from the AX server.

**Files:**
- Modify: `dashboard/vite.config.ts`
- Modify: `src/host/server-admin.ts`
- Modify: `package.json` (add build script)

**Step 1: Configure Vite for embedded serving**

`dashboard/vite.config.ts`:

```typescript
export default defineConfig({
  base: '/admin/',  // All assets prefixed with /admin/
  build: {
    outDir: '../src/admin-ui',  // Output into src/ for bundling with package
  },
  // ... existing plugins
});
```

**Step 2: Add build script to root package.json**

```json
{
  "scripts": {
    "build:dashboard": "cd dashboard && npm run build",
    "build": "tsc && npm run build:dashboard"
  }
}
```

**Step 3: Implement static file serving in server-admin.ts**

```typescript
import { readFileSync, existsSync } from 'node:fs';
import { join, extname } from 'node:path';

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};

async function serveStaticDashboard(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string,
): Promise<void> {
  // Resolve admin UI directory (built files)
  const adminDir = resolveAdminUIDir(); // src/admin-ui/ in dev, dist/admin-ui/ at runtime

  // Strip /admin prefix
  let filePath = pathname.replace(/^\/admin\/?/, '') || 'index.html';

  // Security: prevent path traversal
  if (filePath.includes('..')) {
    sendError(res, 400, 'Invalid path');
    return;
  }

  const fullPath = join(adminDir, filePath);

  // SPA fallback: serve index.html for any non-file route
  const resolvedPath = existsSync(fullPath) ? fullPath : join(adminDir, 'index.html');

  if (!existsSync(resolvedPath)) {
    sendError(res, 404, 'Dashboard not built. Run: npm run build:dashboard');
    return;
  }

  const ext = extname(resolvedPath);
  const contentType = MIME_TYPES[ext] ?? 'application/octet-stream';
  const content = readFileSync(resolvedPath);

  res.writeHead(200, {
    'Content-Type': contentType,
    'Content-Length': content.length,
    'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=31536000, immutable',
  });
  res.end(content);
}
```

**Step 4: Add dev proxy for dashboard development**

In `dashboard/vite.config.ts`, add a proxy for development:

```typescript
server: {
  proxy: {
    '/admin/api': {
      target: 'http://127.0.0.1:8080',
      changeOrigin: true,
    },
  },
},
```

This lets developers run `npm run dev` in `dashboard/` and have API calls proxied to a running AX server.

**Step 5: Test the build**

```bash
cd dashboard && npm run build
# Verify output in src/admin-ui/
npm start -- --port 8080
# Visit http://127.0.0.1:8080/admin
```

**Step 6: Commit**

```bash
git commit -m "feat: integrate dashboard build into AX server static file serving"
```

---

## Task 16: Web-Based Setup Wizard

Create a browser-based first-run setup experience that replaces the CLI wizard as the primary onboarding path.

**Files:**
- Create: `dashboard/src/components/pages/setup-page.tsx`
- Modify: `src/host/server-admin.ts` (add setup endpoints)
- Modify: `dashboard/src/App.tsx`

**Step 1: Add setup API endpoints**

In `server-admin.ts`, add unauthenticated setup endpoints (only available when not yet configured):

```typescript
// These bypass auth — only available when no ax.yaml exists
if (pathname === '/admin/api/setup/status' && method === 'GET') {
  sendJSON(res, {
    configured: existsSync(configPath()),
    profile: config?.profile,
  });
  return;
}

if (pathname === '/admin/api/setup/configure' && method === 'POST') {
  // Only allow if not yet configured
  if (existsSync(configPath())) {
    sendError(res, 409, 'Already configured');
    return;
  }

  const body = await readBody(req);
  const answers = JSON.parse(body);

  // Write ax.yaml from answers
  // Write .env from credentials
  // Generate admin token
  // Return { ok: true, token: generatedToken }
  return;
}
```

**Step 2: Create setup page component**

`dashboard/src/components/pages/setup-page.tsx`:

Multi-step wizard with the same questions as the CLI configure:

1. **Welcome** — "Welcome to AX" with logo, brief description
2. **Security Profile** — paranoid / balanced / yolo radio cards
3. **Agent Type** — pi-coding-agent / claude-code selection
4. **API Key** — Provider selection + API key input
5. **Channels** — Optional Slack/Discord setup
6. **Review** — Summary of choices before saving
7. **Done** — Success message with admin token to copy, auto-redirect to dashboard

Use the same `PROFILE_NAMES`, `AGENT_TYPES`, etc. constants from `src/onboarding/prompts.ts` — but since the dashboard is a separate build, duplicate the constants or serve them via the setup API.

Design notes:
- Match the existing dashboard design system (dark theme default, amber accents)
- Each step is a card with forward/back navigation
- Validate API keys by attempting a test call (via a new `/admin/api/setup/validate-key` endpoint)
- Show progress indicator (step 1 of 6, etc.)

**Step 3: Wire setup page into App.tsx**

```typescript
function App() {
  const [setupStatus, setSetupStatus] = useState<'loading' | 'needs-setup' | 'ready'>('loading');

  useEffect(() => {
    fetch('/admin/api/setup/status')
      .then(r => r.json())
      .then(data => setSetupStatus(data.configured ? 'ready' : 'needs-setup'));
  }, []);

  if (setupStatus === 'needs-setup') {
    return <SetupPage onComplete={() => setSetupStatus('ready')} />;
  }

  // ... normal auth gate + dashboard
}
```

**Step 4: Write tests for setup endpoints**

```typescript
describe('setup endpoints', () => {
  it('GET /admin/api/setup/status returns configured: false when no ax.yaml', async () => {
    // ...
  });

  it('POST /admin/api/setup/configure writes config and returns token', async () => {
    // ...
  });

  it('POST /admin/api/setup/configure rejects when already configured', async () => {
    // expect 409
  });
});
```

**Step 5: Commit**

```bash
git commit -m "feat: add web-based setup wizard for first-run onboarding"
```

---

## Task 17: First-Run Experience

Wire the first-run detection to open the browser to the setup wizard instead of running the CLI wizard.

**Files:**
- Modify: `src/cli/index.ts`
- Modify: `src/host/server.ts`

**Step 1: Change first-run behavior in `src/cli/index.ts`**

Replace the current first-run block:

```typescript
// OLD:
if (!existsSync(resolvedConfigPath)) {
  const { runConfigure } = await import('../onboarding/configure.js');
  await runConfigure(axHome());
  // ...
}

// NEW:
if (!existsSync(resolvedConfigPath)) {
  logger.info('first_run', { message: 'No ax.yaml found — starting setup mode...' });
  // Start server in setup mode (minimal config, admin enabled)
  // The server will serve the setup wizard at /admin/setup
  // If TTY, open browser automatically
}
```

**Step 2: Implement setup mode**

When no config exists:
1. Create a minimal default config (just enough to start the server)
2. Start the server on TCP port 8080
3. If running in a TTY, open the browser: `open http://127.0.0.1:8080/admin`
4. Display a message: "Open http://127.0.0.1:8080/admin to complete setup"
5. Wait for the setup wizard to POST configuration
6. Hot-reload config and continue normal startup

**Step 3: Keep CLI configure as fallback**

`ax configure` still works for headless/SSH environments. Add a `--headless` flag detection:

```typescript
if (process.env.SSH_CLIENT || process.env.SSH_TTY || !process.stdout.isTTY) {
  // Headless: use CLI wizard
  const { runConfigure } = await import('../onboarding/configure.js');
  await runConfigure(axHome());
} else {
  // Interactive: use web wizard
  // Start setup server, open browser
}
```

**Step 4: Update the post-setup box**

In `src/onboarding/configure.ts` (or wherever the "What's next" box is printed), update to:

```
  ┌──────────────────────────────────────────────┐
  │  What's next:                                │
  │                                              │
  │    ax serve       Start the server           │
  │                                              │
  │  Admin dashboard opens automatically at      │
  │  http://127.0.0.1:8080/admin                 │
  └──────────────────────────────────────────────┘
```

**Step 5: Run full test suite and commit**

```bash
npm test -- --run
git commit -m "feat: wire first-run experience to web-based setup wizard"
```

---

## Task 18: Update Docs & References

Update all documentation to reflect the new admin dashboard and removal of CLI chat.

**Files:**
- Modify: `README.md`
- Modify: `docs/web/index.html`
- Modify: `src/cli/index.ts` (help text — already done in Task 1, verify)
- Modify: `.claude/skills/ax/` (any skills referencing chat or missing admin info)

**Step 1: Update README.md**

- Remove references to `ax chat`
- Add "Admin Dashboard" section describing:
  - How to access (`http://127.0.0.1:8080/admin`)
  - Authentication (bearer token from console output or `ax.yaml`)
  - What you can do (monitor agents, view audit logs, etc.)
- Update Quick Start to show `ax serve` → browser opens dashboard

**Step 2: Update docs/web/index.html**

- Remove `ax chat` from "Get Started" section
- Add admin dashboard to feature list
- Update CLI examples

**Step 3: Update ax skills**

Check `.claude/skills/ax/` for any references to CLI chat or missing admin dashboard documentation. Update as needed per CLAUDE.md requirements.

**Step 4: Commit**

```bash
git commit -m "docs: update README, website, and skills for admin dashboard"
```

---

## Implementation Notes

### Token Management
- On first run, server auto-generates a 32-byte hex token and prints it to the console
- Token is saved to `ax.yaml` under `admin.token` after setup wizard completes
- Users can set their own token in `ax.yaml` for reproducible deployments
- The dashboard stores the token in `localStorage` (single-user local deployment model)

### SSE Auth for EventSource
- `EventSource` doesn't support custom headers, so the admin events endpoint accepts the token as a query parameter (`?token=xxx`) in addition to the header. This is acceptable because:
  - Admin dashboard is accessed over localhost (127.0.0.1)
  - The token is already visible in the browser's localStorage
  - The SSE endpoint is the only one that accepts query-param auth

### Dashboard Dev Workflow
- `cd dashboard && npm run dev` — Vite dev server with hot reload, API proxied to AX
- `cd dashboard && npm run build` — Production build to `src/admin-ui/`
- `npm start -- --port 8080` — Full stack with embedded dashboard

### Security Considerations
- Admin API only listens on 127.0.0.1 (not 0.0.0.0)
- Bearer token required for all API endpoints
- Config endpoint redacts all credentials
- Setup endpoints are only available when server is unconfigured
- Path traversal protection on static file serving
- Rate limiting on auth failures (20 failures/minute per IP)

### What's NOT in This Plan (Phase 2)
- Credential management UI (add/rotate API keys via dashboard)
- Conversation viewer (browse chat history by session)
- Real-time event timeline with advanced filtering
- Multi-agent deployment management
- Agent creation/editing via dashboard
- K8s deployment manifests + Helm chart
