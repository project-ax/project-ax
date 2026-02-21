# OpenAI-Compatible LLM Provider Design

**Date:** 2026-02-20
**Status:** Draft

## Goal

Enable pi-coding-agent to work with OpenAI-compatible LLM providers, starting with Groq + `moonshotai/kimi-k2-instruct-0905`. Build the foundation for multi-provider model selection without over-engineering.

## Model Naming Convention

Models use `<provider>/<model-id>` format:

- `groq/moonshotai/kimi-k2-instruct-0905`
- `anthropic/claude-sonnet-4-5`
- `fireworks/moonshotai/kimi-k2-instruct-0905`

The provider prefix identifies the **service** (not the API protocol), enabling future fallback chains like:

```yaml
primary: groq/kimi-k2-instruct-0905
fallbacks:
  - fireworks/kimi-k2-instruct-0905
  - anthropic/claude-sonnet-4-5
```

## Config Changes

Add `model` field to `ax.yaml`:

```yaml
agent: pi-coding-agent
model: groq/moonshotai/kimi-k2-instruct-0905
providers:
  llm: groq
  # ... rest unchanged
```

Add `model` to `ConfigSchema` in `src/config.ts` as an optional string. Add `model` to `Config` type in `src/types.ts`.

## Provider Architecture

### Provider Map

Add `groq` entry pointing to the shared OpenAI implementation:

```typescript
llm: {
  anthropic: '../providers/llm/anthropic.js',
  openai:    '../providers/llm/openai.js',
  groq:      '../providers/llm/openai.js',   // same implementation
  fireworks: '../providers/llm/openai.js',   // same implementation
  multi:     '../providers/llm/multi.js',
  mock:      '../providers/llm/mock.js',
},
```

Multiple provider-map entries can share the same module. Each gets a different provider name at creation time.

### Provider Creation (Option A: Name at Creation)

The `create()` function receives the provider name from the map key:

```typescript
// src/providers/llm/openai.ts
export async function create(config: Config, providerName: string): Promise<LLMProvider>
```

The provider uses `providerName` to derive environment variables:

- `${PROVIDER}_API_KEY` — e.g., `GROQ_API_KEY`
- `${PROVIDER}_BASE_URL` — e.g., `GROQ_BASE_URL` (optional, with sensible defaults)

Default base URLs for known providers:

| Provider | Default Base URL |
|----------|-----------------|
| `groq` | `https://api.groq.com/openai/v1` |
| `openai` | `https://api.openai.com/v1` |
| `fireworks` | `https://api.fireworks.ai/inference/v1` |

If `${PROVIDER}_BASE_URL` is set, it overrides the default.

### LLMProvider Interface

No changes needed. The existing interface handles this:

```typescript
export interface LLMProvider {
  name: string;
  chat(req: ChatRequest): AsyncIterable<ChatChunk>;
  models(): Promise<string[]>;
}
```

The `ChatRequest.model` field contains the model ID **with the provider prefix stripped** (e.g., `moonshotai/kimi-k2-instruct-0905`, not `groq/moonshotai/kimi-k2-instruct-0905`). Prefix stripping happens at the dispatch layer (host IPC handler or future multi-router).

### create() Signature Change

The `create(config)` signature gains an optional second parameter:

```typescript
export async function create(config: Config, providerName?: string): Promise<LLMProvider>
```

The `providerName` parameter is optional so existing providers (anthropic, mock) don't need changes. The host provider loader passes it from the map key.

## Message Format Translation

The OpenAI provider translates between AX's `Message[]` / `ChatChunk` types and OpenAI's chat completions format:

### Messages (AX → OpenAI)

| AX | OpenAI |
|----|--------|
| `{ role: 'system', content: '...' }` | `{ role: 'system', content: '...' }` |
| `{ role: 'user', content: '...' }` | `{ role: 'user', content: '...' }` |
| `{ role: 'assistant', content: '...' }` | `{ role: 'assistant', content: '...' }` |
| `{ role: 'assistant', content: [{ type: 'tool_use', ... }] }` | `{ role: 'assistant', tool_calls: [...] }` |
| `{ role: 'user', content: [{ type: 'tool_result', ... }] }` | `{ role: 'tool', tool_call_id: '...', content: '...' }` |

### Streaming Chunks (OpenAI → AX ChatChunk)

| OpenAI Event | AX ChatChunk |
|-------------|-------------|
| `delta.content` | `{ type: 'text', content: '...' }` |
| `delta.tool_calls` | `{ type: 'tool_use', toolCall: { id, name, args } }` |
| `finish_reason: 'stop'` | `{ type: 'done', usage: { ... } }` |

### Tool Definitions (AX → OpenAI)

```typescript
// AX ToolDef
{ name, description, parameters }

// OpenAI function tool
{ type: 'function', function: { name, description, parameters } }
```

## Data Flow (IPC Path)

```
pi-coding-agent
  → createIPCModel({ id: 'moonshotai/kimi-k2-instruct-0905', ... })
  → IPC { action: 'llm_call', model: 'moonshotai/kimi-k2-instruct-0905', messages, tools }
  → host ipc-server
  → providers.llm.chat({ model: 'moonshotai/kimi-k2-instruct-0905', messages, tools })
  → OpenAI SDK → POST https://api.groq.com/openai/v1/chat/completions
  → streaming ChatChunks back through IPC
```

## Model ID Threading

The model ID from config needs to flow through several layers:

1. `ax.yaml` → `config.model` (e.g., `groq/moonshotai/kimi-k2-instruct-0905`)
2. Config parsing splits on first `/`: provider = `groq`, modelId = `moonshotai/kimi-k2-instruct-0905`
3. Provider name selects the LLM provider from the registry
4. Model ID passes to `AgentConfig.model` for the runner
5. Runner uses it in `createIPCModel({ id: modelId })` or `ChatRequest.model`
6. Host IPC handler forwards to `provider.chat({ model: modelId, ... })`

## Files to Create/Modify

### New Files
- `src/providers/llm/openai.ts` — OpenAI-compatible LLM provider (~120 lines)
- `tests/providers/llm/openai.test.ts` — Unit tests

### Modified Files
- `src/types.ts` — Add optional `model?: string` to `Config`
- `src/config.ts` — Add `model` to `ConfigSchema`
- `src/host/provider-map.ts` — Add `groq` entry
- `src/host/provider-loader.ts` or equivalent — Pass provider name to `create()`
- `src/agent/runners/pi-session.ts` — Use config model ID instead of hardcoded `claude-sonnet-4-5-20250929`
- `src/host/ipc-server.ts` — Strip provider prefix if present before forwarding to provider
- `ax.yaml` — Add `model` field

## Testing Strategy

1. **Unit tests** for `openai.ts`: mock the OpenAI SDK, verify message translation, streaming, tool calls
2. **Integration test**: mock HTTP server returning OpenAI-format SSE, verify end-to-end through IPC
3. **Manual smoke test**: real Groq API with `moonshotai/kimi-k2-instruct-0905`

## Environment Setup for Testing

```bash
export GROQ_API_KEY=gsk_...
# GROQ_BASE_URL defaults to https://api.groq.com/openai/v1
```

## What This Does NOT Include

- Multi-provider routing (`multi` provider) — deferred
- Per-agent model overrides — deferred
- `/model` runtime switching — deferred
- Fallback chains — deferred
- Proxy path for OpenAI-compatible endpoints — deferred (IPC path only)

These are all additive changes that build on this foundation without refactoring.
