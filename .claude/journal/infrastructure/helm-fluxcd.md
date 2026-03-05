## [2026-03-05 05:30] — Helm Chart + FluxCD GitOps Implementation

**Task:** Convert raw k8s manifests into Helm chart with FluxCD GitOps, replacing scattered env vars with ConfigMap-mounted ax.yaml
**What I did:**
- Added AX_CONFIG_PATH env var support to configPath() (TDD)
- Added SANDBOX_TEMPLATE_DIR support to pool controller (TDD)
- Created full Helm chart at charts/ax/ with Chart.yaml, values.yaml, _helpers.tpl
- Created 15+ Helm templates: ConfigMap, Host, Agent Runtime, Pool Controller, Network Policies, Cloud SQL Proxy, NATS Stream Init Job
- Created FluxCD structure with SOPS config, Git/Helm sources, staging/production overlays
- Archived raw k8s/ manifests to k8s/archive/
**Files touched:** src/paths.ts, src/pool-controller/main.ts, tests/paths.test.ts, tests/pool-controller/main.test.ts, charts/ax/**, flux/**, .sops.yaml, .gitignore, k8s/archive/**
**Outcome:** Success — helm lint passes, all 2411 tests pass, template rendering correct with all conditional flags working
**Notes:** NATS and PostgreSQL are subchart dependencies. ConfigMap approach reuses existing loadConfig() code path. Security contexts stay hardcoded in k8s-client.ts.

## [2026-03-05 12:00] — K8s Agent Compute Acceptance Tests (ST + HT)

**Task:** Run acceptance tests from tests/acceptance/k8s-agent-compute/test-plan.md
**What I did:**
- Ran all 16 structural tests (ST-1 through ST-16) — verified source code implements all k8s architecture components
- Ran all 8 Helm template tests (HT-1 through HT-8) — verified chart renders correctly with kind overrides
- Created kind-values.yaml test override file
- Skipped 18 cluster-dependent tests (KT, IT, SEC) — kind CLI not installed
- Found 2 issues: hardcoded --replicas=3 in NATS init job (major), heavy tier nodeSelector not clearable (minor)
**Files touched:** tests/acceptance/k8s-agent-compute/kind-values.yaml (created), tests/acceptance/k8s-agent-compute/results.md (created), tests/acceptance/k8s-agent-compute/fixes.md (created)
**Outcome:** 24/24 executed tests PASS. 18 tests SKIPPED (need kind cluster). 2 issues found in Helm templates.
**Notes:** All source code for the three-layer k8s architecture is structurally complete. The NATS init job replicas issue (FIX-1) will block kind cluster deployment.

## [2026-03-05 13:00] — K8s Acceptance Tests: Kind Cluster + Security (Full Run)

**Task:** Deploy AX to kind cluster and run KT, IT, SEC acceptance tests
**What I did:**
- Created kind cluster (2 workers), installed Calico CNI, built/loaded Docker images
- Fixed 6 issues blocking deployment: NATS replicas, config schema, JetStream memory, gVisor RuntimeClass, PostgreSQL auth, namespace mismatch
- Ran all 42 tests: 37 PASS, 0 FAIL, 5 SKIPPED (need ANTHROPIC_API_KEY)
- All security invariants verified at runtime: no creds in sandbox, NetworkPolicy enforced, hardened security context, ingress blocked
**Files touched:** charts/ax/templates/nats-stream-init-job.yaml, charts/ax/templates/_helpers.tpl, charts/ax/values.yaml, src/providers/sandbox/k8s-pod.ts, src/pool-controller/k8s-client.ts, tests/acceptance/k8s-agent-compute/kind-values.yaml, tests/acceptance/k8s-agent-compute/results.md, tests/acceptance/k8s-agent-compute/fixes.md
**Outcome:** Success — 37/42 tests pass, architecture deploys correctly on kind, security model verified at runtime
**Notes:** gVisor runtimeClassName now conditional (empty string disables it for kind). Values.yaml had multiple config schema mismatches that surfaced only at runtime. NATS subchart defaults memoryStore.enabled=false which blocks JetStream memory streams.
