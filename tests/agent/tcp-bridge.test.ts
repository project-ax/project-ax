import { describe, test, expect, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createServer, type Server } from 'node:http';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { startTCPBridge } from '../../src/agent/tcp-bridge.js';

/**
 * Create a mock HTTP server listening on a Unix socket.
 * Simulates the Anthropic proxy that the bridge forwards to.
 */
function createMockUnixServer(
  socketPath: string,
  handler: (req: IncomingMessage, body: string, res: ServerResponse) => void,
): Promise<Server> {
  return new Promise((resolve) => {
    const server = createServer(async (req, res) => {
      const chunks: Buffer[] = [];
      for await (const c of req) chunks.push(c as Buffer);
      handler(req, Buffer.concat(chunks).toString(), res);
    });
    server.listen(socketPath, () => resolve(server));
  });
}

describe('TCP Bridge', () => {
  let tmpDir: string;
  let mockServer: Server;
  let bridge: { port: number; stop: () => void };

  afterEach(() => {
    bridge?.stop();
    mockServer?.close();
    if (tmpDir) rmSync(tmpDir, { recursive: true, force: true });
  });

  test('starts on a random port and returns the port number', async () => {
    tmpDir = mkdtempSync(join(tmpdir(), 'bridge-test-'));
    const socketPath = join(tmpDir, 'mock.sock');

    mockServer = await createMockUnixServer(socketPath, (_req, _body, res) => {
      res.writeHead(200);
      res.end('ok');
    });

    bridge = await startTCPBridge(socketPath);
    expect(bridge.port).toBeGreaterThan(0);
    expect(bridge.port).toBeLessThan(65536);
    expect(typeof bridge.stop).toBe('function');
  });

  test('forwards POST request to Unix socket server', async () => {
    tmpDir = mkdtempSync(join(tmpdir(), 'bridge-test-'));
    const socketPath = join(tmpDir, 'mock.sock');

    let receivedMethod = '';
    let receivedUrl = '';
    let receivedBody = '';
    let receivedContentType = '';
    mockServer = await createMockUnixServer(socketPath, (req, body, res) => {
      receivedMethod = req.method ?? '';
      receivedUrl = req.url ?? '';
      receivedBody = body;
      receivedContentType = req.headers['content-type'] ?? '';
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ forwarded: true }));
    });

    bridge = await startTCPBridge(socketPath);

    const response = await fetch(`http://127.0.0.1:${bridge.port}/v1/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'test', messages: [] }),
    });

    expect(response.status).toBe(200);
    const result = await response.json() as Record<string, unknown>;
    expect(result.forwarded).toBe(true);
    expect(receivedMethod).toBe('POST');
    expect(receivedUrl).toBe('/v1/messages');
    expect(receivedContentType).toBe('application/json');
    expect(receivedBody).toContain('"model":"test"');
  });

  test('forwards query strings in URL', async () => {
    tmpDir = mkdtempSync(join(tmpdir(), 'bridge-test-'));
    const socketPath = join(tmpDir, 'mock.sock');

    let receivedUrl = '';
    mockServer = await createMockUnixServer(socketPath, (req, _body, res) => {
      receivedUrl = req.url ?? '';
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true }));
    });

    bridge = await startTCPBridge(socketPath);

    const response = await fetch(`http://127.0.0.1:${bridge.port}/v1/messages?beta=true`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    });

    expect(response.status).toBe(200);
    expect(receivedUrl).toBe('/v1/messages?beta=true');
  });

  test('streams SSE responses correctly', async () => {
    tmpDir = mkdtempSync(join(tmpdir(), 'bridge-test-'));
    const socketPath = join(tmpDir, 'mock.sock');

    mockServer = await createMockUnixServer(socketPath, (_req, _body, res) => {
      res.writeHead(200, { 'Content-Type': 'text/event-stream' });
      res.write('event: message_start\ndata: {"type":"message_start"}\n\n');
      res.write('event: content\ndata: {"type":"content","text":"hello"}\n\n');
      res.write('event: message_stop\ndata: {"type":"message_stop"}\n\n');
      res.end();
    });

    bridge = await startTCPBridge(socketPath);

    const response = await fetch(`http://127.0.0.1:${bridge.port}/v1/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    });

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('text/event-stream');
    const text = await response.text();
    expect(text).toContain('message_start');
    expect(text).toContain('hello');
    expect(text).toContain('message_stop');
  });

  test('stop() closes the server', async () => {
    tmpDir = mkdtempSync(join(tmpdir(), 'bridge-test-'));
    const socketPath = join(tmpDir, 'mock.sock');

    mockServer = await createMockUnixServer(socketPath, (_req, _body, res) => {
      res.writeHead(200);
      res.end('ok');
    });

    bridge = await startTCPBridge(socketPath);
    const port = bridge.port;
    bridge.stop();

    // After stop, connections should fail
    await expect(
      fetch(`http://127.0.0.1:${port}/v1/messages`, {
        method: 'POST',
        body: '{}',
      }),
    ).rejects.toThrow();
  });

  test('returns 502 when Unix socket is unreachable', async () => {
    tmpDir = mkdtempSync(join(tmpdir(), 'bridge-test-'));
    const socketPath = join(tmpDir, 'nonexistent.sock');

    bridge = await startTCPBridge(socketPath);

    const response = await fetch(`http://127.0.0.1:${bridge.port}/v1/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    });

    expect(response.status).toBe(502);
  });
});
