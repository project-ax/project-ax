---
name: ax-acceptance-test
description: Use when testing a major feature against its design plan — designs acceptance tests, runs them against a live AX server with real LLM calls, analyzes failures, and creates a prioritized fix list
---

## Overview

AX features were implemented from plan documents, and many have bugs, gaps, or design mismatches that unit tests don't catch because they use mocked LLMs and in-memory harnesses. Acceptance tests bridge this gap by validating features against their **original design goals** using a real running AX server with real LLM calls.

This skill walks you through a 5-phase workflow: pick a feature, design tests from the plan's acceptance criteria, run them live, analyze failures, and produce a fix list.

## When to use this skill

- A feature was implemented from a plan and you want to verify it actually works end-to-end
- You suspect a feature has gaps between what the plan specified and what was built
- You want to validate a subsystem before building on top of it
- After a refactor, to confirm nothing regressed against original design intent

## Phase 1: Feature Selection

**Ask the user** which feature to test. Present this reference table of testable features grouped by area. If the user isn't sure, suggest starting with a feature they recently had trouble with.

### Foundational / Reference Docs

| Feature | Plan File |
|---------|-----------|
| Core Architecture & Philosophy | `docs/plans/ax-prp.md` |
| IPC & Provider Contracts | `docs/plans/ax-architecture-doc.md` |
| Security Hardening (SC-SEC-*) | `docs/plans/ax-security-hardening-spec.md` |
| Skills Security Model | `docs/plans/armorclaw-skills-security.md` |

### Core Infrastructure (Design + Implementation pairs)

| Feature | Design Doc | Implementation Doc |
|---------|-----------|-------------------|
| Client/Server Split | `2026-02-09-client-server-split-design.md` | `2026-02-09-client-server-split-implementation.md` |
| Repo Restructure | `2026-02-10-repo-restructure-design.md` | `2026-02-10-repo-restructure-implementation.md` |
| Agent Identity & Bootstrap | `2026-02-10-agent-bootstrap-soul-evolution-design.md` | `2026-02-10-agent-bootstrap-soul-evolution-implementation.md` |
| Ink Chat UI | `2026-02-10-ink-chat-ui-design.md` | `2026-02-10-ink-chat-ui.md` |
| Channel Providers | `2026-02-14-channel-provider-design.md` | `2026-02-14-channel-provider-impl.md` |
| Logging & Telemetry | `2026-02-17-logging-telemetry-design.md` | `2026-02-17-logging-telemetry-impl.md` |
| OpenAI LLM Provider | `2026-02-20-openai-provider-design.md` | `2026-02-20-openai-provider-impl.md` |
| Slack Behavior | `2026-02-21-slack-behavior-design.md` | `2026-02-21-slack-behavior-impl.md` |
| Agent Orchestration | `2026-02-28-agent-orchestration-architecture.md` | `2026-02-28-orchestration-enhancements.md` |

### Standalone Feature Plans

| Feature | Plan File |
|---------|-----------|
| Onboarding Wizard | `2026-02-09-onboarding.md` |
| Configurable Agent Type | `2026-02-09-configurable-agent-type.md` |
| Taint Propagation | `2026-02-10-taint-propagation.md` |
| Credential-Injecting Proxy | `2026-02-10-credential-injecting-proxy.md` |
| Modular System Prompt | `2026-02-17-modular-system-prompt-architecture.md` |
| Heartbeat & Scheduler IPC | `2026-02-18-heartbeat-md.md` |
| Identity File Relocation | `2026-02-18-identity-file-relocation.md` |
| Conversation History | `2026-02-19-conversation-history.md` |
| Channel Assets (Images/Files) | `2026-02-20-channel-assets-implementation-plan.md` |
| Skill Self-Authoring | `2026-02-21-agent-skill-self-authoring.md` |
| LLM Router (Multi-Model) | `2026-02-21-llm-router-design.md` |
| Outbound Delivery (Proactive) | `2026-02-21-outbound-delivery-design.md` |
| PgBoss Scheduler | `2026-02-21-pgboss-scheduler.md` |
| Config Hot Reload | `2026-02-22-config-hot-reload.md` |
| Kysely DB Migrations | `2026-02-22-kysely-migrations.md` |
| Skills Architecture Comparison | `2026-02-25-compare-skills-architecture.md` |
| Plugin Framework | `2026-02-26-plugin-framework-design.md` |
| Monorepo Split | `2026-02-27-monorepo-split-implementation.md` |
| Streaming Event Bus | `2026-02-27-streaming-event-bus.md` |
| Tool Consolidation | `2026-02-28-tool-consolidation.md` |
| MemU Integration | `2026-02-28-memu-integration-plan.md` |
| MemoryFS v1 | `2026-03-01-memoryfs-implementation.md` |
| MemoryFS v2 | `2026-03-02-memoryfs-v2-plan.md` |
| PlainJob Scheduler | `2026-03-02-plainjob-scheduler.md` |
| LLM Webhook Transforms | `2026-03-02-llm-webhook-transforms.md` |
| Skills Install Architecture | `2026-03-03-skills-install-architecture.md` |

All plan files live in `docs/plans/`. After the user picks a feature, **read the plan document(s)** — both design and implementation docs if they exist as a pair.

## Phase 2: Acceptance Test Design

After reading the plan, extract every **acceptance criterion** — these are the "must" and "should" statements, success criteria, design goals, invariants, and behavioral requirements stated in the plan.

### Categorize each criterion

| Category | What it tests | How it's verified |
|----------|--------------|-------------------|
| **Structural** | Code shape, file existence, interface contracts, invariants | Read source files, grep for patterns, check types |
| **Behavioral** | Feature works correctly via chat interaction | Send messages to AX server, check response + side effects |
| **Integration** | Multi-step flows, state persistence, cross-component interaction | Multi-turn conversations with session persistence, check DB/files |

### Design test cases

For each criterion, write a test case using the templates below. **Prefer structural tests** — they're deterministic and catch real implementation gaps. Use behavioral tests for things that can only be verified through actual agent interaction.

#### Structural Test Template

```markdown
### ST-<number>: <descriptive name>

**Criterion:** <quote or paraphrase from the plan>
**Plan reference:** <plan filename, section heading>

**Verification steps:**
1. Read `<file path>` and check that <specific pattern/interface/export exists>
2. Grep for `<pattern>` in `<directory>` to verify <what>
3. Check that <invariant> holds across <scope>

**Expected outcome:**
- [ ] <specific, checkable assertion>
- [ ] <another assertion>

**Pass/Fail:** _pending_
```

#### Behavioral Test Template

```markdown
### BT-<number>: <descriptive name>

**Criterion:** <quote or paraphrase from the plan>
**Plan reference:** <plan filename, section heading>

**Setup:**
- <any config changes, seed data, or prerequisites>

**Chat script:**
1. Send: `<exact message to send>`
   Expected behavior: <what the agent should do, not exact wording>
   Structural check: <observable side effect to verify — file, DB entry, audit log>

2. Send: `<follow-up message if multi-turn>`
   Expected behavior: <what should happen>
   Structural check: <what to verify>

**Expected outcome:**
- [ ] Agent response demonstrates <behavior>
- [ ] <file/DB/audit entry> was created/modified with <expected content>
- [ ] No <negative outcome — errors, crashes, leaked data>

**Pass/Fail:** _pending_
```

#### Integration Test Template

```markdown
### IT-<number>: <descriptive name>

**Criterion:** <quote or paraphrase from the plan>
**Plan reference:** <plan filename, section heading>

**Setup:**
- <config, seed data, running services>
- Session ID: `acceptance:<feature>:it<number>` (3+ colon-separated segments required)

**Sequence:**
1. [Step description]
   Action: <send message / check file / call API>
   Verify: <expected state after this step>

2. [Step description]
   Action: <next action>
   Verify: <expected state>

(continue for all steps)

**Expected final state:**
- [ ] <end-to-end assertion>
- [ ] <state persistence assertion>

**Pass/Fail:** _pending_
```

### Save the test plan

Write all test cases to `tests/acceptance/<feature-name>/test-plan.md` with this structure:

```markdown
# Acceptance Tests: <Feature Name>

**Plan document(s):** <filename(s)>
**Date designed:** <YYYY-MM-DD>
**Total tests:** <count> (ST: <n>, BT: <n>, IT: <n>)

## Summary of Acceptance Criteria

<Numbered list of all criteria extracted from the plan>

## Structural Tests

<ST-1, ST-2, etc.>

## Behavioral Tests

<BT-1, BT-2, etc.>

## Integration Tests

<IT-1, IT-2, etc.>
```

**Before executing, present the test plan to the user for review.** They may want to skip certain tests, adjust expectations, or add criteria you missed.

## Phase 3: Test Execution

### Test isolation: use a temporary AX_HOME

**CRITICAL**: Never run acceptance tests against the user's real `~/.ax` directory. Always create an isolated temporary home so tests don't pollute real data.

#### Test fixtures

Acceptance tests use dedicated config, identity, and credentials files — never the user's `~/.ax`:

| File | Purpose |
|------|---------|
| `tests/acceptance/fixtures/ax.yaml` | Test config — models, providers, embedding settings, memory recall |
| `tests/acceptance/fixtures/IDENTITY.md` | Deterministic agent identity (neutral, concise, no emojis) |
| `tests/acceptance/fixtures/SOUL.md` | Deterministic agent personality (predictable, factual) |
| `.env.test` (project root) | API keys for tests — copy from `tests/acceptance/fixtures/.env.test.example` |

Edit `fixtures/ax.yaml` to change which models the tests use (default LLM, embedding model, etc.) without affecting the user's real `~/.ax/ax.yaml`.

Credentials live in `.env.test` in the project root (gitignored). Copy the example file and fill in your keys:
```bash
cp tests/acceptance/fixtures/.env.test.example .env.test
# Edit .env.test with your API keys
```

#### Setup

```bash
# Create isolated test home
FIXTURES="tests/acceptance/fixtures"
TEST_HOME="/tmp/ax-acceptance-$(date +%s)"
mkdir -p "$TEST_HOME/data"

# Copy test config and credentials (from project, not from ~/.ax)
cp "$FIXTURES/ax.yaml" "$TEST_HOME/ax.yaml"
cp .env.test "$TEST_HOME/.env"

echo "Test home: $TEST_HOME"
```

After the server starts and creates the agent directory structure, **copy test identity files and remove bootstrap files** so the agent doesn't enter the first-run bootstrapping flow:

```bash
# Wait for server to create agent dirs, then install test identity
cp "$FIXTURES/IDENTITY.md" "$TEST_HOME/agents/main/agent/identity/IDENTITY.md"
cp "$FIXTURES/SOUL.md" "$TEST_HOME/agents/main/agent/identity/SOUL.md"
rm -f "$TEST_HOME/agents/main/agent/identity/BOOTSTRAP.md"
rm -f "$TEST_HOME/agents/main/agent/BOOTSTRAP.md"
```

All subsequent commands in the test session MUST set `AX_HOME=$TEST_HOME`. The test home path should be stored and reused throughout the entire test run.

### Server management

Before running behavioral or integration tests, start the AX server in the isolated test home:

```bash
# LOG_SYNC=1 forces synchronous file writes so `tail -f` shows entries
# immediately. Without it, pino buffers ~4KB before flushing.
AX_HOME="$TEST_HOME" LOG_LEVEL=debug LOG_SYNC=1 NODE_NO_WARNINGS=1 \
  tsx src/cli/index.ts serve > "$TEST_HOME/server-stdout.log" 2>&1 &
SERVER_PID=$!

# Wait for ready (poll up to 30s)
for i in $(seq 1 30); do
  curl -sf --unix-socket "$TEST_HOME/ax.sock" http://localhost/health && break
  sleep 1
done

# Verify
curl -sf --unix-socket "$TEST_HOME/ax.sock" http://localhost/health \
  && echo "SERVER_READY" || echo "SERVER_FAILED_TO_START"
```

If the server fails to start, check `$TEST_HOME/data/ax.log` and `$TEST_HOME/server-stdout.log` for errors. Do not proceed with behavioral/integration tests if the server is down.

**User can tail logs in another terminal:**
```bash
tail -f /tmp/ax-acceptance-*/data/ax.log
```

### Session ID format

AX requires session IDs with **3 or more colon-separated segments**. Two-segment IDs like `acceptance:bt1` will be rejected. Always use at least 3 segments:

```bash
# WRONG — will fail with "Invalid session_id"
--session "acceptance:bt1"

# CORRECT — 3+ colon-separated segments
--session "acceptance:memoryfs:bt1"
```

### Running structural tests

Execute directly using file reads and grep. For each structural test:
1. Read the specified files
2. Check for the expected patterns, interfaces, exports
3. Record **PASS** or **FAIL** with evidence (the actual content found or not found)

Structural tests can be run in parallel via subagents since they only read source files and don't touch the server.

### Running behavioral tests

**Run behavioral tests SEQUENTIALLY** (not in parallel) to avoid shared-DB interference. Multiple agents writing to the same SQLite memory store concurrently can corrupt assertions (e.g., one test checks "exactly 1 item" while another is inserting).

For each behavioral test:
1. Complete any setup steps
2. Send each message using `ax send` with the isolated test home:
   ```bash
   AX_HOME="$TEST_HOME" NODE_NO_WARNINGS=1 tsx src/cli/index.ts send \
     --no-stream --session "acceptance:<feature>:<test-id>" "<message>"
   ```
3. Capture the response
4. Check the structural side effects:
   - Read any files that should have been created/modified
   - Check the audit log: `sqlite3 "$TEST_HOME/data/audit.db" "SELECT ..."`
   - Check memory store: `sqlite3 "$TEST_HOME/data/memory/_store.db" "SELECT ..."`
   - Check embedding store: `sqlite3 "$TEST_HOME/data/memory/_vec.db" "SELECT ..."`
5. Evaluate behavioral expectations using judgment (not exact string matching)
6. Record PASS or FAIL with evidence

### Running integration tests

Run integration tests SEQUENTIALLY for the same shared-DB reasons.

For each integration test:
1. Complete setup
2. Execute the sequence step by step, using a **persistent session ID** so conversation state carries over:
   ```bash
   SESSION="acceptance:<feature>:it1"
   AX_HOME="$TEST_HOME" NODE_NO_WARNINGS=1 tsx src/cli/index.ts send \
     --no-stream --session "$SESSION" "<step 1 message>"
   # verify step 1
   AX_HOME="$TEST_HOME" NODE_NO_WARNINGS=1 tsx src/cli/index.ts send \
     --no-stream --session "$SESSION" "<step 2 message>"
   # verify step 2
   ```
3. After all steps, verify the expected final state
4. Record PASS or FAIL with evidence

### Recording results

Write results to `tests/acceptance/<feature-name>/results.md`:

```markdown
# Acceptance Test Results: <Feature Name>

**Date run:** <YYYY-MM-DD HH:MM>
**Server version:** <git commit hash>
**LLM provider:** <provider and model used>

## Summary

| Test | Category | Result | Notes |
|------|----------|--------|-------|
| ST-1 | Structural | PASS/FAIL | <brief note> |
| BT-1 | Behavioral | PASS/FAIL | <brief note> |
| IT-1 | Integration | PASS/FAIL | <brief note> |

**Overall: <X>/<Y> passed**

## Detailed Results

### ST-1: <name>
**Result:** PASS/FAIL
**Evidence:**
<what was actually found — quote relevant code, output, or file contents>

(repeat for each test)

### Failures

<List only the failures with full detail for analysis>
```

## Phase 4: Failure Analysis

For each failing test, perform root cause analysis:

### Analysis steps

1. **Identify the gap**: What does the plan say should happen vs. what actually happens?
2. **Locate the code path**: Read the source files in the plan's "Key Source Paths" (see feature reference table below). Trace from entry point to where the behavior diverges.
3. **Classify the root cause**:

| Root Cause | Description | Example |
|-----------|-------------|---------|
| **Missing** | Feature not implemented at all | Plan says "support X" but no code for X exists |
| **Incomplete** | Partially implemented, key parts missing | Handler exists but doesn't handle edge case Y |
| **Incorrect** | Implemented but does the wrong thing | Logic error, wrong data flow, bad assumption |
| **Integration gap** | Parts work independently but don't connect | Provider exists but isn't wired into the host |
| **Design flaw** | Plan itself has a problem | Contradictory requirements, impossible constraint |

4. **Classify severity**:
   - **Critical**: Core feature is broken, blocks usage
   - **Major**: Feature partially works but has significant gaps
   - **Minor**: Edge case or cosmetic issue

5. **Identify fix location**: Specific file(s) and function(s) that need to change

### Key source paths by feature

Use these to quickly find the relevant code when tracing failures:

| Feature Area | Key Source Paths |
|-------------|-----------------|
| Server & HTTP API | `src/host/server.ts`, `src/host/server-completions.ts`, `src/host/server-http.ts` |
| IPC & Schemas | `src/ipc-schemas.ts`, `src/host/ipc-server.ts`, `src/host/ipc-handlers/` |
| Router & Message Flow | `src/host/router.ts` |
| Agent Process | `src/agent/runner.ts`, `src/agent/ipc-client.ts`, `src/agent/tool-catalog.ts` |
| Agent Runners | `src/agent/runners/pi-session.ts`, `src/agent/runners/claude-code.ts` |
| Prompt System | `src/agent/prompt/builder.ts`, `src/agent/prompt/modules/` |
| Skills | `src/providers/skills/git.ts`, `src/providers/skills/readonly.ts`, `src/host/ipc-handlers/skills.ts` |
| Memory | `src/providers/memory/file.ts`, `src/providers/memory/sqlite.ts`, `src/providers/memory/memu.ts` |
| LLM Providers | `src/providers/llm/anthropic.ts`, `src/providers/llm/openai.ts`, `src/providers/llm/router.ts` |
| Sandbox | `src/providers/sandbox/seatbelt.ts`, `src/providers/sandbox/bwrap.ts`, `src/providers/sandbox/subprocess.ts` |
| Channels | `src/providers/channel/cli.ts`, `src/providers/channel/slack.ts` |
| Security | `src/host/taint-budget.ts`, `src/utils/safe-path.ts`, `src/host/provider-map.ts` |
| Credentials | `src/providers/credentials/env.ts`, `src/providers/credentials/encrypted.ts` |
| Scheduler | `src/providers/scheduler/cron.ts`, `src/providers/scheduler/plainjob.ts` |
| Audit | `src/providers/audit/file.ts`, `src/providers/audit/sqlite.ts` |
| Orchestration | `src/host/orchestration/` |
| Config | `src/config.ts`, `src/paths.ts` |
| CLI | `src/cli/index.ts`, `src/cli/chat.ts`, `src/cli/send.ts` |
| Conversation Store | `src/host/conversation-store.ts` |
| File Store | `src/host/file-store.ts` |
| Onboarding | `src/onboarding/`, `src/cli/bootstrap.ts` |
| Plugins | `src/host/plugin-host.ts` |
| Screener | `src/providers/screener/static.ts` |

## Phase 5: Fix List

Create a prioritized list of fixes and save to `tests/acceptance/<feature-name>/fixes.md`:

```markdown
# Fix List: <Feature Name>

**Generated from:** acceptance test results (<date>)
**Total issues:** <count> (Critical: <n>, Major: <n>, Minor: <n>)

## Critical

### FIX-1: <short description>
**Test:** <test ID that caught this>
**Root cause:** <Missing/Incomplete/Incorrect/Integration gap/Design flaw>
**Location:** `<file>:<function or line range>`
**What's wrong:** <concise description>
**What to fix:** <specific, actionable change>
**Estimated scope:** <number of files to touch>

(repeat for each critical issue)

## Major

(same format)

## Minor

(same format)

## Suggested Fix Order

1. <FIX-ID> — <reason this should go first, e.g., "blocks other fixes" or "most user-visible">
2. <FIX-ID> — <reason>
(continue)
```

Also add each fix to the **TaskCreate tool** so they're tracked in the current session.

## Workflow Summary

```
1. User picks a feature (or you suggest one)
2. Read the plan document(s)
3. Extract acceptance criteria
4. Design test cases (structural first, then behavioral, then integration)
5. Save test plan to tests/acceptance/<feature>/test-plan.md
6. Present test plan for user review
7. Ensure server is running (auto-start if needed)
8. Execute tests one by one, recording results
9. Save results to tests/acceptance/<feature>/results.md
10. For failures: trace to source, classify root cause and severity
11. Save fix list to tests/acceptance/<feature>/fixes.md
12. Add fixes to TaskCreate for tracking
```

### Cleanup

After all tests are complete, stop the server and optionally remove the temp home:

```bash
pkill -f "tsx src/cli/index.ts serve" 2>/dev/null
# Optionally keep for debugging:
# rm -rf "$TEST_HOME"
```

## Tips

- **Always use an isolated AX_HOME.** Never run acceptance tests against `~/.ax`. Create a temp directory, copy config files, and set `AX_HOME` on every command.
- **Start with structural tests.** They're fast, deterministic, and catch the most common gaps (missing implementations, broken wiring). If structural tests show a feature isn't wired up, skip behavioral tests for that feature — they'll obviously fail.
- **Run behavioral/integration tests sequentially.** They share a SQLite database. Parallel execution causes assertion failures from DB contention.
- **Use fresh sessions.** Each test run should use a unique session ID with 3+ colon-separated segments (e.g., `acceptance:feature:bt1`) to avoid pollution from prior conversations.
- **Check audit logs.** The audit log (`$TEST_HOME/data/audit.db`) is the best ground truth for what the server actually did during a request. If a behavioral test is ambiguous, the audit log tells you exactly which IPC actions fired.
- **Don't chase LLM wording.** The agent might phrase things differently each time. Focus on: did it call the right tools? Did the right data end up in the right place? Did it avoid doing the wrong thing?
- **One feature at a time.** Don't try to test everything in one session. Pick a feature, run its tests, fix the issues, then move on.
- **Tail logs for debugging.** Run `tail -f $TEST_HOME/data/ax.log` in another terminal to watch server activity in real time. The server must be started with `LOG_SYNC=1` for logs to flush immediately (without it, pino buffers ~4KB before writing).
