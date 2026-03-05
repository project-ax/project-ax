# Acceptance Test Results: K8s Agent Compute Architecture

**Date run:** 2026-03-05 (run 1: structural/helm/kind/security; run 2: integration with LLM; run 3: IT-3/IT-4 re-test after NATS dispatch wiring)
**Server version:** d74e253 (main) + local fixes (FIX-1 through FIX-11)
**Test platform:** kind v0.31.0 (Kubernetes v1.35.0) with Calico CNI on macOS (darwin/arm64)
**LLM provider:** OpenRouter (openrouter/anthropic/claude-sonnet-4)

## Summary

| Test | Category | Result | Notes |
|------|----------|--------|-------|
| ST-1 | Structural | PASS | StorageProvider interface with all 4 sub-stores and required methods |
| ST-2 | Structural | PASS | PostgreSQL provider uses pg Pool, FOR UPDATE SKIP LOCKED, transactions |
| ST-3 | Structural | PASS | EventBusProvider with inprocess and nats implementations |
| ST-4 | Structural | PASS | k8s-pod SandboxProvider: gVisor, readOnlyRootFS, runAsNonRoot, drop ALL, no creds |
| ST-5 | Structural | PASS | NATS session protocol: correct subjects, message types, queue group |
| ST-6 | Structural | PASS | NATS sandbox dispatch: per-turn pod affinity with claim/release protocol |
| ST-7 | Structural | PASS | NATS LLM proxy: ipc.llm.{sessionId} subscription + HTTP-to-NATS bridge |
| ST-8 | Structural | PASS | Host-process is stateless HTTP-only, no LLM calls, no sandbox spawning |
| ST-9 | Structural | PASS | Agent-runtime claims sessions from NATS queue group, publishes results |
| ST-10 | Structural | PASS | Sandbox worker: queue subscription, claim protocol, tool execution, safeResolve |
| ST-11 | Structural | PASS | Pool controller: reconciliation loop, minReady/maxReady, tier labels, metrics |
| ST-12 | Structural | PASS | IPC sandbox tools: dual local/NATS mode, safePath on all file ops |
| ST-13 | Structural | PASS | Provider map has storage, eventbus, k8s-pod entries (static paths) |
| ST-14 | Structural | PASS | Config types: StorageProviderName, EventBusProviderName, ProviderRegistry |
| ST-15 | Structural | PASS | AX_CONFIG_PATH env var with fallback to ~/.ax/ax.yaml |
| ST-16 | Structural | PASS | Sandbox worker: safeResolve, path traversal blocked, workspace cleanup |
| HT-1 | Helm Template | PASS | Chart renders cleanly (exit 0), all resource types present |
| HT-2 | Helm Template | PASS | ConfigMap ax-config renders ax.yaml with correct providers |
| HT-3 | Helm Template | PASS | 5 streams created (replicas now templated from values) |
| HT-4 | Helm Template | PASS | Host: AX_CONFIG_PATH, NATS_URL, DATABASE_URL, no LLM API keys |
| HT-5 | Helm Template | PASS | Agent-runtime: LLM API key(s), K8S_NAMESPACE, K8S_POD_IMAGE, SA |
| HT-6 | Helm Template | PASS | Pool controller: SANDBOX_TEMPLATE_DIR, tier JSONs with natsUrl |
| HT-7 | Helm Template | PASS | RBAC: agent-runtime pods CRUD + pods/log, pool-controller pods CRUD + patch |
| HT-8 | Helm Template | PASS | NetworkPolicy: sandbox -> NATS+DNS only, ingress blocked |
| KT-1 | Kind Cluster | PASS | All pods Running: host, agent-runtime, pool-controller, nats, postgresql |
| KT-2 | Kind Cluster | PASS | 5 JetStream streams: SESSIONS, TASKS, RESULTS, EVENTS, IPC |
| KT-3 | Kind Cluster | PASS | PostgreSQL connections work from host and agent-runtime pods |
| KT-4 | Kind Cluster | PASS | /health returns HTTP 200 with {"status":"ok"} |
| KT-5 | Kind Cluster | PASS | 1 warm sandbox pod created (minReady=1 met) |
| KT-6 | Kind Cluster | PASS | NATS connectivity confirmed from host, agent-runtime, pool-controller |
| KT-7 | Kind Cluster | PASS | /etc/ax/ax.yaml mounted, AX_CONFIG_PATH set in all pods |
| KT-8 | Kind Cluster | PASS | Warm pod connected to NATS, subscribed to tasks.sandbox.light |
| IT-1 | Integration | PASS | Chat flow: host → NATS → agent-runtime → OpenRouter LLM → response |
| IT-2 | Integration | PASS | SSE streaming: multiple data chunks + data: [DONE] |
| IT-3 | Integration | PASS | Bash tool dispatched via NATS to sandbox pod `ax-sandbox-light-cw659p1m`, returned "hello-from-sandbox" |
| IT-4 | Integration | PASS | write_file + bash: both dispatched to same pod via per-turn affinity (1 claim, 2 tool calls) |
| IT-5 | Integration | PASS | Deleted warm pod -> pool controller created replacement within 30s |
| IT-6 | Integration | PASS | History persisted in PostgreSQL across agent-runtime pod restart |
| SEC-1 | Security | PASS | No credentials in sandbox env (no API_KEY, PASSWORD, DATABASE_URL) |
| SEC-2 | Security | PASS | External internet BLOCKED, PostgreSQL BLOCKED, NATS REACHABLE |
| SEC-3 | Security | PASS | runAsNonRoot:true, uid=1000, readOnlyRootFS:true, drop ALL caps |
| SEC-4 | Security | PASS | Ingress blocked from host and agent-runtime to sandbox pod |

**Overall: 42/42 tests executed, 42 PASS, 0 PARTIAL, 0 FAIL, 0 SKIPPED**

---

## Fixes Applied During Testing

### FIX-1: NATS stream init job replicas (RESOLVED)
- Templated `--replicas` from `ax.natsReplicas` helper (respects cluster config)
- Changed readiness check from `nats server ping` to `nats stream ls` (no system account needed)
- Added `--defaults` flag for non-interactive mode

### FIX-2: values.yaml config schema mismatches (RESOLVED)
- Fixed `scheduler.active_hours.start/end` format (integer -> "HH:MM" string)
- Added missing `scheduler.max_token_budget` and `scheduler.heartbeat_interval_min`
- Fixed `providers.scanner` (regex -> patterns) and `providers.scheduler` (sqlite -> plainjob)
- Removed invalid `providers.history` and `providers.image` keys
- Added missing `providers.skills: readonly`
- Added required `models.default` for LLM router

### FIX-3: NATS JetStream memory store (RESOLVED)
- Set `memoryStore.enabled: true` in kind-values.yaml (default is false)
- Increased `maxSize` to 256Mi for 5 memory-backed streams

### FIX-4: gVisor RuntimeClass on kind (RESOLVED)
- Made `runtimeClassName` optional in k8s-pod.ts (spread operator, omitted when empty)
- Made `runtimeClassName` optional in pool-controller k8s-client.ts
- `K8S_RUNTIME_CLASS=""` env var disables gVisor for kind testing

### FIX-5: PostgreSQL auth and image (RESOLVED)
- Moved Bitnami subchart values to correct path (top-level under `postgresql`)
- Set explicit password for kind testing
- Used `bitnami/postgresql:latest` tagged as `:17` and loaded into kind

### FIX-6: Namespace configuration (RESOLVED)
- Added `namespace.create: false` and `namespace.name: ax-test` to kind-values

### FIX-7: NetworkPolicy blocks agent-runtime → k8s API (RESOLVED)
- Calico DNAT: ClusterIP 443 → actual port 6443 not matched by port 443 egress rule
- Added port 6443 to agent-runtime-network.yaml egress rules

### FIX-8: K8S_RUNTIME_CLASS env var missing from Helm template (RESOLVED)
- Added `sandbox.runtimeClass` value (default: `gvisor`) to chart
- Added `K8S_RUNTIME_CLASS` env var to agent-runtime deployment template
- kind-values.yaml overrides to `""` to disable gVisor

### FIX-9: Agent-runtime uses k8s-pod sandbox for agent loop (RESOLVED)
- processCompletion spawns agent loop via providers.sandbox which created a k8s pod
- k8s pod can't connect back via Unix socket IPC (different filesystem)
- Fixed: agent-runtime overrides sandbox provider to subprocess for agent loop
- k8s-pod provider kept for tool dispatch to sandbox worker pods

### FIX-10: Invalid k8s label from IPC socket path (RESOLVED)
- Socket path used as pod label starts with `_` (invalid for k8s)
- Added regex to strip leading/trailing non-alphanumeric characters

### FIX-11: Wire NATS sandbox dispatch into agent-runtime IPC pipeline (RESOLVED)
- **Root cause:** NATSSandboxDispatcher existed in code (ST-6 verified) but was never instantiated or connected to the IPC handler pipeline
- **Changes:**
  1. `agent-runtime-process.ts`: Instantiate `NATSSandboxDispatcher` when `config.providers.sandbox === 'k8s-pod'`; create `requestIdMap` for per-turn affinity; populate map in `processSessionRequest()`; release pods at end of turn; clean up on shutdown
  2. `ipc-server.ts`: Add `natsDispatcher` and `requestIdMap` to `IPCHandlerOptions`; pass through to `createSandboxToolHandlers()`
  3. `nats-sandbox-dispatch.ts`: Fix JetStream ack interference — `nc.request()` on subjects covered by JetStream streams returns the stream ack (`{"stream":"TASKS","seq":N}`) instead of the worker's reply. Changed claim to use manual `nc.publish()` + `nc.subscribe()` with inbox filtering to skip JetStream acks and wait for `claim_ack`
  4. `sandbox-tools.ts`: Add logging for NATS dispatch start/success/error
- **Discovery:** JetStream streams on `tasks.sandbox.*` intercept `nc.request()` reply-to — the 27-byte JetStream publish ack arrives before the sandbox worker's `claim_ack`, causing `nc.request()` to return the wrong response

---

## Detailed Results

### Structural Tests (16/16 PASS)

All source code for the three-layer k8s architecture is fully implemented. Key verified components:
- StorageProvider (sqlite + postgresql) with atomic dequeue
- EventBusProvider (inprocess + nats) with JetStream
- k8s-pod SandboxProvider with full security hardening
- NATS session protocol with queue groups and per-turn pod affinity
- LLM proxy for claude-code sandbox pods
- Stateless host-process, agent-runtime with NATS dispatch
- Sandbox worker with tool execution and safeResolve path protection
- Pool controller with reconciliation loop and tier management

### Helm Template Tests (8/8 PASS)

Chart renders correctly with all expected resources. All template assertions verified:
- ConfigMap mounts valid ax.yaml with k8s providers
- NATS init job creates 5 streams with correct subjects and retention policies
- Host has no LLM API keys, agent-runtime has them
- RBAC grants minimal pod CRUD permissions
- NetworkPolicy restricts sandbox to NATS+DNS only

### Kind Cluster Tests (8/8 PASS)

All components deploy and connect correctly:
- All pods reach Running state (host, agent-runtime, pool-controller, nats, postgresql)
- PostgreSQL accepts connections from host and agent-runtime
- NATS connectivity confirmed from all AX components
- Pool controller maintains warm sandbox pool (minReady=1)
- Warm sandbox pods connect to NATS and subscribe to task queue
- ConfigMap mounted at /etc/ax/ax.yaml in all pods

### Integration Tests (6/6 PASS)

- IT-1 (pi-session chat): PASS - Full flow: host → NATS session dispatch → agent-runtime → OpenRouter LLM → NATS result → host → HTTP response. Agent responded "Hello there friend!" to 3-word greeting request.
- IT-2 (SSE streaming): PASS - Multiple `data:` SSE chunks received with delta content. Final `data: [DONE]` confirmed. Content: "1\n2\n3\n4\n5" for count request.
- IT-3 (tool execution): PASS - Agent used bash tool (`echo hello-from-sandbox`). Tool dispatched via NATS to sandbox pod `ax-sandbox-light-cw659p1m`. Logs confirm: `nats_dispatch_start` → `claim_request_sent` (tasks.sandbox.light) → `pod_claimed` (sandbox.ax-sandbox-light-cw659p1m) → `nats_dispatch_success` (bash_result). Sandbox worker logs confirm: claim received, workspace provisioned, tool executed, released back to warm pool.
- IT-4 (per-turn pod affinity): PASS - Agent used write_file (create test.txt) then bash (cat test.txt) in one turn. Both dispatched to same pod `ax-sandbox-light-cw659p1m`. Logs confirm: first call triggered claim (1 publish to tasks.sandbox.light), second call reused existing pod (no new claim). File written by write_file was visible to subsequent bash call. Agent returned correct content "hello from sandbox".
- IT-5 (pool recovery): PASS - deleted warm pod replaced within 30s
- IT-6 (history persistence): PASS - Turn 1: agent stored "favorite number is 42". Agent-runtime pod deleted and replaced (old: `qf8r9` → new: `7m26d`). Turn 2: agent recalled "42" from PostgreSQL-persisted conversation history on new pod instance.

### Security Tests (4/4 PASS)

All security invariants verified at runtime:
- SEC-1: No credentials (API keys, passwords, database URLs) in sandbox pod environment
- SEC-2: NetworkPolicy enforced - external internet and PostgreSQL blocked, NATS reachable
- SEC-3: Hardened security context confirmed at runtime (non-root uid=1000, read-only FS, drop ALL)
- SEC-4: Ingress blocked - neither host nor agent-runtime can connect to sandbox pods

### Plan Deviation Notes

- DEV-1 (gVisor): Runtime class not available on kind, omitted from pod spec. Field verified in source code (ST-4).
- DEV-5 (NATS replicas): Set to 1 for single-node kind cluster via templated helper.
- DEV-8 (Agent subprocess): The agent-runtime must use subprocess (not k8s-pod) sandbox provider for the agent conversation loop. k8s pods can't share Unix socket IPC with the agent-runtime pod. This required FIX-9.
