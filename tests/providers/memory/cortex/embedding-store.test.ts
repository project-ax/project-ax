import { describe, it, expect, afterEach } from 'vitest';
import { join } from 'node:path';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { EmbeddingStore } from '../../../../src/providers/memory/cortex/embedding-store.js';
import { create as createSqliteDb } from '../../../../src/providers/database/sqlite.js';
import type { DatabaseProvider } from '../../../../src/providers/database/types.js';
import type { Config } from '../../../../src/types.js';

const config = {} as Config;

describe('EmbeddingStore', () => {
  let tmpDir: string;
  let store: EmbeddingStore;
  let database: DatabaseProvider;

  async function createStore(dimensions = 3): Promise<EmbeddingStore> {
    tmpDir = mkdtempSync(join(tmpdir(), 'embedding-store-test-'));
    process.env.AX_HOME = tmpDir;
    database = await createSqliteDb(config);
    store = new EmbeddingStore(database, dimensions);
    return store;
  }

  afterEach(async () => {
    if (store) await store.close();
    if (database) await database.close();
    if (tmpDir) rmSync(tmpDir, { recursive: true, force: true });
    delete process.env.AX_HOME;
  });

  it('initializes without error', async () => {
    const s = await createStore();
    await s.ready();
  });

  it('upserts and checks embedding existence', async () => {
    const s = await createStore();
    await s.ready();

    const vec = new Float32Array([0.1, 0.2, 0.3]);
    await s.upsert('item-1', 'default', vec);

    expect(await s.hasEmbedding('item-1')).toBe(true);
    expect(await s.hasEmbedding('item-2')).toBe(false);
  });

  it('finds similar vectors ordered by distance', async () => {
    const s = await createStore();
    await s.ready();
    if (!s.available) return; // Skip if sqlite-vec not available

    await s.upsert('item-close', 'default', new Float32Array([0.1, 0.2, 0.3]));
    await s.upsert('item-mid', 'default', new Float32Array([0.5, 0.5, 0.5]));
    await s.upsert('item-far', 'default', new Float32Array([0.9, 0.8, 0.7]));

    const results = await s.findSimilar(new Float32Array([0.1, 0.2, 0.3]), 3);

    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results[0].itemId).toBe('item-close');
    expect(results[0].distance).toBeCloseTo(0, 1);

    for (let i = 1; i < results.length; i++) {
      expect(results[i].distance).toBeGreaterThanOrEqual(results[i - 1].distance);
    }
  });

  it('respects limit parameter', async () => {
    const s = await createStore();
    await s.ready();
    if (!s.available) return;

    await s.upsert('item-1', 'default', new Float32Array([0.1, 0.2, 0.3]));
    await s.upsert('item-2', 'default', new Float32Array([0.4, 0.5, 0.6]));
    await s.upsert('item-3', 'default', new Float32Array([0.7, 0.8, 0.9]));

    const results = await s.findSimilar(new Float32Array([0.1, 0.2, 0.3]), 2);
    expect(results.length).toBeLessThanOrEqual(2);
  });

  it('filters by scope', async () => {
    const s = await createStore();
    await s.ready();
    if (!s.available) return;

    await s.upsert('item-a', 'project-a', new Float32Array([0.1, 0.2, 0.3]));
    await s.upsert('item-b', 'project-b', new Float32Array([0.1, 0.2, 0.3]));
    await s.upsert('item-c', 'project-a', new Float32Array([0.4, 0.5, 0.6]));

    const results = await s.findSimilar(new Float32Array([0.1, 0.2, 0.3]), 10, 'project-a');

    expect(results.every(r => r.itemId.startsWith('item-a') || r.itemId.startsWith('item-c'))).toBe(true);
    expect(results.some(r => r.itemId === 'item-b')).toBe(false);
  });

  it('returns all items when scope is *', async () => {
    const s = await createStore();
    await s.ready();
    if (!s.available) return;

    await s.upsert('item-a', 'scope-1', new Float32Array([0.1, 0.2, 0.3]));
    await s.upsert('item-b', 'scope-2', new Float32Array([0.4, 0.5, 0.6]));

    const results = await s.findSimilar(new Float32Array([0.1, 0.2, 0.3]), 10, '*');
    expect(results.length).toBe(2);
  });

  it('deletes embeddings', async () => {
    const s = await createStore();
    await s.ready();
    if (!s.available) return;

    await s.upsert('item-1', 'default', new Float32Array([0.1, 0.2, 0.3]));
    expect(await s.hasEmbedding('item-1')).toBe(true);

    await s.delete('item-1');
    expect(await s.hasEmbedding('item-1')).toBe(false);
  });

  it('updates embedding on duplicate upsert', async () => {
    const s = await createStore();
    await s.ready();
    if (!s.available) return;

    await s.upsert('item-1', 'default', new Float32Array([0.1, 0.2, 0.3]));
    await s.upsert('item-1', 'default', new Float32Array([0.9, 0.8, 0.7]));

    const results = await s.findSimilar(new Float32Array([0.9, 0.8, 0.7]), 1);
    expect(results.length).toBe(1);
    expect(results[0].itemId).toBe('item-1');
    expect(results[0].distance).toBeCloseTo(0, 1);
  });

  it('lists unembedded items', async () => {
    const s = await createStore();
    await s.ready();
    if (!s.available) return;

    await s.upsert('item-1', 'default', new Float32Array([0.1, 0.2, 0.3]));

    const unembedded = await s.listUnembedded(['item-1', 'item-2', 'item-3']);
    expect(unembedded).toEqual(['item-2', 'item-3']);
  });

  it('returns empty for empty allItemIds', async () => {
    const s = await createStore();
    await s.ready();
    if (!s.available) return;

    const unembedded = await s.listUnembedded([]);
    expect(unembedded).toEqual([]);
  });

  it('scoped search finds correct within-scope nearest neighbors', async () => {
    const s = await createStore();
    await s.ready();
    if (!s.available) return;

    const query = new Float32Array([0.1, 0.2, 0.3]);

    await s.upsert('a-close', 'scope-a', new Float32Array([0.1, 0.2, 0.3]));
    await s.upsert('a-far', 'scope-a', new Float32Array([0.9, 0.8, 0.7]));

    for (let i = 0; i < 10; i++) {
      await s.upsert(`b-${i}`, 'scope-b', new Float32Array([
        0.1 + i * 0.01, 0.2 + i * 0.01, 0.3 + i * 0.01,
      ]));
    }

    const results = await s.findSimilar(query, 10, 'scope-a');
    expect(results).toHaveLength(2);
    expect(results.every(r => r.itemId.startsWith('a-'))).toBe(true);
    expect(results[0].itemId).toBe('a-close');
    expect(results[0].distance).toBeCloseTo(0, 1);
  });

  it('scoped search returns empty for scope with no embeddings', async () => {
    const s = await createStore();
    await s.ready();
    if (!s.available) return;

    await s.upsert('item-1', 'scope-a', new Float32Array([0.1, 0.2, 0.3]));

    const results = await s.findSimilar(new Float32Array([0.1, 0.2, 0.3]), 10, 'scope-nonexistent');
    expect(results).toEqual([]);
  });

  // ── userId scoping tests ──

  it('upsert stores userId in embedding_meta', async () => {
    const s = await createStore();
    await s.ready();
    if (!s.available) return;

    await s.upsert('item-alice', 'default', new Float32Array([0.1, 0.2, 0.3]), 'alice');
    await s.upsert('item-shared', 'default', new Float32Array([0.4, 0.5, 0.6]));

    expect(await s.hasEmbedding('item-alice')).toBe(true);
    expect(await s.hasEmbedding('item-shared')).toBe(true);
  });

  it('findSimilar with userId returns own + shared items', async () => {
    const s = await createStore();
    await s.ready();
    if (!s.available) return;

    await s.upsert('item-alice', 'project', new Float32Array([0.1, 0.2, 0.3]), 'alice');
    await s.upsert('item-shared', 'project', new Float32Array([0.15, 0.25, 0.35]));
    await s.upsert('item-bob', 'project', new Float32Array([0.12, 0.22, 0.32]), 'bob');

    const results = await s.findSimilar(new Float32Array([0.1, 0.2, 0.3]), 10, 'project', 'alice');

    const ids = results.map(r => r.itemId);
    expect(ids).toContain('item-alice');
    expect(ids).toContain('item-shared');
    expect(ids).not.toContain('item-bob');
  });

  it('findSimilar without userId returns all items in scoped query', async () => {
    const s = await createStore();
    await s.ready();
    if (!s.available) return;

    await s.upsert('item-alice', 'project', new Float32Array([0.1, 0.2, 0.3]), 'alice');
    await s.upsert('item-shared', 'project', new Float32Array([0.15, 0.25, 0.35]));
    await s.upsert('item-bob', 'project', new Float32Array([0.12, 0.22, 0.32]), 'bob');

    const results = await s.findSimilar(new Float32Array([0.1, 0.2, 0.3]), 10, 'project');
    expect(results).toHaveLength(3);
  });

  describe('graceful degradation when vectors unavailable', () => {
    it('returns safe defaults when vectorsAvailable is false', async () => {
      tmpDir = mkdtempSync(join(tmpdir(), 'embedding-store-test-'));
      process.env.AX_HOME = tmpDir;
      // Create a mock DatabaseProvider with vectorsAvailable = false
      const mockDb: DatabaseProvider = {
        db: null as any,
        type: 'sqlite',
        vectorsAvailable: false,
        async close() {},
      };
      store = new EmbeddingStore(mockDb, 3);
      await store.ready();

      expect(store.available).toBe(false);
      await store.upsert('item-1', 'default', new Float32Array([0.1, 0.2, 0.3]));
      expect(await store.hasEmbedding('item-1')).toBe(false);
      expect(await store.findSimilar(new Float32Array([0.1, 0.2, 0.3]), 10)).toEqual([]);
      expect(await store.listUnembedded(['item-1', 'item-2'])).toEqual([]);
      await store.delete('item-1');
      await store.close();
    });
  });
});
