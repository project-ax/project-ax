# Client-Server Split Design

**Date:** 2026-02-09

## Summary

Split the current monolithic `npm start` (host.ts) into a server process (`ax serve`) and separate CLI clients (`ax chat`, `ax send`). The server exposes an HTTP API over a Unix socket. Clients are thin OpenAI-compatible HTTP clients. The server is stateless per-request — clients manage their own conversation history.

## Motivation

- **Daemon mode** — Server survives terminal close; connect/disconnect CLI sessions freely.
- **Multiple clients** — Several CLI sessions (or mixed CLI + API) connect simultaneously.
- **Faster reconnect** — Skip slow startup (config, providers, DBs) when sending a message.
- **Server logging** — Server stdout shows request activity, agent spawns, scanner verdicts, errors.

## Architecture

### Server (`ax serve`)

Long-running HTTP server on `~/.ax/ax.sock`. This is what `npm start` runs.

**Startup sequence:**
1. Parse CLI flags (`--daemon`, `--socket <path>`, `--config <path>`)
2. Load `.env`, load `ax.yaml`, initialize all providers
3. Open SQLite DBs (message queue, audit)
4. Start agent IPC server on `/tmp/ax-<random>/proxy.sock` (internal agent-to-host socket, unchanged)
5. Start HTTP server on `~/.ax/ax.sock` (client-facing socket)
6. Start Slack/Discord/etc. channel providers (server-side, unchanged)
7. Log `AX server listening on ~/.ax/ax.sock`
8. Register SIGINT/SIGTERM handlers for graceful shutdown

**Endpoints:**
- `POST /v1/chat/completions` — OpenAI-compatible. Streaming (SSE) and non-streaming.
- `GET /v1/models` — List available models.

**Request handling:** Same pipeline as today — parse request, take last user message, `router.processInbound()`, spawn sandbox, collect response, `router.processOutbound()`, stream back as SSE or return JSON.

**Concurrency:** Requests processed sequentially (queued). Second request waits until first agent finishes.

**Auth:** None needed — Unix socket file permissions provide access control.

### Interactive Client (`ax chat`)

Standalone script (~100-150 LOC). No dependency on server internals.

**State:** Local `messages` array that accumulates the conversation. Starts empty each launch.

**Loop:**
1. Print prompt `you> `
2. Read user input
3. Append `{role: "user", content: input}` to messages
4. POST to Unix socket: `{model: "default", messages, stream: true}`
5. Stream response, print each delta to stdout
6. Append `{role: "assistant", content: fullResponse}` to messages
7. Back to step 1

**Connection check:** On startup, try to connect to socket. If it fails, print `Server not running. Start it with: ax serve` and exit.

**Flags:**
- `--socket <path>` — override socket path (default `~/.ax/ax.sock`)
- `--no-stream` — non-streaming mode

**Exit:** Ctrl+C or Ctrl+D. No state persisted — closing loses the conversation.

### One-Shot Client (`ax send`)

~50 LOC. For scripting and pipes.

**Usage:**
```
ax send "what is the capital of France"
echo "summarize this" | ax send --stdin
```

**Behavior:**
1. Read message from CLI argument or stdin (`--stdin` / `-`)
2. POST single-message conversation to Unix socket (streaming)
3. Stream response text to stdout (raw, no prefixes — pipeable)
4. Exit 0 on success, 1 on error

**Flags:**
- `--socket <path>` — override socket path
- `--stdin` / `-` — read from stdin
- `--no-stream` — wait for full response
- `--json` — output full OpenAI JSON response

## File Structure

**New files:**
- `src/server.ts` — HTTP server (merged host + completions). Entry point for `ax serve`.
- `src/cli/chat.ts` — interactive client.
- `src/cli/send.ts` — one-shot client.
- `src/cli/index.ts` — subcommand router: `serve` / `chat` / `send` / `configure`.

**Modified:**
- `src/host.ts` — becomes thin wrapper calling `cli/index.ts`, or removed.
- `package.json` — scripts updated.

**Removed:**
- `src/completions.ts` — merged into `server.ts`.
- `src/providers/channel/cli.ts` — replaced by `ax chat`.
- `ConversationStore` in `src/db.ts` — server is stateless, clients manage history.

**package.json scripts:**
```json
"start": "NODE_NO_WARNINGS=1 tsx src/cli/index.ts serve",
"chat": "NODE_NO_WARNINGS=1 tsx src/cli/index.ts chat",
"send": "NODE_NO_WARNINGS=1 tsx src/cli/index.ts send"
```

**Socket path:** `~/.ax/ax.sock` default. Server removes stale socket on startup.

## What Stays Unchanged

- `src/ipc.ts` — agent-to-host IPC (separate internal socket)
- `src/ipc-schemas.ts` — IPC validation
- `src/container/` — agent-runner, ipc-transport, ipc-client, local-tools, ipc-tools
- `src/router.ts` — inbound/outbound scanning
- All providers except `channel/cli.ts`
- `src/db.ts` — MessageQueue stays (ConversationStore removed)
- `src/onboarding/` — `ax configure` routed through `cli/index.ts`
- Slack/Discord/etc. channels — still connect server-side

## Server Logging

Human-readable, one line per event to stdout:

```
[info]  AX server listening on ~/.ax/ax.sock
[info]  POST /v1/chat/completions — "what is the cap…" (42 chars)
[scan]  Input PASS — no threats detected
[agent] Spawning sandbox (seatbelt) for request req_abc123
[agent] Agent completed in 3.2s — 1,247 input / 384 output tokens
[scan]  Output PASS — clean
[info]  200 OK — streamed 384 tokens in 3.4s
[warn]  Scanner BLOCKED input — injection pattern detected
[error] Agent process exited with code 1
[sec]   CANARY LEAK detected — response redacted
```

Each request gets a short ID (e.g. `req_abc123`) for tracing through the log.

No structured logging for now. JSON format can be added later with `--log-format json`.
