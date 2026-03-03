# Acceptance Tests

Manual acceptance tests that validate AX features against their original design plans using a real running server with real LLM calls.

These are different from the unit tests (`tests/`) and E2E tests (`tests/e2e/`) which use mocked LLMs and in-memory harnesses. Acceptance tests catch the gaps between what a plan specified and what was actually built.

## How to run

Use the `acceptance-test` Claude Code skill. It will walk you through selecting a feature, designing tests, executing them, and producing a fix list.

## Test isolation

Acceptance tests **always run in an isolated temporary `AX_HOME`** under `/tmp/` — never against the user's real `~/.ax` directory. The skill handles this automatically:

1. Creates `/tmp/ax-acceptance-<timestamp>/`
2. Copies config files (`ax.yaml`, `credentials.yaml`, `.env`) from `~/.ax`
3. Copies identity files (`IDENTITY.md`, `SOUL.md`) and removes `BOOTSTRAP.md` to skip first-run bootstrapping
4. Starts the server with `AX_HOME` pointing to the temp directory
5. All test commands use `AX_HOME=$TEST_HOME` to stay isolated

## Tailing logs

Start the server with `LOG_SYNC=1` so pino writes synchronously to the log file:

```bash
AX_HOME="$TEST_HOME" LOG_LEVEL=debug LOG_SYNC=1 NODE_NO_WARNINGS=1 \
  tsx src/cli/index.ts serve > "$TEST_HOME/server-stdout.log" 2>&1 &
```

Then tail in another terminal:

```bash
tail -f /tmp/ax-acceptance-*/data/ax.log
```

Without `LOG_SYNC=1`, pino buffers ~4KB before flushing and `tail -f` appears to hang.

## Directory structure

```
tests/acceptance/
  <feature-name>/
    test-plan.md      # Test cases designed from the plan's acceptance criteria
    results.md        # Execution results with evidence
    fixes.md          # Prioritized list of issues to fix
```

Each feature gets its own subdirectory. Test plans are reusable — you can re-run them after fixing issues to verify the fixes.

## Test categories

- **Structural (ST-*)**: Verify code shape, file existence, interface contracts. Fast and deterministic. Can run in parallel.
- **Behavioral (BT-*)**: Verify feature works via chat interaction with the live server. Non-deterministic but tests real behavior. Must run sequentially.
- **Integration (IT-*)**: Verify multi-step flows, state persistence, cross-component interaction. Uses session persistence. Must run sequentially.

## Session ID format

AX session IDs require **3 or more colon-separated segments**:

```bash
# WRONG — rejected by server
--session "acceptance:bt1"

# CORRECT
--session "acceptance:memoryfs:bt1"
```

## Tips

- Start with structural tests — if the code isn't wired up correctly, behavioral tests will obviously fail.
- Run behavioral and integration tests sequentially to avoid SQLite contention.
- Check the audit log (`$TEST_HOME/data/audit.db`) for ground truth on what the server did during a request.
