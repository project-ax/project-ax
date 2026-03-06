import { describe, it, expect } from 'vitest';
import { salienceScore } from '../../../../src/providers/memory/cortex/salience.js';

describe('salienceScore', () => {
  it('returns positive score for valid inputs', () => {
    const score = salienceScore({
      similarity: 0.8,
      reinforcementCount: 5,
      lastReinforcedAt: new Date().toISOString(),
      recencyDecayDays: 30,
    });
    expect(score).toBeGreaterThan(0);
  });

  it('higher reinforcement increases score', () => {
    const now = new Date().toISOString();
    const low = salienceScore({ similarity: 0.8, reinforcementCount: 1, lastReinforcedAt: now, recencyDecayDays: 30 });
    const high = salienceScore({ similarity: 0.8, reinforcementCount: 20, lastReinforcedAt: now, recencyDecayDays: 30 });
    expect(high).toBeGreaterThan(low);
  });

  it('recent items score higher than old items', () => {
    const recent = salienceScore({
      similarity: 0.8,
      reinforcementCount: 3,
      lastReinforcedAt: new Date().toISOString(),
      recencyDecayDays: 30,
    });
    const old = salienceScore({
      similarity: 0.8,
      reinforcementCount: 3,
      lastReinforcedAt: new Date(Date.now() - 90 * 86400000).toISOString(),
      recencyDecayDays: 30,
    });
    expect(recent).toBeGreaterThan(old);
  });

  it('recency factor halves at half-life', () => {
    const now = new Date();
    const atHalfLife = new Date(now.getTime() - 30 * 86400000);
    const fresh = salienceScore({ similarity: 1.0, reinforcementCount: 1, lastReinforcedAt: now.toISOString(), recencyDecayDays: 30 });
    const halfLife = salienceScore({ similarity: 1.0, reinforcementCount: 1, lastReinforcedAt: atHalfLife.toISOString(), recencyDecayDays: 30 });
    expect(halfLife / fresh).toBeCloseTo(0.5, 1);
  });

  it('null lastReinforcedAt gives 0.5 recency factor', () => {
    const withDate = salienceScore({ similarity: 1.0, reinforcementCount: 1, lastReinforcedAt: new Date().toISOString(), recencyDecayDays: 30 });
    const withNull = salienceScore({ similarity: 1.0, reinforcementCount: 1, lastReinforcedAt: null, recencyDecayDays: 30 });
    expect(withNull / withDate).toBeCloseTo(0.5, 1);
  });

  it('zero reinforcement produces zero score', () => {
    const score = salienceScore({
      similarity: 1.0,
      reinforcementCount: 0,
      lastReinforcedAt: new Date().toISOString(),
      recencyDecayDays: 30,
    });
    expect(score).toBe(0);
  });

  it('higher similarity increases score', () => {
    const now = new Date().toISOString();
    const low = salienceScore({ similarity: 0.3, reinforcementCount: 3, lastReinforcedAt: now, recencyDecayDays: 30 });
    const high = salienceScore({ similarity: 0.9, reinforcementCount: 3, lastReinforcedAt: now, recencyDecayDays: 30 });
    expect(high).toBeGreaterThan(low);
  });
});
