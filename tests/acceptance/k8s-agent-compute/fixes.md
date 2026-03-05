# Fix List: K8s Agent Compute Architecture

**Generated from:** acceptance test results (2026-03-05, runs 1 & 2)
**Total issues found during testing:** 10 (all resolved during the test runs)

## Resolved During Testing

### FIX-1: NATS stream init job hardcodes --replicas=3 (RESOLVED)
**Test:** HT-3, KT-2
**Root cause:** Incorrect — replicas should match cluster config
**Location:** `charts/ax/templates/nats-stream-init-job.yaml`, `charts/ax/templates/_helpers.tpl`
**What was wrong:** `--replicas=3` hardcoded in all `nats stream add` commands. Fails on single-node kind.
**What was fixed:**
- Added `ax.natsReplicas` helper template that returns cluster replicas or 1 if clustering disabled
- Changed readiness check from `nats server ping` (requires system account) to `nats stream ls`
- Added `--defaults` flag for non-interactive stream creation

### FIX-2: values.yaml config doesn't match Zod schema (RESOLVED)
**Test:** KT-1 (host pod CrashLoopBackOff)
**Root cause:** Incorrect — config values used wrong field names and formats
**Location:** `charts/ax/values.yaml`
**What was wrong:**
- `scheduler.active_hours.start/end` used integers (8, 22) instead of "HH:MM" strings
- Missing required fields: `scheduler.max_token_budget`, `scheduler.heartbeat_interval_min`
- Invalid provider names: `scanner: regex` (should be `patterns`), `scheduler: sqlite` (should be `plainjob`)
- Invalid provider keys: `providers.history`, `providers.image` not in schema
- Missing required `providers.skills`
- Missing required `models.default` for LLM router
**What was fixed:** All fields corrected to match ConfigSchema in `src/config.ts`

### FIX-3: NATS JetStream memory store disabled by default (RESOLVED)
**Test:** KT-2
**Root cause:** Integration gap — NATS subchart defaults `memoryStore.enabled: false`
**Location:** `tests/acceptance/k8s-agent-compute/kind-values.yaml`
**What was wrong:** Memory-backed streams couldn't be created because JetStream had 0 bytes available
**What was fixed:** Set `nats.config.jetstream.memoryStore.enabled: true` and `maxSize: 256Mi`

### FIX-4: gVisor RuntimeClass blocks sandbox pods on kind (RESOLVED)
**Test:** KT-5, KT-8
**Root cause:** Design flaw — runtimeClassName was always set, even when gVisor unavailable
**Location:** `src/providers/sandbox/k8s-pod.ts`, `src/pool-controller/k8s-client.ts`
**What was wrong:** Pool controller couldn't create sandbox pods — k8s rejected them with "RuntimeClass gvisor not found"
**What was fixed:**
- k8s-pod.ts: Use spread operator to conditionally include `runtimeClassName` (only when non-empty)
- k8s-client.ts: Same pattern — omit `runtimeClassName` when not configured
- `K8S_RUNTIME_CLASS=""` env var now disables gVisor for dev/test environments

### FIX-5: PostgreSQL auth and image issues (RESOLVED)
**Test:** KT-1, KT-3
**Root cause:** Integration gap — Bitnami subchart values at wrong nesting level
**Location:** `tests/acceptance/k8s-agent-compute/kind-values.yaml`
**What was wrong:**
- `postgresql.internal.auth.password` is not where Bitnami reads it (needs `postgresql.auth.password`)
- `bitnami/postgresql:17.6.0-debian-12-r4` image not found
**What was fixed:** Moved auth config to correct Bitnami path, used `latest` image tagged as `17`

### FIX-6: Namespace mismatch (RESOLVED)
**Test:** KT-1
**Root cause:** Integration gap — chart defaults to namespace "ax" but tests use "ax-test"
**Location:** `tests/acceptance/k8s-agent-compute/kind-values.yaml`
**What was fixed:** Added `namespace.create: false` and `namespace.name: ax-test`

### FIX-7: NetworkPolicy blocks agent-runtime → k8s API (RESOLVED)
**Test:** IT-1 (initial attempt)
**Root cause:** Integration gap — Calico DNAT handling for ClusterIP services
**Location:** `charts/ax/templates/networkpolicies/agent-runtime-network.yaml`
**What was wrong:** Agent-runtime NetworkPolicy allowed port 443 egress, but the k8s API service (10.96.0.1:443) DNATs to the control plane on port 6443. Calico applies port checks after DNAT, so port 443 rule didn't match.
**What was fixed:** Added port 6443 to the egress rule alongside port 443.

### FIX-8: K8S_RUNTIME_CLASS env var missing from agent-runtime deployment (RESOLVED)
**Test:** IT-1 (second attempt)
**Root cause:** Incomplete — FIX-4 added env var support to the code but not to the Helm template
**Location:** `charts/ax/templates/agent-runtime/deployment.yaml`, `charts/ax/values.yaml`, kind-values.yaml
**What was wrong:** Agent-runtime pod had no `K8S_RUNTIME_CLASS` env var, so k8s-pod.ts defaulted to `gvisor`. Pod creation failed with "RuntimeClass gvisor not found".
**What was fixed:**
- Added `sandbox.runtimeClass` value (default: `gvisor`, kind override: `""`)
- Added `K8S_RUNTIME_CLASS` env var to agent-runtime deployment template

### FIX-9: Agent-runtime spawns agent loop in k8s pod instead of subprocess (RESOLVED)
**Test:** IT-1 (third attempt)
**Root cause:** Design flaw — processCompletion uses providers.sandbox to spawn the agent subprocess, but k8s-pod creates a separate pod that can't connect back via Unix socket IPC
**Location:** `src/host/agent-runtime-process.ts`
**What was wrong:** The agent runner was spawned as a k8s pod, which immediately exited because the IPC socket path (`/tmp/ax-xyz/proxy.sock`) doesn't exist in the new pod. Pods don't share filesystems.
**What was fixed:** Agent-runtime overrides `providers.sandbox` with the subprocess provider for spawning the agent conversation loop. The k8s-pod provider is kept for tool dispatch (sandbox worker pods).

### FIX-10: Invalid k8s label from IPC socket path (RESOLVED)
**Test:** IT-1 (third attempt, secondary error)
**Root cause:** Incorrect — `config.ipcSocket` path used as pod label without proper sanitization
**Location:** `src/providers/sandbox/k8s-pod.ts`
**What was wrong:** Socket path `/tmp/ax-vVlKPT/proxy.sock` was sanitized to `_tmp_ax-vVlKPT_proxy.sock` which starts with `_` — invalid for k8s labels (must start/end with alphanumeric).
**What was fixed:** Added `.replace(/^[^a-zA-Z0-9]+/, '')` and `.replace(/[^a-zA-Z0-9]+$/, '')` to strip leading/trailing non-alphanumeric characters.

## Remaining Work

All architecture gaps resolved. IT-3 and IT-4 now PASS.

### FIX-11: Wire NATS sandbox dispatch (RESOLVED)
- **IT-3, IT-4**: Tool execution now dispatched via NATS to sandbox worker pods with per-turn pod affinity.
- **Changes made:**
  - `agent-runtime-process.ts`: Instantiated `NATSSandboxDispatcher`, created `requestIdMap`, wired into `createIPCHandler`, added end-of-turn release and shutdown cleanup
  - `ipc-server.ts`: Added `natsDispatcher` + `requestIdMap` options, passed through to `createSandboxToolHandlers`
  - `nats-sandbox-dispatch.ts`: Fixed JetStream ack interference in claim — replaced `nc.request()` with manual `nc.publish()` + `nc.subscribe()` inbox filtering
  - `sandbox-tools.ts`: Added structured logging for dispatch lifecycle
  - `tests/host/nats-sandbox-dispatch.test.ts`: Updated mocks for new publish/subscribe claim pattern
