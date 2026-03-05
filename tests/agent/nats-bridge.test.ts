import { describe, test, expect } from 'vitest';

// The NATS bridge requires a live NATS connection to test fully.
// These tests validate the module structure and types.
// Integration tests with a real NATS server are in the e2e test suite.

describe('nats-bridge', () => {
  test('module exports startNATSBridge function', async () => {
    const mod = await import('../../src/agent/nats-bridge.js');
    expect(typeof mod.startNATSBridge).toBe('function');
  });

  test('NATSBridge interface shape', () => {
    // Type-level test: verify the interface is exported and usable
    type NATSBridge = import('../../src/agent/nats-bridge.js').NATSBridge;
    const _typeCheck: NATSBridge = { port: 8080, stop: async () => {} };
    expect(_typeCheck.port).toBe(8080);
  });
});
