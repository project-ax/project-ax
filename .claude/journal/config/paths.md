# Config: Paths

Path utilities, enterprise filesystem layout.

## [2026-03-05 05:20] — Add AX_CONFIG_PATH env var support to configPath()

**Task:** Allow AX_CONFIG_PATH env var to override configPath() for Kubernetes ConfigMap-mounted configs
**What I did:** Added env var check to configPath() in src/paths.ts, added two tests to existing tests/paths.test.ts
**Files touched:** src/paths.ts (modified), tests/paths.test.ts (modified)
**Outcome:** Success — all 27 tests pass including the 2 new AX_CONFIG_PATH tests
**Notes:** TDD approach: wrote failing test first, then implemented the one-line fix

## [2026-02-22 00:00] — Enterprise agent architecture: paths.ts foundation

**Task:** Implement enterprise agent architecture — multi-agent, multi-user, governance-controlled
**What I did:** Updated paths.ts with new enterprise layout functions: agentIdentityDir, agentWorkspaceDir, userWorkspaceDir, scratchDir, registryPath, proposalsDir. Updated doc comment with full enterprise filesystem layout.
**Files touched:** src/paths.ts (modified), .claude/journal.md (created), .claude/lessons.md (created)
**Outcome:** Partial — paths.ts foundation complete, remaining phases pending
**Notes:** Work in progress — committing initial paths foundation before continuing with registry, sandbox, memory, IPC, and prompt changes.
