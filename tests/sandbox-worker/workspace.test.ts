import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import { provisionWorkspace, releaseWorkspace, computeCacheKey } from '../../src/sandbox-worker/workspace.js';
import { mkdirSync, rmSync, existsSync, writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';

describe('workspace provisioning', () => {
  let testRoot: string;

  beforeEach(() => {
    testRoot = join(tmpdir(), `ax-ws-test-${randomUUID()}`);
    mkdirSync(testRoot, { recursive: true });
    // Unset GCS bucket to test non-cache paths
    delete process.env.WORKSPACE_CACHE_BUCKET;
  });

  afterEach(() => {
    try { rmSync(testRoot, { recursive: true, force: true }); } catch {}
  });

  test('computeCacheKey produces deterministic hash', () => {
    const key1 = computeCacheKey('https://github.com/org/repo.git', 'main');
    const key2 = computeCacheKey('https://github.com/org/repo.git', 'main');
    const key3 = computeCacheKey('https://github.com/org/repo.git', 'develop');

    expect(key1).toBe(key2); // Same inputs → same key
    expect(key1).not.toBe(key3); // Different branch → different key
    expect(key1.length).toBe(16); // 16 hex chars
    expect(key1).toMatch(/^[a-f0-9]{16}$/);
  });

  test('provisions empty workspace when no gitUrl', async () => {
    const result = await provisionWorkspace(testRoot, 'session-1');

    expect(result.source).toBe('empty');
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
    expect(existsSync(result.path)).toBe(true);
    expect(result.path).toContain('session-1');
  });

  test('provisions empty workspace with config but no gitUrl', async () => {
    const result = await provisionWorkspace(testRoot, 'session-2', {});

    expect(result.source).toBe('empty');
    expect(existsSync(result.path)).toBe(true);
  });

  test('workspace path is within root', async () => {
    const result = await provisionWorkspace(testRoot, 'my-session');

    expect(result.path.startsWith(testRoot)).toBe(true);
  });

  test('releaseWorkspace cleans up directory', async () => {
    const result = await provisionWorkspace(testRoot, 'cleanup-test');
    // Add a file
    writeFileSync(join(result.path, 'test.txt'), 'hello');
    expect(existsSync(result.path)).toBe(true);

    await releaseWorkspace(result.path);

    expect(existsSync(result.path)).toBe(false);
  });

  test('releaseWorkspace is safe on missing directory', async () => {
    // Should not throw
    await releaseWorkspace(join(testRoot, 'nonexistent-path'));
  });

  test('provisions separate workspaces for different sessions', async () => {
    const r1 = await provisionWorkspace(testRoot, 'session-a');
    const r2 = await provisionWorkspace(testRoot, 'session-b');

    expect(r1.path).not.toBe(r2.path);
    expect(existsSync(r1.path)).toBe(true);
    expect(existsSync(r2.path)).toBe(true);
  });
});
