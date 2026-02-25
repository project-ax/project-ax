import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { create } from '../../../src/providers/skills/readonly.js';
import { agentSkillsDir } from '../../../src/paths.js';
import type { SkillStoreProvider } from '../../../src/providers/skills/types.js';
import type { Config } from '../../../src/types.js';

const config = {} as Config;

let testHome: string;
let originalHome: string | undefined;

beforeEach(() => {
  testHome = join(tmpdir(), `ax-readonly-test-${randomUUID()}`);
  originalHome = process.env.AX_HOME;
  process.env.AX_HOME = testHome;

  // Create skills dir and seed a test skill
  const skillsPath = agentSkillsDir('main');
  mkdirSync(skillsPath, { recursive: true });
  writeFileSync(join(skillsPath, 'default.md'), '# Default Skill\n\nA test default skill.');
});

afterEach(() => {
  if (originalHome === undefined) {
    delete process.env.AX_HOME;
  } else {
    process.env.AX_HOME = originalHome;
  }
  rmSync(testHome, { recursive: true, force: true });
});

describe('skills-readonly', () => {
  let skills: SkillStoreProvider;

  beforeEach(async () => {
    skills = await create(config);
  });

  test('lists skills from persistent skills directory', async () => {
    const list = await skills.list();
    expect(Array.isArray(list)).toBe(true);
    expect(list.some(s => s.name === 'default')).toBe(true);
  });

  test('reads a skill file', async () => {
    const content = await skills.read('default');
    expect(typeof content).toBe('string');
    expect(content.length).toBeGreaterThan(0);
  });

  test('throws on path traversal in skill name', async () => {
    // safePath sanitizes this, so it won't find the file
    await expect(skills.read('../../etc/passwd')).rejects.toThrow();
  });

  test('propose throws (read-only)', async () => {
    await expect(
      skills.propose({ skill: 'test', content: 'test' })
    ).rejects.toThrow('read-only');
  });

  test('approve throws (read-only)', async () => {
    await expect(skills.approve('id')).rejects.toThrow('read-only');
  });

  test('reject throws (read-only)', async () => {
    await expect(skills.reject('id')).rejects.toThrow('read-only');
  });

  test('log returns empty array', async () => {
    const log = await skills.log();
    expect(log).toEqual([]);
  });
});
