import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { unlinkSync } from 'node:fs';
import { isAgentBootstrapMode, isAdmin, createServer, type AxServer } from '../../src/host/server.js';
import { loadConfig } from '../../src/config.js';
import type { ChannelProvider, InboundMessage, OutboundMessage, SessionAddress } from '../../src/providers/channel/types.js';

// ── Unit tests for helpers ──

describe('isAgentBootstrapMode', () => {
  let agentDir: string;

  beforeEach(() => {
    agentDir = mkdtempSync(join(tmpdir(), 'ax-admin-test-'));
  });

  afterEach(() => {
    rmSync(agentDir, { recursive: true, force: true });
  });

  test('returns true when BOOTSTRAP.md exists and SOUL.md does not', () => {
    writeFileSync(join(agentDir, 'BOOTSTRAP.md'), '# Bootstrap');
    expect(isAgentBootstrapMode(agentDir)).toBe(true);
  });

  test('returns false when SOUL.md exists (bootstrap complete)', () => {
    writeFileSync(join(agentDir, 'BOOTSTRAP.md'), '# Bootstrap');
    writeFileSync(join(agentDir, 'SOUL.md'), '# Soul');
    expect(isAgentBootstrapMode(agentDir)).toBe(false);
  });

  test('returns false when neither file exists', () => {
    expect(isAgentBootstrapMode(agentDir)).toBe(false);
  });

  test('returns false when only SOUL.md exists', () => {
    writeFileSync(join(agentDir, 'SOUL.md'), '# Soul');
    expect(isAgentBootstrapMode(agentDir)).toBe(false);
  });
});

describe('isAdmin', () => {
  let agentDir: string;

  beforeEach(() => {
    agentDir = mkdtempSync(join(tmpdir(), 'ax-admin-test-'));
  });

  afterEach(() => {
    rmSync(agentDir, { recursive: true, force: true });
  });

  test('returns true when userId is in admins file', () => {
    writeFileSync(join(agentDir, 'admins'), 'alice\nbob\n');
    expect(isAdmin(agentDir, 'alice')).toBe(true);
    expect(isAdmin(agentDir, 'bob')).toBe(true);
  });

  test('returns false when userId is not in admins file', () => {
    writeFileSync(join(agentDir, 'admins'), 'alice\n');
    expect(isAdmin(agentDir, 'eve')).toBe(false);
  });

  test('returns false when admins file does not exist', () => {
    expect(isAdmin(agentDir, 'alice')).toBe(false);
  });

  test('handles blank lines and whitespace in admins file', () => {
    writeFileSync(join(agentDir, 'admins'), '  alice  \n\n  bob  \n\n');
    expect(isAdmin(agentDir, 'alice')).toBe(true);
    expect(isAdmin(agentDir, 'bob')).toBe(true);
  });
});

// ── Integration test for channel bootstrap gate ──

describe('bootstrap gate (channel integration)', () => {
  let server: AxServer;
  let socketPath: string;
  let originalAxHome: string | undefined;
  let axHome: string;

  beforeEach(() => {
    socketPath = join(tmpdir(), `ax-gate-test-${randomUUID()}.sock`);
    originalAxHome = process.env.AX_HOME;
    axHome = mkdtempSync(join(tmpdir(), 'ax-gate-home-'));
    process.env.AX_HOME = axHome;
  });

  afterEach(async () => {
    if (server) await server.stop();
    try { unlinkSync(socketPath); } catch { /* ignore */ }
    rmSync(axHome, { recursive: true, force: true });
    if (originalAxHome !== undefined) {
      process.env.AX_HOME = originalAxHome;
    } else {
      delete process.env.AX_HOME;
    }
  });

  test('blocks non-admin during bootstrap mode', async () => {
    const sentMessages: { session: SessionAddress; content: OutboundMessage }[] = [];
    let messageHandler: ((msg: InboundMessage) => Promise<void>) | null = null;

    const mockChannel: ChannelProvider = {
      name: 'test',
      async connect() {},
      onMessage(handler) { messageHandler = handler; },
      shouldRespond() { return true; },
      async send(session, content) { sentMessages.push({ session, content }); },
      async disconnect() {},
    };

    const config = loadConfig('tests/integration/ax-test.yaml');
    server = await createServer(config, { socketPath, channels: [mockChannel] });
    await server.start();

    // The server seeds the admins file with process.env.USER.
    // Send a message from someone else — should be blocked.
    const msg: InboundMessage = {
      id: 'gate-test-1',
      session: { provider: 'test', scope: 'channel', identifiers: { channel: 'C123', peer: 'stranger' } },
      sender: 'stranger',
      content: 'hello',
      attachments: [],
      timestamp: new Date(),
    };

    await messageHandler!(msg);

    expect(sentMessages).toHaveLength(1);
    expect(sentMessages[0].content.content).toContain('still being set up');
  });

  test('allows admin during bootstrap mode', async () => {
    const sentMessages: { session: SessionAddress; content: OutboundMessage }[] = [];
    let messageHandler: ((msg: InboundMessage) => Promise<void>) | null = null;

    const mockChannel: ChannelProvider = {
      name: 'test',
      async connect() {},
      onMessage(handler) { messageHandler = handler; },
      shouldRespond() { return true; },
      async send(session, content) { sentMessages.push({ session, content }); },
      async disconnect() {},
    };

    const config = loadConfig('tests/integration/ax-test.yaml');
    server = await createServer(config, { socketPath, channels: [mockChannel] });
    await server.start();

    // The admin is process.env.USER (or 'default')
    const adminId = process.env.USER ?? 'default';
    const msg: InboundMessage = {
      id: 'gate-test-2',
      session: { provider: 'test', scope: 'channel', identifiers: { channel: 'C123', peer: adminId } },
      sender: adminId,
      content: 'hello',
      attachments: [],
      timestamp: new Date(),
    };

    await messageHandler!(msg);

    // Admin should get a real response, not the bootstrap gate message
    expect(sentMessages).toHaveLength(1);
    expect(sentMessages[0].content.content).not.toContain('still being set up');
  });

  test('allows non-admin after bootstrap completes', async () => {
    const sentMessages: { session: SessionAddress; content: OutboundMessage }[] = [];
    let messageHandler: ((msg: InboundMessage) => Promise<void>) | null = null;

    const mockChannel: ChannelProvider = {
      name: 'test',
      async connect() {},
      onMessage(handler) { messageHandler = handler; },
      shouldRespond() { return true; },
      async send(session, content) { sentMessages.push({ session, content }); },
      async disconnect() {},
    };

    const config = loadConfig('tests/integration/ax-test.yaml');
    server = await createServer(config, { socketPath, channels: [mockChannel] });
    await server.start();

    // Simulate bootstrap completion: write SOUL.md into agent dir
    const agentDirPath = join(axHome, 'agents', 'main');
    writeFileSync(join(agentDirPath, 'SOUL.md'), '# Soul\nI am helpful.');

    const msg: InboundMessage = {
      id: 'gate-test-3',
      session: { provider: 'test', scope: 'channel', identifiers: { channel: 'C123', peer: 'stranger' } },
      sender: 'stranger',
      content: 'hello',
      attachments: [],
      timestamp: new Date(),
    };

    await messageHandler!(msg);

    // Non-admin should get through after bootstrap
    expect(sentMessages).toHaveLength(1);
    expect(sentMessages[0].content.content).not.toContain('still being set up');
  });
});
