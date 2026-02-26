import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdirSync, rmSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { request as httpRequest } from 'node:http';

// Mock processCompletion before importing server
vi.mock('../../src/host/server-completions.js', async (importOriginal) => {
  const mod = await importOriginal<typeof import('../../src/host/server-completions.js')>();
  return {
    ...mod,
    processCompletion: vi.fn().mockResolvedValue({
      responseContent: 'Here is the image:\n\n![A cow sailing](generated-abc123.png)\n\nEnjoy!',
      contentBlocks: [
        { type: 'text', text: 'Here is the image:\n\n![A cow sailing](generated-abc123.png)\n\nEnjoy!' },
        { type: 'image', fileId: 'generated-abc123.png', mimeType: 'image/png' },
      ],
      agentName: 'main',
      userId: 'default',
      finishReason: 'stop',
    }),
  };
});

import { createServer, type AxServer } from '../../src/host/server.js';
import { loadConfig } from '../../src/config.js';
import { processCompletion } from '../../src/host/server-completions.js';

const mockedProcessCompletion = vi.mocked(processCompletion);

/** Send an HTTP request over a Unix socket */
function sendRequest(
  socket: string,
  path: string,
  opts: { method?: string; body?: unknown } = {},
): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const bodyStr = opts.body ? JSON.stringify(opts.body) : undefined;
    const req = httpRequest(
      {
        socketPath: socket,
        path,
        method: opts.method ?? 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(bodyStr ? { 'Content-Length': Buffer.byteLength(bodyStr) } : {}),
        },
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () => {
          resolve({
            status: res.statusCode ?? 0,
            body: Buffer.concat(chunks).toString('utf-8'),
          });
        });
        res.on('error', reject);
      },
    );
    req.on('error', reject);
    if (bodyStr) req.write(bodyStr);
    req.end();
  });
}

describe('Server multimodal responses', () => {
  let server: AxServer;
  let socketPath: string;
  let testAxHome: string;
  let originalAxHome: string | undefined;

  beforeEach(() => {
    socketPath = join(tmpdir(), `ax-test-${randomUUID()}.sock`);
    testAxHome = join(tmpdir(), `ax-test-home-${randomUUID()}`);
    mkdirSync(testAxHome, { recursive: true });
    originalAxHome = process.env.AX_HOME;
    process.env.AX_HOME = testAxHome;
  });

  afterEach(async () => {
    if (server) await server.stop();
    try { unlinkSync(socketPath); } catch { /* ignore */ }
    if (originalAxHome !== undefined) {
      process.env.AX_HOME = originalAxHome;
    } else {
      delete process.env.AX_HOME;
    }
    rmSync(testAxHome, { recursive: true, force: true });
  });

  it('rewrites image URLs in response content when contentBlocks include images', async () => {
    const config = loadConfig('tests/integration/ax-test.yaml');
    server = await createServer(config, { socketPath });
    await server.start();

    const sessionId = randomUUID();
    const res = await sendRequest(socketPath, '/v1/chat/completions', {
      body: {
        messages: [{ role: 'user', content: 'generate an image of a cow' }],
        session_id: sessionId,
      },
    });

    expect(res.status).toBe(200);
    const data = JSON.parse(res.body);

    // Content should be a string with rewritten image URLs using agent+user params
    const content = data.choices[0].message.content;
    expect(typeof content).toBe('string');
    expect(content).toContain('/v1/files/generated-abc123.png?agent=main&user=default');
    // Should have the ! prefix for image markdown
    expect(content).toContain('![A cow sailing]');
    expect(content).not.toContain('(generated-abc123.png)');
  });

  it('returns plain string content when no image blocks are present', async () => {
    // Override mock for this test — text-only response
    mockedProcessCompletion.mockResolvedValueOnce({
      responseContent: 'Just a text reply.',
      contentBlocks: [
        { type: 'text', text: 'Just a text reply.' },
      ],
      finishReason: 'stop',
    });

    const config = loadConfig('tests/integration/ax-test.yaml');
    server = await createServer(config, { socketPath });
    await server.start();

    const res = await sendRequest(socketPath, '/v1/chat/completions', {
      body: { messages: [{ role: 'user', content: 'hello' }] },
    });

    expect(res.status).toBe(200);
    const data = JSON.parse(res.body);

    // Content should remain a plain string when no images are present
    expect(typeof data.choices[0].message.content).toBe('string');
    expect(data.choices[0].message.content).toBe('Just a text reply.');
  });

  it('derives user from user field for image URLs', async () => {
    // Override mock to return the userId extracted from the user field
    mockedProcessCompletion.mockResolvedValueOnce({
      responseContent: 'Here is the image:\n\n![A cow sailing](generated-abc123.png)\n\nEnjoy!',
      contentBlocks: [
        { type: 'text', text: 'Here is the image:\n\n![A cow sailing](generated-abc123.png)\n\nEnjoy!' },
        { type: 'image', fileId: 'generated-abc123.png', mimeType: 'image/png' },
      ],
      agentName: 'main',
      userId: 'vinay@canopyworks.com',
      finishReason: 'stop',
    });

    const config = loadConfig('tests/integration/ax-test.yaml');
    server = await createServer(config, { socketPath });
    await server.start();

    const res = await sendRequest(socketPath, '/v1/chat/completions', {
      body: {
        messages: [{ role: 'user', content: 'generate an image' }],
        user: 'vinay@canopyworks.com/conv-001',
      },
    });

    expect(res.status).toBe(200);
    const data = JSON.parse(res.body);
    const content = data.choices[0].message.content;
    expect(typeof content).toBe('string');
    // URL should use agent+user params with @ percent-encoded
    expect(content).toContain('agent=main&user=vinay%40canopyworks.com');
    expect(content).toContain('generated-abc123.png');
  });

  it('uses default user fallback when no user field provided', async () => {
    const config = loadConfig('tests/integration/ax-test.yaml');
    server = await createServer(config, { socketPath });
    await server.start();

    const res = await sendRequest(socketPath, '/v1/chat/completions', {
      body: {
        messages: [{ role: 'user', content: 'generate an image' }],
      },
    });

    expect(res.status).toBe(200);
    const data = JSON.parse(res.body);
    const content = data.choices[0].message.content;
    expect(typeof content).toBe('string');
    // URL should use agent=main and user=default (or $USER env var)
    expect(content).toContain('agent=main&user=');
    expect(content).not.toContain('session_id=');
  });
});
