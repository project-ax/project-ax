# Repository Restructure Design

**Date:** 2026-02-10
**Goal:** Make the source tree self-documenting so core contributors understand the architecture at a glance.

## Design Principles

1. **Trust boundary is visible.** `host/` = trusted, `agent/` = sandboxed. You see this in the directory tree.
2. **Self-contained directories.** Each provider category has its own `types.ts`. Open a folder, everything you need is there.
3. **No redundant prefixes.** `agent/runner.ts` not `agent/agent-runner.ts`. The directory provides context.
4. **Tests mirror source.** Swap `src/` for `tests/`, add `.test` before extension. No exceptions.
5. **Shared code at root.** Config, DB, logging, paths — things both host and agent need — stay at `src/` root.

## Proposed Source Tree

```
src/
│
│  ── Shared (used by both host and agent) ──
│
├── main.ts              # Entry point (renamed from host.ts)
├── types.ts             # Cross-cutting types: Message, ContentBlock, TaintTag, Config, ProviderRegistry
├── config.ts            # Config loading & validation
├── db.ts                # SQLite database, conversation store, message queue
├── paths.ts             # Path utilities
├── logger.ts            # Logging
├── dotenv.ts            # .env file loading
├── ipc-schemas.ts       # IPC Zod schemas (shared between host & agent)
│
│  ── Host (trusted process) ──
│
├── host/
│   ├── server.ts        # HTTP server, /v1/chat/completions, agent spawning
│   ├── router.ts        # processInbound/processOutbound, taint injection, canary tokens
│   ├── ipc-server.ts    # IPC socket server, schema validation, handler dispatch (was ipc.ts)
│   ├── proxy.ts         # Credential-injecting forward proxy (was anthropic-proxy.ts)
│   ├── taint-budget.ts  # Taint tracking & budget enforcement
│   ├── registry.ts      # Provider loading
│   ├── provider-map.ts  # SC-SEC-002 static allowlist
│   └── oauth.ts         # OAuth PKCE flow
│
│  ── Agent (sandboxed process) ──
│
├── agent/
│   ├── runner.ts        # Entry point, stdin parsing, dispatch (was agent-runner.ts)
│   ├── ipc-client.ts    # IPC socket client
│   ├── ipc-transport.ts # StreamFn adapter: IPC calls → pi-ai events
│   ├── local-tools.ts   # Tools executing in sandbox: bash, read, write, edit
│   ├── ipc-tools.ts     # Tools routing through IPC: memory, web, audit
│   ├── mcp-server.ts    # MCP tool server for claude-code (was ipc-mcp-server.ts)
│   ├── tcp-bridge.ts    # TCP bridge
│   └── runners/         # Agent implementation variants (was agents/)
│       ├── pi-core.ts   # pi-agent-core direct
│       ├── pi-session.ts
│       └── claude-code.ts
│
│  ── Providers (pluggable implementations) ──
│
├── providers/
│   ├── llm/
│   │   ├── types.ts     # LLMProvider, ChatRequest, ChatChunk, ToolDef
│   │   ├── anthropic.ts
│   │   └── mock.ts
│   ├── memory/
│   │   ├── types.ts     # MemoryProvider, MemoryEntry, MemoryQuery
│   │   ├── file.ts
│   │   ├── sqlite.ts
│   │   └── memu.ts
│   ├── scanner/
│   │   ├── types.ts     # ScannerProvider, ScanTarget, ScanResult
│   │   ├── basic.ts
│   │   ├── patterns.ts
│   │   └── promptfoo.ts
│   ├── channel/
│   │   ├── types.ts     # ChannelProvider, InboundMessage, OutboundMessage
│   │   └── slack.ts
│   ├── web/
│   │   ├── types.ts     # WebProvider, FetchRequest, SearchResult
│   │   ├── none.ts
│   │   ├── fetch.ts
│   │   └── tavily.ts
│   ├── browser/
│   │   ├── types.ts     # BrowserProvider, BrowserSession, PageSnapshot
│   │   ├── none.ts
│   │   └── container.ts
│   ├── credentials/
│   │   ├── types.ts     # CredentialProvider
│   │   ├── env.ts
│   │   ├── encrypted.ts
│   │   └── keychain.ts
│   ├── skills/
│   │   ├── types.ts     # SkillStoreProvider, SkillMeta, SkillProposal
│   │   ├── readonly.ts
│   │   └── git.ts
│   ├── audit/
│   │   ├── types.ts     # AuditProvider, AuditEntry, AuditFilter
│   │   ├── file.ts
│   │   └── sqlite.ts
│   ├── sandbox/
│   │   ├── types.ts     # SandboxProvider, SandboxConfig, SandboxProcess
│   │   ├── subprocess.ts
│   │   ├── seatbelt.ts
│   │   ├── nsjail.ts
│   │   └── docker.ts
│   └── scheduler/
│       ├── types.ts     # SchedulerProvider, CronJobDef, ProactiveHint
│       ├── none.ts
│       ├── cron.ts
│       └── full.ts
│
│  ── CLI (terminal UI) ──
│
├── cli/
│   ├── index.ts
│   ├── chat.ts
│   ├── send.ts
│   ├── components/
│   │   ├── App.tsx
│   │   ├── InputBox.tsx
│   │   ├── Message.tsx
│   │   ├── MessageList.tsx
│   │   ├── StatusBar.tsx
│   │   └── ThinkingIndicator.tsx
│   └── utils/
│       ├── commands.ts
│       └── markdown.ts
│
│  ── Onboarding (setup wizard) ──
│
├── onboarding/
│   ├── wizard.ts
│   ├── prompts.ts
│   └── configure.ts
│
│  ── Shared utilities ──
│
└── utils/
    ├── safe-path.ts
    └── sqlite.ts
```

## Test Tree (mirrors source)

```
tests/
├── host/
│   ├── server.test.ts
│   ├── router.test.ts
│   ├── ipc-server.test.ts
│   ├── proxy.test.ts
│   ├── taint-budget.test.ts
│   ├── registry.test.ts
│   ├── provider-map.test.ts
│   └── oauth.test.ts
├── agent/
│   ├── runner.test.ts
│   ├── ipc-client.test.ts
│   ├── ipc-transport.test.ts
│   ├── local-tools.test.ts
│   ├── ipc-tools.test.ts
│   ├── mcp-server.test.ts
│   ├── session.test.ts
│   └── runners/
│       ├── pi-session.test.ts
│       ├── dispatch.test.ts
│       └── claude-code.test.ts
├── providers/
│   ├── audit/
│   │   ├── file.test.ts
│   │   └── sqlite.test.ts
│   ├── memory/
│   │   ├── file.test.ts
│   │   ├── sqlite.test.ts
│   │   └── memu.test.ts
│   ├── scanner/
│   │   ├── basic.test.ts
│   │   ├── patterns.test.ts
│   │   └── promptfoo.test.ts
│   ├── channel/
│   │   └── slack.test.ts
│   ├── web/
│   │   ├── fetch.test.ts
│   │   └── tavily.test.ts
│   ├── browser/
│   │   └── container.test.ts
│   ├── credentials/
│   │   ├── env.test.ts
│   │   ├── encrypted.test.ts
│   │   └── keychain.test.ts
│   ├── skills/
│   │   ├── readonly.test.ts
│   │   └── git.test.ts
│   ├── sandbox/
│   │   ├── subprocess.test.ts
│   │   ├── docker.test.ts
│   │   └── nsjail.test.ts
│   └── scheduler/
│       ├── cron.test.ts
│       └── full.test.ts
├── cli/
│   ├── chat.test.ts
│   ├── send.test.ts
│   ├── index.test.ts
│   ├── components/
│   │   ├── App.test.tsx
│   │   ├── InputBox.test.tsx
│   │   ├── Message.test.tsx
│   │   ├── MessageList.test.tsx
│   │   ├── StatusBar.test.tsx
│   │   └── ThinkingIndicator.test.tsx
│   └── utils/
│       ├── commands.test.ts
│       └── markdown.test.ts
├── onboarding/
│   ├── wizard.test.ts
│   └── configure.test.ts
├── integration/
│   ├── e2e.test.ts
│   ├── smoke.test.ts
│   ├── phase1.test.ts
│   ├── phase2.test.ts
│   └── *.yaml
├── utils/
│   └── safe-path.test.ts
├── config.test.ts
├── db.test.ts
├── dotenv.test.ts
├── ipc-schemas.test.ts
├── logger.test.ts
├── paths.test.ts
├── sandbox-isolation.test.ts
└── ipc-fuzz.test.ts
```

## File Renames Summary

| Before | After | Reason |
|--------|-------|--------|
| `src/host.ts` | `src/main.ts` | "main" is universal for entry point |
| `src/ipc.ts` | `src/host/ipc-server.ts` | Clarifies which IPC end |
| `src/anthropic-proxy.ts` | `src/host/proxy.ts` | Dir provides context |
| `src/server.ts` | `src/host/server.ts` | Host-side code |
| `src/router.ts` | `src/host/router.ts` | Host-side code |
| `src/taint-budget.ts` | `src/host/taint-budget.ts` | Host-side code |
| `src/registry.ts` | `src/host/registry.ts` | Host-side code |
| `src/provider-map.ts` | `src/host/provider-map.ts` | Host-side code |
| `src/oauth.ts` | `src/host/oauth.ts` | Host-side (touches real creds) |
| `src/container/` | `src/agent/` | "agent" is clearer than "container" |
| `src/container/agent-runner.ts` | `src/agent/runner.ts` | Drop redundant prefix |
| `src/container/ipc-mcp-server.ts` | `src/agent/mcp-server.ts` | Dir provides "agent" context |
| `src/container/agents/` | `src/agent/runners/` | "runners" = implementation variants |
| `src/providers/types.ts` | Split into per-provider `types.ts` + `src/types.ts` | Co-located types |

## Types Split Plan

### src/types.ts (shared cross-cutting types)
- `Message`, `ContentBlock` — used by host, agent, and providers
- `TaintTag` — used everywhere
- `Config`, `ProviderRegistry` — used by host and onboarding
- `AgentType` — used by config and agent

### Per-provider types.ts files
Each provider directory gets types relevant to its interface:

| File | Types |
|------|-------|
| `providers/llm/types.ts` | `LLMProvider`, `ChatRequest`, `ChatChunk`, `ToolDef` |
| `providers/memory/types.ts` | `MemoryProvider`, `MemoryEntry`, `MemoryQuery`, `ConversationTurn` |
| `providers/scanner/types.ts` | `ScannerProvider`, `ScanTarget`, `ScanResult` |
| `providers/channel/types.ts` | `ChannelProvider`, `InboundMessage`, `OutboundMessage` |
| `providers/web/types.ts` | `WebProvider`, `FetchRequest`, `FetchResponse`, `SearchResult` |
| `providers/browser/types.ts` | `BrowserProvider`, `BrowserConfig`, `BrowserSession`, `PageSnapshot` |
| `providers/credentials/types.ts` | `CredentialProvider` |
| `providers/skills/types.ts` | `SkillStoreProvider`, `SkillMeta`, `SkillProposal`, `ProposalResult`, `SkillLogEntry`, `LogOptions`, `SkillScreenerProvider`, `ScreeningVerdict` |
| `providers/audit/types.ts` | `AuditProvider`, `AuditEntry`, `AuditFilter` |
| `providers/sandbox/types.ts` | `SandboxProvider`, `SandboxConfig`, `SandboxProcess` |
| `providers/scheduler/types.ts` | `SchedulerProvider`, `CronJobDef`, `ProactiveHint` |

Types that reference `TaintTag` import it from `../../types.js`.

## Migration Strategy

1. **Create directories first** (`host/`, `agent/runners/`)
2. **Move files with `git mv`** to preserve history
3. **Update all imports** — systematic find-and-replace
4. **Split types.ts** — create per-provider types, update imports
5. **Move tests** to mirror new source structure
6. **Update CLAUDE.md, architecture docs, provider-map.ts paths**
7. **Verify all tests pass** on both Node.js and Bun

All changes are mechanical (moves + import updates). No logic changes.

## What Doesn't Change

- Provider implementations (same code, same interfaces)
- CLI components (same structure, just tests move)
- Onboarding (stays where it is)
- Security invariants (SC-SEC-002 allowlist stays static)
- IPC protocol (schemas unchanged)
- Build/test commands (`npm run build`, `npm test`)
