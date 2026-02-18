import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { loadIdentityFiles } from '../../src/agent/identity-loader.js';

describe('loadIdentityFiles', () => {
  let defDir: string;
  let stateDir: string;

  beforeEach(() => {
    const id = randomUUID();
    defDir = join(tmpdir(), `ax-def-${id}`);
    stateDir = join(tmpdir(), `ax-state-${id}`);
    mkdirSync(defDir, { recursive: true });
    mkdirSync(stateDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(defDir, { recursive: true, force: true });
    rmSync(stateDir, { recursive: true, force: true });
  });

  test('reads AGENTS.md and BOOTSTRAP.md from defDir', () => {
    writeFileSync(join(defDir, 'AGENTS.md'), '# Operator rules');
    writeFileSync(join(defDir, 'BOOTSTRAP.md'), '# Bootstrap');

    const files = loadIdentityFiles({ defDir, stateDir });
    expect(files.agents).toBe('# Operator rules');
    expect(files.bootstrap).toBe('# Bootstrap');
  });

  test('reads SOUL.md and IDENTITY.md from stateDir', () => {
    writeFileSync(join(stateDir, 'SOUL.md'), '# Soul');
    writeFileSync(join(stateDir, 'IDENTITY.md'), '# Identity');

    const files = loadIdentityFiles({ defDir, stateDir });
    expect(files.soul).toBe('# Soul');
    expect(files.identity).toBe('# Identity');
  });

  test('reads USER.md from stateDir/users/<userId>/', () => {
    const userDir = join(stateDir, 'users', 'U12345');
    mkdirSync(userDir, { recursive: true });
    writeFileSync(join(userDir, 'USER.md'), '# User prefs');

    const files = loadIdentityFiles({ defDir, stateDir, userId: 'U12345' });
    expect(files.user).toBe('# User prefs');
  });

  test('returns empty string for missing files', () => {
    const files = loadIdentityFiles({ defDir, stateDir });
    expect(files.agents).toBe('');
    expect(files.soul).toBe('');
    expect(files.identity).toBe('');
    expect(files.user).toBe('');
    expect(files.bootstrap).toBe('');
  });

  test('returns empty user when no userId provided', () => {
    writeFileSync(join(stateDir, 'USER.md'), '# Should not be read');

    const files = loadIdentityFiles({ defDir, stateDir });
    expect(files.user).toBe('');
  });

  test('returns empty strings when dirs are undefined', () => {
    const files = loadIdentityFiles({});
    expect(files.agents).toBe('');
    expect(files.soul).toBe('');
  });
});
