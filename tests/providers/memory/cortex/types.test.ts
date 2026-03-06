// tests/providers/memory/cortex/types.test.ts
import { describe, it, expect } from 'vitest';
import type {
  CortexItem,
  CortexConfig,
  MemoryType,
} from '../../../../src/providers/memory/cortex/types.js';
import { MEMORY_TYPES } from '../../../../src/providers/memory/cortex/types.js';

describe('Cortex types', () => {
  it('MEMORY_TYPES contains all six types', () => {
    expect(MEMORY_TYPES).toEqual([
      'profile', 'event', 'knowledge', 'behavior', 'skill', 'tool',
    ]);
  });

  it('CortexItem has required fields', () => {
    const item: CortexItem = {
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

  it('CortexConfig has required fields', () => {
    const config: CortexConfig = {
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
