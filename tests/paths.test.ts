import { describe, test, expect, afterEach } from 'vitest';
import { join } from 'node:path';
import { homedir } from 'node:os';

describe('paths', () => {
  const originalEnv = process.env.SURECLAW_HOME;

  afterEach(() => {
    if (originalEnv !== undefined) {
      process.env.SURECLAW_HOME = originalEnv;
    } else {
      delete process.env.SURECLAW_HOME;
    }
  });

  test('defaults to ~/.sureclaw', async () => {
    delete process.env.SURECLAW_HOME;
    const { sureclawHome, configPath, envPath, dataDir } = await import('../src/paths.js');
    expect(sureclawHome()).toBe(join(homedir(), '.sureclaw'));
    expect(configPath()).toBe(join(homedir(), '.sureclaw', 'sureclaw.yaml'));
    expect(envPath()).toBe(join(homedir(), '.sureclaw', '.env'));
    expect(dataDir()).toBe(join(homedir(), '.sureclaw', 'data'));
  });

  test('respects SURECLAW_HOME env override', async () => {
    process.env.SURECLAW_HOME = '/tmp/sc-test';
    const { sureclawHome, configPath, dataDir } = await import('../src/paths.js');
    expect(sureclawHome()).toBe('/tmp/sc-test');
    expect(configPath()).toBe('/tmp/sc-test/sureclaw.yaml');
    expect(dataDir()).toBe('/tmp/sc-test/data');
  });

  test('dataFile resolves under data dir', async () => {
    delete process.env.SURECLAW_HOME;
    const { dataFile } = await import('../src/paths.js');
    expect(dataFile('memory.db')).toBe(join(homedir(), '.sureclaw', 'data', 'memory.db'));
    expect(dataFile('audit', 'audit.jsonl')).toBe(
      join(homedir(), '.sureclaw', 'data', 'audit', 'audit.jsonl'),
    );
  });
});
