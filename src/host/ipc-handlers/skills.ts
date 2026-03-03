/**
 * IPC handlers: skill store (read, list, propose, import, search, install) and audit.
 */
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import type { ProviderRegistry } from '../../types.js';
import type { IPCContext } from '../ipc-server.js';
import type { SkillInstallStep, SkillInstallState, SkillInstallInspectResponse } from '../../providers/skills/types.js';
import { parseAgentSkill } from '../../utils/skill-format-parser.js';
import { generateManifest } from '../../utils/manifest-generator.js';
import { binExists } from '../../utils/bin-exists.js';
import { validateRunCommand, executeInstallStep, InstallSemaphore } from '../../utils/install-validator.js';
import { safePath } from '../../utils/safe-path.js';
import { dataDir } from '../../paths.js';
import * as clawhub from '../../clawhub/registry-client.js';

// Per-agent install concurrency limiter (§4.5)
const installSemaphore = new InstallSemaphore(1);

/**
 * Filter install steps by the current OS platform.
 */
function filterByOS(steps: SkillInstallStep[]): SkillInstallStep[] {
  const platform = process.platform === 'darwin' ? 'macos'
    : process.platform === 'win32' ? 'windows'
    : 'linux';

  return steps.filter(step => {
    if (!step.os || step.os.length === 0) return true;
    return step.os.includes(platform);
  });
}

/**
 * Compute inspect token: SHA-256 hex of canonical JSON of install steps.
 * This binds execute requests to the exact content that was inspected (TOCTOU defense).
 */
function computeInspectToken(steps: SkillInstallStep[]): string {
  const canonical = JSON.stringify(steps);
  return createHash('sha256').update(canonical).digest('hex');
}

/**
 * Derive a safe path for install state persistence.
 * Uses safePath + hash-derived filenames to prevent path traversal.
 */
function installStatePath(agentId: string, skillName: string): string {
  const baseDir = safePath(dataDir(), 'skill-install-state');
  const safeAgentDir = safePath(baseDir, agentId);
  const skillHash = createHash('sha256').update(skillName).digest('hex').slice(0, 16);
  return safePath(safeAgentDir, `${skillHash}.json`);
}

/**
 * Read persisted install state, or return null if not found.
 */
function readInstallState(agentId: string, skillName: string): SkillInstallState | null {
  try {
    const statePath = installStatePath(agentId, skillName);
    const raw = readFileSync(statePath, 'utf-8');
    return JSON.parse(raw) as SkillInstallState;
  } catch {
    return null;
  }
}

/**
 * Persist install state to disk.
 */
function writeInstallState(state: SkillInstallState): void {
  const statePath = installStatePath(state.agentId, state.skillName);
  const dir = statePath.slice(0, statePath.lastIndexOf('/'));
  mkdirSync(dir, { recursive: true });
  writeFileSync(statePath, JSON.stringify(state, null, 2), 'utf-8');
}

export function createSkillsHandlers(providers: ProviderRegistry) {
  return {
    skill_read: async (req: any) => {
      const content = await providers.skills.read(req.name);

      // Attach bin warnings to skill_read response (§5)
      const parsed = parseAgentSkill(content);
      const warnings: string[] = [];
      for (const bin of parsed.requires.bins) {
        const found = await binExists(bin);
        if (!found) {
          warnings.push(`Required binary "${bin}" not found in PATH`);
        }
      }

      return { content, ...(warnings.length > 0 ? { warnings } : {}) };
    },

    skill_list: async () => {
      const skills = await providers.skills.list();

      // Attach bin warnings per skill (§5)
      const enriched = await Promise.all(skills.map(async (s) => {
        try {
          const content = await providers.skills.read(s.name);
          const parsed = parseAgentSkill(content);
          const missingBins: string[] = [];
          for (const bin of parsed.requires.bins) {
            const found = await binExists(bin);
            if (!found) missingBins.push(bin);
          }
          return { ...s, ...(missingBins.length > 0 ? { warnings: missingBins.map(b => `Missing binary: ${b}`) } : {}) };
        } catch {
          return s;
        }
      }));

      return { skills: enriched };
    },

    skill_propose: async (req: any, ctx: IPCContext) => {
      await providers.audit.log({ action: 'skill_propose', sessionId: ctx.sessionId, args: { skill: req.skill } });
      return await providers.skills.propose(req);
    },

    skill_import: async (req: any, ctx: IPCContext) => {
      const { source, autoApprove } = req;

      // 1. Resolve source: clawhub:<name> or local SKILL.md content
      let skillMd: string;
      if (typeof source === 'string' && source.startsWith('clawhub:')) {
        const name = source.slice('clawhub:'.length);
        const detail = await clawhub.fetchSkill(name);
        skillMd = detail.skillMd;
      } else {
        skillMd = source;
      }

      // 2. Parse
      const parsed = parseAgentSkill(skillMd);

      // 3. Screen
      let screenResult;
      if (providers.screener?.screenExtended) {
        screenResult = await providers.screener.screenExtended(skillMd, parsed.permissions);
      } else if (providers.screener) {
        const basic = await providers.screener.screen(skillMd, parsed.permissions);
        screenResult = {
          verdict: basic.allowed ? 'APPROVE' as const : 'REJECT' as const,
          score: basic.allowed ? 0 : 1,
          reasons: basic.reasons.map(r => ({ category: 'screener', severity: 'FLAG' as const, detail: r })),
          permissions: parsed.permissions,
          excessPermissions: [],
        };
      } else {
        screenResult = { verdict: 'APPROVE' as const, score: 0, reasons: [], permissions: [], excessPermissions: [] };
      }

      if (screenResult.verdict === 'REJECT') {
        await providers.audit.log({
          action: 'skill_import_rejected',
          sessionId: ctx.sessionId,
          args: { skill: parsed.name, reasons: screenResult.reasons.map(r => r.detail) },
        });
        return {
          status: 'rejected',
          skill: parsed.name,
          screening: screenResult,
        };
      }

      // 4. Generate manifest
      const manifest = generateManifest(parsed);

      // 5. Propose
      const proposal = await providers.skills.propose({
        skill: parsed.name || 'imported-skill',
        content: skillMd,
        reason: `Imported from ${source.startsWith('clawhub:') ? 'ClawHub' : 'local'}. Screening: ${screenResult.verdict}`,
      });

      await providers.audit.log({
        action: 'skill_import',
        sessionId: ctx.sessionId,
        args: { skill: parsed.name, verdict: screenResult.verdict, proposalId: proposal.id },
      });

      return {
        status: 'imported',
        skill: parsed.name,
        screening: screenResult,
        manifest,
        proposal,
      };
    },

    skill_search: async (req: any, ctx: IPCContext) => {
      const { query, limit } = req;
      const results = await clawhub.search(query, limit ?? 20);
      await providers.audit.log({
        action: 'skill_search',
        sessionId: ctx.sessionId,
        args: { query },
      });
      return { results };
    },

    // ── skill_install: two-phase inspect/execute ─────────────────

    skill_install: async (req: any, ctx: IPCContext) => {
      const { skill: skillName, phase, stepIndex, inspectToken } = req;

      if (phase === 'inspect') {
        return await handleInstallInspect(skillName, providers, ctx);
      }

      if (phase === 'execute') {
        if (stepIndex === undefined || stepIndex === null) {
          return { ok: false, error: 'stepIndex is required for execute phase' };
        }
        if (!inspectToken) {
          return { ok: false, error: 'inspectToken is required for execute phase' };
        }
        return await handleInstallExecute(skillName, stepIndex, inspectToken, providers, ctx);
      }

      return { ok: false, error: `Unknown phase: ${phase}` };
    },

    // ── skill_install_status: query persisted state ──────────────

    skill_install_status: async (req: any, ctx: IPCContext) => {
      const state = readInstallState(ctx.agentId, req.skill);
      if (!state) {
        return { skill: req.skill, status: 'not_started', steps: [] };
      }
      return state;
    },

    audit_query: async (req: any) => {
      return { entries: await providers.audit.query(req.filter ?? {}) };
    },
  };
}

// ═══════════════════════════════════════════════════════
// Install phase handlers
// ═══════════════════════════════════════════════════════

async function handleInstallInspect(
  skillName: string,
  providers: ProviderRegistry,
  ctx: IPCContext,
): Promise<SkillInstallInspectResponse> {
  await providers.audit.log({
    action: 'skill_install_inspect',
    sessionId: ctx.sessionId,
    args: { skill: skillName },
  });

  // 1. Read and parse skill
  const content = await providers.skills.read(skillName);
  const parsed = parseAgentSkill(content);

  // 2. Filter by OS
  const filteredSteps = filterByOS(parsed.install);

  // 3. Validate run prefixes and resolve bins
  const binChecks: Array<{ bin: string; found: boolean }> = [];
  const steps: SkillInstallInspectResponse['steps'] = [];

  for (let i = 0; i < filteredSteps.length; i++) {
    const step = filteredSteps[i];

    // Validate command prefix (§4.2)
    const validation = validateRunCommand(step.run);

    // Safe PATH lookup for bin (§4.1)
    let binFound: boolean | undefined;
    if (step.bin) {
      binFound = await binExists(step.bin);
      binChecks.push({ bin: step.bin, found: binFound });
    }

    const stepStatus = !validation.valid ? 'invalid' as const
      : (binFound === true) ? 'satisfied' as const
      : 'needed' as const;

    steps.push({
      index: i,
      run: step.run,
      label: step.label ?? step.run,
      status: stepStatus,
      bin: step.bin,
      binFound,
      ...(validation.valid ? {} : { validationError: validation.reason }),
    });
  }

  // 4. Also check requires.bins
  for (const bin of parsed.requires.bins) {
    // Avoid double-checking bins already in install steps
    if (!binChecks.some(bc => bc.bin === bin)) {
      const found = await binExists(bin);
      binChecks.push({ bin, found });
    }
  }

  // 5. Compute inspect token
  const token = computeInspectToken(filteredSteps);

  const allSatisfied = steps.every(s => s.status === 'satisfied');

  return {
    skill: skillName,
    status: allSatisfied ? 'satisfied' : 'needs_install',
    inspectToken: token,
    binChecks,
    steps,
  };
}

async function handleInstallExecute(
  skillName: string,
  stepIndex: number,
  inspectToken: string,
  providers: ProviderRegistry,
  ctx: IPCContext,
): Promise<Record<string, unknown>> {
  // 1. Acquire semaphore (§4.5)
  if (!installSemaphore.tryAcquire(ctx.agentId)) {
    await providers.audit.log({
      action: 'skill_install_rate_limited',
      sessionId: ctx.sessionId,
      args: { skill: skillName, agentId: ctx.agentId },
    });
    return {
      status: 'rate_limited',
      error: 'Another install is already running for this agent. Please wait for it to complete.',
    };
  }

  try {
    // 2. Re-parse and recompute content hash (TOCTOU defense)
    const content = await providers.skills.read(skillName);
    const parsed = parseAgentSkill(content);
    const filteredSteps = filterByOS(parsed.install);
    const currentToken = computeInspectToken(filteredSteps);

    // 3. Reject if inspectToken doesn't match
    if (currentToken !== inspectToken) {
      await providers.audit.log({
        action: 'skill_install_token_mismatch',
        sessionId: ctx.sessionId,
        args: { skill: skillName, expected: inspectToken, actual: currentToken },
      });
      return {
        status: 'token_mismatch',
        error: 'Skill content changed since inspect — please re-inspect before executing.',
      };
    }

    // 4. Validate step index
    if (stepIndex < 0 || stepIndex >= filteredSteps.length) {
      return {
        status: 'invalid_step',
        error: `Step index ${stepIndex} is out of range (0-${filteredSteps.length - 1})`,
      };
    }

    const step = filteredSteps[stepIndex];

    // 5. Re-validate run prefix (defense in depth)
    const validation = validateRunCommand(step.run);
    if (!validation.valid) {
      return {
        status: 'invalid_command',
        error: validation.reason,
      };
    }

    // 6. Re-check bin (may have been installed since inspect)
    if (step.bin) {
      const binFound = await binExists(step.bin);
      if (binFound) {
        await providers.audit.log({
          action: 'skill_install_skip',
          sessionId: ctx.sessionId,
          args: { skill: skillName, step: stepIndex, bin: step.bin, reason: 'already_satisfied' },
        });
        return { status: 'already_satisfied', step: stepIndex, bin: step.bin };
      }
    }

    // 7. Execute command (§4.4)
    await providers.audit.log({
      action: 'skill_install_execute',
      sessionId: ctx.sessionId,
      args: { skill: skillName, step: stepIndex, run: step.run },
    });

    const startMs = Date.now();
    const result = await executeInstallStep(step.run);
    const durationMs = Date.now() - startMs;

    // 8. Post-check: verify bin after install
    let binVerified: boolean | undefined;
    if (step.bin) {
      binVerified = await binExists(step.bin);
    }

    // 9. Persist state
    const state: SkillInstallState = readInstallState(ctx.agentId, skillName) ?? {
      agentId: ctx.agentId,
      skillName,
      inspectToken,
      steps: filteredSteps.map(s => ({
        run: s.run,
        status: 'pending' as const,
        updatedAt: new Date().toISOString(),
      })),
      status: 'in_progress' as const,
      updatedAt: new Date().toISOString(),
    };

    const stepState = state.steps[stepIndex];
    if (stepState) {
      stepState.status = result.exitCode === 0 ? 'completed' : 'failed';
      stepState.updatedAt = new Date().toISOString();
      stepState.output = (result.stdout + result.stderr).slice(0, 10_000);
      if (result.exitCode !== 0) {
        stepState.error = `Exit code: ${result.exitCode}`;
      }
    }

    // Derive overall status
    const allCompleted = state.steps.every(s => s.status === 'completed' || s.status === 'skipped');
    const anyFailed = state.steps.some(s => s.status === 'failed');
    state.status = allCompleted ? 'completed' : anyFailed ? 'partial' : 'in_progress';
    state.updatedAt = new Date().toISOString();

    writeInstallState(state);

    await providers.audit.log({
      action: 'skill_install_step',
      sessionId: ctx.sessionId,
      args: {
        skill: skillName,
        step: stepIndex,
        exitCode: result.exitCode,
        durationMs,
        binVerified,
      },
    });

    return {
      status: result.exitCode === 0 ? 'completed' : 'failed',
      step: stepIndex,
      exitCode: result.exitCode,
      stdout: result.stdout.slice(0, 5000),
      stderr: result.stderr.slice(0, 5000),
      durationMs,
      binVerified,
    };
  } finally {
    // 8. Release semaphore (always — even on error/timeout)
    installSemaphore.release(ctx.agentId);
  }
}
