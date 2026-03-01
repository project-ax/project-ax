import { describe, it, expect } from 'vitest';
import { getContextWindow } from '../../../src/providers/llm/context-windows.js';

describe('getContextWindow', () => {
  it('returns 200k for Claude models', () => {
    expect(getContextWindow('claude-sonnet-4-20250514')).toBe(200_000);
    expect(getContextWindow('claude-opus-4-20250514')).toBe(200_000);
  });

  it('returns 128k for GPT-4o models', () => {
    expect(getContextWindow('gpt-4o-2024-08-06')).toBe(128_000);
  });

  it('returns 128k for GPT-4o-mini', () => {
    expect(getContextWindow('gpt-4o-mini-2024-07-18')).toBe(128_000);
  });

  it('returns 8192 for GPT-4', () => {
    expect(getContextWindow('gpt-4-0613')).toBe(8_192);
  });

  it('returns default 200k for unknown models', () => {
    expect(getContextWindow('mystery-model')).toBe(200_000);
  });

  it('matches by prefix (versioned model IDs)', () => {
    expect(getContextWindow('claude-haiku-3-5-20241022')).toBe(200_000);
    expect(getContextWindow('o1-mini-2024-09-12')).toBe(128_000);
  });
});
