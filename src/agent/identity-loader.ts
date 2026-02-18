import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { IdentityFiles } from './prompt/types.js';

function readFile(dir: string, filename: string): string {
  try {
    return readFileSync(join(dir, filename), 'utf-8');
  } catch {
    return '';
  }
}

export interface IdentityLoadOptions {
  /** Repo directory containing immutable files (AGENTS.md, BOOTSTRAP.md) */
  defDir?: string;
  /** ~/.ax/agents/<name>/ directory containing mutable files (SOUL.md, IDENTITY.md) */
  stateDir?: string;
  /** User ID for per-user USER.md loading */
  userId?: string;
}

export function loadIdentityFiles(opts: IdentityLoadOptions): IdentityFiles {
  const { defDir, stateDir, userId } = opts;

  const loadDef = (name: string) => defDir ? readFile(defDir, name) : '';
  const loadState = (name: string) => stateDir ? readFile(stateDir, name) : '';

  // USER.md is per-user: load from stateDir/users/<userId>/USER.md
  let user = '';
  if (stateDir && userId) {
    user = readFile(join(stateDir, 'users', userId), 'USER.md');
  }

  return {
    agents: loadDef('AGENTS.md'),
    soul: loadState('SOUL.md'),
    identity: loadState('IDENTITY.md'),
    user,
    bootstrap: loadDef('BOOTSTRAP.md'),
  };
}
