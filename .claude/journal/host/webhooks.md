# Webhooks — Journal

## [2026-03-05 15:30] — Port webhook handler to host-process.ts for k8s

**Task:** Wire webhook routes into host-process.ts so k8s deployments can receive webhooks
**What I did:**
1. Added imports: `createWebhookHandler`, `createWebhookTransform`, `webhookTransformPath`, `existsSync`, `readFileSync`
2. Added webhook handler creation after NATS connection, before HTTP request handler
3. Wired dispatch callback to publish `SessionRequest` to NATS (fire-and-forget)
4. Wired `transformExists`/`readTransform` using `webhookTransformPath()` + `existsSync`/`readFileSync`
5. Wired `audit` to `providers.audit.log()`
6. Skipped `recordTaint` (taint budget is a local-server concept; in k8s the agent runtime handles taint)
7. Updated drain check to include webhook prefix
8. Added webhook route before the 404 fallback
9. Fixed comment on line 3 (it claimed "admin dashboard" which isn't implemented here)
**Files touched:** `src/host/host-process.ts`
**Outcome:** Success — TypeScript compiles, all 2362 tests pass
**Notes:** Key difference from server.ts: dispatch uses NATS publish instead of `processCompletion()`. No `childConfig` needed since agent runtime pods load their own config.

## [2026-03-05 15:15] — K8s acceptance tests: webhooks not implemented in host-process.ts

**Task:** Re-run LLM webhook transform acceptance tests in the k8s environment
**What I did:**
1. Updated acceptance-test skill to use random namespaces for k8s tests (user feedback)
2. Built docker image, deployed AX to kind cluster (ax-test) in random namespace ax-wh-4f6f3e2f
3. Ran all 21 tests: 12 structural (env-independent, all pass), 9 behavioral/integration
4. All 9 behavioral/integration tests returned 404 — host-process.ts has no webhook routes
5. Wrote results-k8s.md and fixes.md documenting the single critical root cause
6. Added lesson about dual entry points (server.ts vs host-process.ts)
7. Tore down k8s namespace after tests
**Files touched:**
- `tests/acceptance/llm-webhook-transforms/results-k8s.md` (created)
- `tests/acceptance/llm-webhook-transforms/fixes.md` (created)
- `.claude/skills/acceptance-test/skill.md` (updated k8s setup to use random namespaces)
- `.claude/lessons/host/entries.md` (added dual-entry-point lesson)
- `.claude/lessons/index.md` (updated)
**Outcome:** 12/21 pass. All structural pass, all behavioral/integration fail. Single root cause: webhook routes missing from host-process.ts.
**Notes:** The fix is to port webhook route handling from server.ts to host-process.ts, adapting the dispatch callback to use NATS instead of direct processCompletion.

## [2026-03-03 02:45] — Address codex PR review comments on webhook PR

**Task:** Fix three issues flagged by the codex reviewer on PR #55.
**What I did:**
1. P1 — Enforce allowlist when transform omits agentId: Changed the allowlist guard in `server-webhooks.ts` to block when the allowlist is configured but no agentId is returned by the transform (previously only checked when agentId was explicitly set).
2. P2 — Route webhooks through configured path prefix: `server.ts` now reads `config.webhooks.path` and uses it instead of the hardcoded `/webhooks/` prefix.
3. P2 — Enforce configured max_body_bytes: Made `readBody()` in `server-http.ts` accept an optional `maxBytes` param. Webhook handler now passes `config.maxBodyBytes` (default 256KB) instead of always using the global 1MB limit.
**Files touched:**
- Modified: `src/host/server-webhooks.ts`, `src/host/server.ts`, `src/host/server-http.ts`
- Modified: `tests/host/server-webhooks.test.ts` (6 new tests)
**Outcome:** Success — all 2179 tests pass including 6 new tests covering the three fixes.
**Notes:** The allowlist fix is security-relevant (P1): without it, a transform that returns only `{ message: "..." }` would bypass the agent allowlist entirely, dispatching to the default agent.

## [2026-03-03 01:30] — Implement LLM-powered webhook transforms

**Task:** Implement inbound webhook support where HTTP payloads are transformed into agent-compatible messages by an LLM using markdown transform files.
**What I did:** Implemented all 8 tasks from the plan:
1. Added `webhooks` section to ConfigSchema and Config type
2. Added `webhooksDir()` and `webhookTransformPath()` path helpers with safePath
3. Created `server-webhooks.ts` with handler: bearer token auth, per-IP rate limiting, body parsing, transform file lookup, taint-tagging, audit logging
4. Created `webhook-transform.ts` with LLM transform: sends transform file as system prompt + payload as user content, parses structured JSON response with Zod validation
5. Wired webhook handler into `server.ts`: composition root creates handler when config.webhooks.enabled, route added to handleRequest, drain check included
6. Taint-tagging integrated into handler (recordTaint callback)
7. Audit logging integrated into handler (audit callback)
8. Wrote user-facing docs at `docs/webhooks.md` with examples for GitHub, Stripe, and generic alerts
**Files touched:**
- Modified: `src/config.ts`, `src/types.ts`, `src/paths.ts`, `src/host/server.ts`
- Created: `src/host/server-webhooks.ts`, `src/host/webhook-transform.ts`, `docs/webhooks.md`
- Created: `tests/host/server-webhooks.test.ts` (13 tests), `tests/host/webhook-transform.test.ts` (6 tests)
- Modified: `tests/config.test.ts` (4 new tests), `tests/paths.test.ts` (3 new tests)
**Outcome:** Success — 26 new tests all passing. Full suite passes (2 pre-existing failures in provider-map.test.ts and phase2.test.ts are unrelated).
**Notes:** Injected `transformExists` and `readTransform` as deps rather than using `existsSync`/`readFileSync` directly in the handler — makes testing much cleaner without needing temp files. The `null ?? default` gotcha with optional transform results caught me in tests (null is nullish, so `??` replaces it).
