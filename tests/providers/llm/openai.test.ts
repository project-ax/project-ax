import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import { create } from '../../../src/providers/llm/openai.js';
import type { Config } from '../../../src/types.js';

const config = {} as Config;

describe('openai-compat LLM provider', () => {
  const envVarsToSave = [
    'OPENAI_API_KEY',
    'OPENAI_BASE_URL',
    'GROQ_API_KEY',
    'GROQ_BASE_URL',
    'FIREWORKS_API_KEY',
    'FIREWORKS_BASE_URL',
  ];
  const saved: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const key of envVarsToSave) {
      saved[key] = process.env[key];
      delete process.env[key];
    }
  });

  afterEach(() => {
    for (const key of envVarsToSave) {
      if (saved[key] !== undefined) process.env[key] = saved[key];
      else delete process.env[key];
    }
  });

  test('returns provider with correct name for groq', async () => {
    process.env.GROQ_API_KEY = 'test-groq-key';
    const provider = await create(config, 'groq');
    expect(provider.name).toBe('groq');
  });

  test('stub chat() throws when no API key (groq)', async () => {
    const provider = await create(config, 'groq');
    const iter = provider.chat({ model: 'test', messages: [] });
    await expect(iter.next()).rejects.toThrow('GROQ_API_KEY');
  });

  test('defaults to openai when no provider name given', async () => {
    const provider = await create(config);
    expect(provider.name).toBe('openai');
  });

  test('stub chat() throws with helpful message mentioning OPENAI_API_KEY', async () => {
    const provider = await create(config);
    const iter = provider.chat({ model: 'test', messages: [] });
    await expect(iter.next()).rejects.toThrow('OPENAI_API_KEY');
  });

  test('uses default base URL for known providers (creates successfully)', async () => {
    process.env.GROQ_API_KEY = 'test-groq-key';
    const provider = await create(config, 'groq');
    expect(provider.name).toBe('groq');
    // Should have created an OpenAI client with groq base URL — no error on create
  });

  test('returns provider with correct name for fireworks', async () => {
    process.env.FIREWORKS_API_KEY = 'test-fireworks-key';
    const provider = await create(config, 'fireworks');
    expect(provider.name).toBe('fireworks');
  });

  test('models() returns empty array for stub provider', async () => {
    const provider = await create(config, 'groq');
    const models = await provider.models();
    expect(models).toEqual([]);
  });
});
