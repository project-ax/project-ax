# Skills Import, Installation & Execution — Architecture & Implementation Plan

**Date:** 2026-03-03
**Status:** Draft (rev 2 — incorporates security review feedback)
**Scope:** Replace structured `kind`/`package` installer taxonomy with raw `run` commands; define the full install lifecycle, host/agent boundary, and IPC commands.

---

## Context

AX skills currently use a structured `kind`/`package` taxonomy for installation (`kind: brew`, `kind: npm`, etc.), requiring AX to understand every package manager. This is unnecessary complexity — once a human approves a command, `run: npm install -g prettier` is simpler and more flexible than `kind: npm` + `package: prettier`. This plan replaces the taxonomy with raw `run` commands and defines the full install lifecycle: what runs where, what IPC commands are needed, and how approval works.

### Design Decisions

- **Agent-initiated install with host approval gate.** The agent can request installation via IPC, but the host always requires user approval before executing any command. **No commands — including checks — execute before approval.**
- **Load-time warning for `requires.bins`.** Missing binaries are flagged as warnings when the skill loads, but the skill is not blocked. The agent knows what's missing and can initiate install.
- **Inspect→execute integrity.** Execute requests are bound to the inspected content via a SHA-256 token, closing the TOCTOU window between inspect and execute.
- **Async execution.** Install commands run via async `child_process.execFile`, never `execSync`, to avoid blocking the host event loop.
- **Cross-platform binary lookup.** Binary existence checks use Node's `child_process.execFile` with platform-appropriate commands (`where` on Windows, `command -v` on POSIX), not bare `which`.

---

## 1. New SKILL.md Install Format

**Old (being replaced):**
```yaml
metadata:
  openclaw:
    install:
      - kind: brew
        formula: steipete/tap/gogcli
        bins: [gog]
      - kind: node
        package: mcporter
        bins: [mcporter]
```

**New:**
```yaml
metadata:
  openclaw:
    install:
      - run: "brew install steipete/tap/gogcli"
        label: "Install gog via Homebrew"
        bin: gog
        os: [macos, linux]
      - run: "npm install -g mcporter"
        label: "Install mcporter via npm"
        bin: mcporter
```

Each step:
- **`run`** (required): Shell command to execute on the host
- **`label`** (optional): Human-readable description for the approval prompt. Defaults to the `run` value
- **`bin`** (optional): Binary name to check for existence. If the binary is found in PATH, the step is skipped. This is **declarative metadata** — the host resolves it via a safe PATH lookup (not arbitrary shell execution). No commands run before user approval.
- **`os`** (optional): Platform filter — `linux`, `macos`, `windows`

> **Why `bin` instead of `check`?** The original design used `check: "gog --version"` — an arbitrary shell command. This bypasses the approval gate: the host would execute user-supplied commands during the inspect phase, before the user has approved anything. By making this a declarative binary name, the host controls what executes (a PATH lookup), and skill authors can't smuggle arbitrary commands into the pre-approval path.

---

## 2. What Runs Where

```
┌──────────────────────────────────────────────────────────────┐
│                    AGENT (sandboxed)                          │
│                                                              │
│  - Reads skill content (skill_read)                          │
│  - Sees requires.bins warnings at load time                  │
│  - Calls skill_install(phase:'inspect') to get status        │
│  - Receives inspectToken (content hash) from host            │
│  - Presents install steps to user for approval               │
│  - Calls skill_install(phase:'execute', inspectToken, stepN) │
│  - CANNOT run install commands directly (no network)         │
│                                                              │
└─────────────────────────┬────────────────────────────────────┘
                          │ IPC (Unix socket)
┌─────────────────────────┴────────────────────────────────────┐
│                    HOST (trusted)                             │
│                                                              │
│  - Parses skill install steps from SKILL.md                  │
│  - Resolves `bin` fields via safe PATH lookup (no shell)     │
│  - Executes approved `run` commands (async, has network)     │
│  - Validates inspectToken matches current skill content      │
│  - Persists install state (scoped by agentId + skill name)   │
│  - Audits every install action                               │
│  - Enforces timeout (5 min default per step)                 │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

**Key principles**:
- Install commands always run on the host (they need network for `npm install`, `brew install`, etc.). The agent can *request* installation, but the host executes it, and only after user approval through the conversation.
- **Nothing executes before approval.** The inspect phase uses safe PATH lookups for `bin` fields — no arbitrary shell commands.
- **Content integrity.** The inspect response includes an `inspectToken` (SHA-256 of the install steps). Execute requests must present this token; the host re-hashes current content and rejects mismatches. This closes the TOCTOU gap where skill content could change between inspect and execute.

---

## 3. IPC Commands

### New actions

| Action | Purpose |
|--------|---------|
| `skill_install` | Two-phase: `inspect` (check what's needed) or `execute` (run one approved step) |
| `skill_install_status` | Query persisted install state for a skill |

### `skill_install` schema (`src/ipc-schemas.ts`)

```typescript
export const SkillInstallSchema = ipcAction('skill_install', {
  skill: safeString(200),
  phase: z.enum(['inspect', 'execute']),
  stepIndex: z.number().int().min(0).max(50).optional(),  // required for 'execute'
  inspectToken: safeString(128).optional(),                // required for 'execute'; SHA-256 hex from inspect
});

export const SkillInstallStatusSchema = ipcAction('skill_install_status', {
  skill: safeString(200),
});
```

The `inspectToken` binds an execute request to the exact skill content that was inspected. The host rejects execute requests where the token doesn't match the current skill's install steps hash.

### Existing actions (unchanged)

`skill_read`, `skill_list`, `skill_propose`, `skill_search` — no changes.

### Existing action (minor change)

`skill_import` — no schema change, but the manifest it generates uses the new `run`-based format internally.

---

## 4. Install Flow

### Two-phase design: inspect → execute

**Phase 1: Inspect** — agent calls `skill_install({ skill: "gog", phase: "inspect" })`

Host does:
1. Parse skill's install steps
2. Filter by current OS
3. For each step with a `bin` field, perform a safe PATH lookup (see §4.1) — **no shell execution**
4. For `requires.bins`, perform the same safe PATH lookup
5. Compute `inspectToken` = SHA-256 hex of the canonical JSON of the filtered install steps array
6. Return step list with statuses (`needed` or `satisfied`) and the `inspectToken`

Response:
```json
{
  "skill": "gog",
  "status": "needs_install",
  "inspectToken": "a1b2c3d4e5f6...",
  "binChecks": [{ "bin": "gog", "found": false }],
  "steps": [
    {
      "index": 0,
      "run": "brew install steipete/tap/gogcli",
      "label": "Install gog via Homebrew",
      "status": "needed",
      "bin": "gog",
      "binFound": false
    }
  ]
}
```

**Agent presents to user**:
> Skill 'gog' needs a dependency installed:
> 1. **Install gog via Homebrew** — `brew install steipete/tap/gogcli`
>
> Approve?

**Phase 2: Execute** — after user approves, agent calls `skill_install({ skill: "gog", phase: "execute", stepIndex: 0, inspectToken: "a1b2c3d4e5f6..." })`

Host does:
1. Re-parse skill install steps and compute current content hash
2. **Reject if `inspectToken` doesn't match** — skill content changed since inspect; agent must re-inspect
3. Re-check `bin` via safe PATH lookup (defense in depth — may have been installed since inspect)
4. If bin found now → return `already_satisfied`, skip
5. Execute `run` command via **async `child_process.execFile`** with timeout (see §4.2)
6. Re-check bin to verify success
7. Persist state (scoped by agentId), audit log
8. Return result with stdout/stderr, exit code, duration

**Why two-phase?** The agent needs to show the user exactly what will run BEFORE it runs. Each `execute` call handles one step. The agent controls the UX — it can present all steps at once or one at a time.

### 4.1 Safe Binary Lookup (cross-platform)

The `bin` field is resolved without shell execution. Implementation:

```typescript
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

async function binExists(name: string): Promise<boolean> {
  // Reject anything that isn't a simple binary name (no paths, no shell metacharacters)
  if (!/^[a-zA-Z0-9_.-]+$/.test(name)) return false;

  const cmd = process.platform === 'win32' ? 'where' : 'command';
  const args = process.platform === 'win32' ? [name] : ['-v', name];

  try {
    await execFileAsync(cmd, args, { timeout: 5000 });
    return true;
  } catch {
    return false;
  }
}
```

Key properties:
- **No shell.** Uses `execFile` (not `exec`), so no shell metacharacter expansion.
- **Input validated.** The `name` regex rejects paths (`/`, `\`), shell operators (`|`, `;`, `$`), etc.
- **Cross-platform.** `command -v` on POSIX (more portable than `which`), `where` on Windows.
- **Timeout.** 5-second cap prevents hanging on broken PATH entries.

### 4.2 Async Command Execution

Install commands (`run` fields) execute via `child_process.execFile('/bin/sh', ['-c', cmd])` wrapped in a promise, **not `execSync`**. This prevents blocking the host event loop — a single 5-minute install step with `execSync` would stall all IPC handling, heartbeats, and concurrent agent requests.

```typescript
async function executeInstallStep(cmd: string, timeoutMs = 300_000): Promise<ExecResult> {
  const { stdout, stderr } = await execFileAsync(
    '/bin/sh', ['-c', cmd],
    { timeout: timeoutMs, maxBuffer: 10 * 1024 * 1024 }
  );
  return { stdout, stderr, exitCode: 0 };
}
```

On Windows, use `cmd.exe /c` instead of `/bin/sh -c`.

---

## 5. `requires.bins` Checking

**Timing**: Load-time warning (warn but don't block).

Warnings surface at **two points**, ensuring the agent sees them regardless of how the skill is loaded:

1. **`skill_list` response.** When the host builds the skill list, it checks `requires.bins` via the safe `binExists()` lookup (§4.1). Missing bins are included as `warnings` in each skill's metadata entry. This is the primary path for prompt-loaded skills.

2. **`skill_read` response.** When the agent reads a specific skill, the host performs the same check and attaches warnings to the response. This catches skills loaded outside the prompt path (e.g., on-demand reads during conversation).

In both cases the skill still loads — it's a warning, not a gate. The agent knows what's missing and can initiate install via `skill_install`.

The `skill_install` inspect phase does the authoritative check on the host, where the PATH matches the install target.

> **Why both `skill_list` and `skill_read`?** The original plan only attached warnings via `skill_list` for prompt-time loading. But the current prompt skill loading path is separate from the IPC `skill_list` response path — warnings attached only to `skill_list` wouldn't reliably surface in the agent prompt. By also attaching to `skill_read`, we guarantee the agent sees them whenever it interacts with the skill.

---

## 6. Type Changes

### `src/providers/skills/types.ts`

**Replace** `AgentSkillInstaller`:

```typescript
// Remove AgentSkillInstaller

// Add:
export interface SkillInstallStep {
  run: string;
  label?: string;
  bin?: string;    // Declarative binary name for PATH lookup (not an executable command)
  os?: string[];
}
```

**Update** `ParsedAgentSkill.install` from `AgentSkillInstaller[]` → `SkillInstallStep[]`

**Update** `GeneratedManifest.install.steps` shape:

```typescript
install: {
  steps: Array<{
    run: string;
    label?: string;
    bin?: string;
    os?: string[];
    approval: 'required';
  }>;
};
```

**Add** `SkillInstallState` for persisting install progress:

```typescript
export interface SkillInstallState {
  agentId: string;          // Scoped per agent — prevents cross-agent state collision
  skillName: string;
  inspectToken: string;     // SHA-256 of the install steps at time of last inspect
  steps: Array<{
    run: string;
    status: 'pending' | 'skipped' | 'completed' | 'failed';
    updatedAt: string;
    output?: string;
    error?: string;
  }>;
  status: 'not_started' | 'in_progress' | 'completed' | 'partial' | 'failed';
  updatedAt: string;
}
```

**Add** `SkillInstallInspectResponse` for the inspect phase return type:

```typescript
export interface SkillInstallInspectResponse {
  skill: string;
  status: 'needs_install' | 'satisfied';
  inspectToken: string;
  binChecks: Array<{ bin: string; found: boolean }>;
  steps: Array<{
    index: number;
    run: string;
    label: string;
    status: 'needed' | 'satisfied';
    bin?: string;
    binFound?: boolean;
  }>;
}
```

---

## 7. Parser Changes — `src/utils/skill-format-parser.ts`

Replace `parseInstallSpecs()` with `parseInstallSteps()`. Include backward-compat conversion from old `kind`/`package` format:

```
kind: brew, formula: X   → run: "brew install X",  bin: first of bins[]
kind: node, package: X   → run: "npm install -g X", bin: first of bins[]
kind: npm, package: X    → run: "npm install -g X", bin: first of bins[]
kind: pip, package: X    → run: "pip install X",    bin: first of bins[]
kind: go, package: X     → run: "go install X@latest", bin: first of bins[]
kind: cargo, package: X  → run: "cargo install X",  bin: first of bins[]
kind: uv, package: X     → run: "uv tool install X", bin: first of bins[]
```

If old format had `bins: [foo]`, synthesize `bin: "foo"` (first element). The `bin` field is a single binary name, not a list — for old multi-bin specs, use the first binary as the representative check.

---

## 8. Manifest Generator Changes — `src/utils/manifest-generator.ts`

Update install steps mapping from `kind`/`package`/`bins` to `run`/`label`/`bin`/`os`.

---

## 9. Handler Changes — `src/host/ipc-handlers/skills.ts`

Add `skill_install` and `skill_install_status` to `createSkillsHandlers()`.

- **`skill_install` inspect phase:** Parse skill, filter by OS, resolve `bin` fields via safe `binExists()` (§4.1), compute `inspectToken` (SHA-256 of canonical step JSON), return step statuses + token.
- **`skill_install` execute phase:**
  1. Re-parse skill, recompute content hash
  2. **Reject if `inspectToken` doesn't match** (skill changed since inspect — TOCTOU defense)
  3. Validate step index is in range
  4. Re-check `bin` via safe PATH lookup
  5. Execute command via **async `child_process.execFile`** with timeout (§4.2) — never `execSync`
  6. Verify with post-check (bin lookup)
  7. Persist state, audit log
- **`skill_install_status`:** Read persisted state from `~/.ax/data/skill-install-state/<agentId>/<skill-hash>.json`

### Install state path safety

State files are scoped by `agentId` and use a path-safe derived name:

```typescript
import { createHash } from 'node:crypto';
import { safePath } from '../../utils/safe-path.js';

function installStatePath(agentId: string, skillName: string): string {
  const safeAgentDir = safePath(baseDir, agentId);
  const skillHash = createHash('sha256').update(skillName).digest('hex').slice(0, 16);
  return safePath(safeAgentDir, `${skillHash}.json`);
}
```

This prevents:
- **Path traversal** via crafted skill names (e.g., `../../etc/passwd`) — `safePath()` rejects escapes
- **Cross-agent collision** — scoped by `agentId` directory
- **Filename injection** — skill name is hashed, not used directly as filename

Install state persisted via JSON files (same pattern as other AX state — simple, debuggable).

---

## 10. Tool Catalog Changes — `src/agent/tool-catalog.ts`

Add `install` and `install_status` operations to the existing `skill` tool:

```typescript
Type.Object({
  type: Type.Literal('install'),
  name: Type.String(),
  phase: Type.String({ description: '"inspect" or "execute"' }),
  stepIndex: Type.Optional(Type.Number()),
  inspectToken: Type.Optional(Type.String({ description: 'SHA-256 token from inspect response; required for execute' })),
}),
Type.Object({
  type: Type.Literal('install_status'),
  name: Type.String(),
}),
```

Add to `actionMap`:
```typescript
install: 'skill_install',
install_status: 'skill_install_status',
```

---

## 11. Security

- **No pre-approval execution.** The inspect phase performs only safe PATH lookups via `binExists()` (§4.1) — no arbitrary shell commands. The `bin` field is validated against `/^[a-zA-Z0-9_.-]+$/` before lookup. This closes the P0 approval gate bypass from the original design where `check` commands ran before approval.
- **Inspect→execute integrity (inspectToken).** Execute requests must present the `inspectToken` from their preceding inspect call. The host re-hashes the current skill content and rejects mismatches. This closes the TOCTOU gap where skill content could be modified between inspect and execute.
- **Async execution.** Install commands run via async `child_process.execFile`, not `execSync`, preventing a single slow install from blocking the host event loop, IPC handling, and heartbeats.
- **Taint budget**: Add `skill_install` to sensitive actions in `src/host/taint-budget.ts`. Tainted sessions can't trigger installs.
- **Screening**: Extend screener to scan `run` fields for `curl | bash`, backtick subshells, `$(...)` patterns. Same hard-reject patterns as skill body.
- **Audit**: Every phase logged — `skill_install_inspect`, `skill_install_execute`, `skill_install_step`, `skill_install_skip`.
- **No agent-constructed commands**: Agent passes skill name + step index + inspectToken, never the command itself. Commands come from parsed SKILL.md on the host side.
- **Path-safe state persistence.** Install state files use `safePath()` and hash-derived filenames, scoped by `agentId`. No raw skill names in file paths.

---

## 12. Files to Change

| File | Change |
|------|--------|
| `src/providers/skills/types.ts` | Replace `AgentSkillInstaller` → `SkillInstallStep`, add `SkillInstallState`, `SkillInstallInspectResponse`, update `ParsedAgentSkill` and `GeneratedManifest` |
| `src/utils/skill-format-parser.ts` | Replace `parseInstallSpecs` → `parseInstallSteps` with backward-compat |
| `src/utils/manifest-generator.ts` | Update install steps mapping |
| `src/utils/bin-exists.ts` | **New file** — cross-platform safe binary lookup (`binExists()`) |
| `src/ipc-schemas.ts` | Add `SkillInstallSchema` (with `inspectToken`), `SkillInstallStatusSchema` |
| `src/host/ipc-handlers/skills.ts` | Add `skill_install` (async, with inspectToken validation) and `skill_install_status` handlers |
| `src/host/ipc-server.ts` | Register new `skill_install` and `skill_install_status` in dispatch map |
| `src/agent/tool-catalog.ts` | Add `install` and `install_status` to skill tool |
| `src/host/taint-budget.ts` | Add `skill_install` to sensitive actions |
| `src/providers/skills/git.ts` | Attach `warnings` (missing bins) to `skill_read` responses |
| `src/agent/prompt/` | Update skill prompt modules to surface `warnings` from skill metadata |
| `tests/utils/skill-format-parser.test.ts` | Update for new format + backward-compat tests |
| `tests/utils/manifest-generator.test.ts` | Update for new manifest shape |
| `tests/utils/bin-exists.test.ts` | **New file** — tests for cross-platform binary lookup |
| `tests/host/ipc-handlers/skills-install.test.ts` | **New file** — install handler: inspect, execute, token validation, async exec |
| `tests/ipc-schemas.test.ts` | Add validation tests for `SkillInstallSchema` (inspectToken, stepIndex constraints) |
| `tests/host/ipc-server.test.ts` | Verify `skill_install` / `skill_install_status` dispatch registration |

---

## 13. Implementation Order

1. Types (`types.ts`) — `SkillInstallStep`, `SkillInstallState`, `SkillInstallInspectResponse`
2. `bin-exists.ts` utility + tests — cross-platform binary lookup, no shell
3. Parser (`skill-format-parser.ts`) + tests — `bin` field, backward-compat
4. Manifest generator (`manifest-generator.ts`) + tests
5. IPC schemas (`ipc-schemas.ts`) + schema tests — `inspectToken` field
6. Handler (`skills.ts`) + tests — async exec, inspectToken validation, safe state paths
7. IPC server dispatch registration (`ipc-server.ts`) + dispatch tests
8. Tool catalog (`tool-catalog.ts`) — `inspectToken` in install operation
9. Taint budget (`taint-budget.ts`)
10. `skill_read` / `skill_list` warning attachment (`git.ts`, prompt modules)
11. Full test suite pass

---

## 14. Verification

1. `npm test` — all existing tests pass (parser backward-compat ensures no breakage)
2. New parser tests: both old `kind`/`package` format and new `run` format parse correctly
3. New `binExists` tests: validates regex rejection of shell metacharacters, cross-platform command selection
4. New handler tests: inspect returns correct step statuses + inspectToken, execute validates token, async execution doesn't block, safe state path derivation
5. New IPC schema tests: `inspectToken` required for execute phase, rejected for inspect phase
6. New dispatch tests: `skill_install` and `skill_install_status` correctly registered in IPC server
7. Manual test: import a skill with install steps, call `skill_install` inspect, verify inspectToken in response, call execute with token, verify end-to-end

---

## 15. Resolved Review Feedback

This revision addresses the following review findings (from `skill-install-feedback.md`):

| # | Severity | Finding | Resolution |
|---|----------|---------|------------|
| 1 | **P0** | `check` commands execute pre-approval | Replaced `check` with declarative `bin` field; host resolves via safe PATH lookup, no shell (§1, §4.1) |
| 2 | **P1** | TOCTOU gap between inspect and execute | Added `inspectToken` (SHA-256 content hash); execute rejects mismatches (§3, §4, §11) |
| 3 | **P1** | `execSync` blocks host event loop | Replaced with async `child_process.execFile` (§4.2, §9) |
| 4 | **P1** | Windows: `which` doesn't exist | Cross-platform: `command -v` (POSIX) / `where` (Windows) via `execFile` (§4.1) |
| 5 | **P1** | Install state path unsafe/unscoped | `safePath()` + hash-derived filenames, scoped by `agentId` (§9) |
| 6 | **P2** | `requires.bins` warnings don't surface | Warnings attached to both `skill_list` and `skill_read` responses (§5) |
| 7 | **P2** | File/test impact underestimated | Added 7 files to change list: `bin-exists.ts`, `ipc-server.ts`, `git.ts`, prompt modules, and 4 test files (§12) |
