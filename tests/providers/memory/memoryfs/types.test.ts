// tests/providers/memory/memoryfs/types.test.ts
import { describe, it, expect } from 'vitest';
import type {
  MemoryFSItem,
  MemoryFSConfig,
  MemoryType,
} from '../../../../src/providers/memory/memoryfs/types.js';
import { MEMORY_TYPES } from '../../../../src/providers/memory/memoryfs/types.js';

describe('MemoryFS types', () => {
  it('MEMORY_TYPES contains all six types', () => {
    expect(MEMORY_TYPES).toEqual([
      'profile', 'event', 'knowledge', 'behavior', 'skill', 'tool',
    ]);
  });

  it('MemoryFSItem has required fields', () => {
    const item: MemoryFSItem = {
      id: 'mem_abc123',
      content: 'Prefers TypeScript over JavaScript',
      memoryType: 'profile',
      category: 'preferences',
      contentHash: 'a1b2c3d4e5f6g7h8',
      confidence: 0.95,
      reinforcementCount: 1,
      lastReinforcedAt: '2026-03-01T00:00:00Z',
      createdAt: '2026-03-01T00:00:00Z',
      updatedAt: '2026-03-01T00:00:00Z',
      scope: 'default',
    };
    expect(item.memoryType).toBe('profile');
    expect(item.reinforcementCount).toBe(1);
  });

  it('MemoryFSConfig has required fields', () => {
    const config: MemoryFSConfig = {
      memoryDir: '/tmp/memory',
      enableItemReferences: false,
      summaryTargetTokens: 400,
      recencyDecayDays: 30,
      defaultMemoryTypes: ['profile', 'event'],
    };
    expect(config.memoryDir).toBe('/tmp/memory');
    expect(config.recencyDecayDays).toBe(30);
  });
});
