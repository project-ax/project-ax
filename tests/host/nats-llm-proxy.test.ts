import { describe, test, expect } from 'vitest';

// The LLM proxy requires a live NATS connection to test fully.
// These tests validate the module structure.
// Integration tests with a real NATS server are in the e2e test suite.

describe('nats-llm-proxy', () => {
  test('module exports startNATSLLMProxy function', async () => {
    const mod = await import('../../src/host/nats-llm-proxy.js');
    expect(typeof mod.startNATSLLMProxy).toBe('function');
  });
});
