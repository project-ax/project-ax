/**
 * Tests for pi-coding-agent session runner.
 *
 * Starts a minimal IPC server (mock LLM) and runs runPiSession()
 * to verify the full agent flow works end-to-end.
 */

import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import { createServer, type Server, type Socket } from 'node:net';
import { mkdtempSync, rmSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

// We'll dynamically import runPiSession so the test module loads cleanly

function createMockIPCServer(socketPath: string): { server: Server; close: () => void } {
  const server = createServer((socket: Socket) => {
    let buffer = Buffer.alloc(0);

    socket.on('data', (data: Buffer) => {
      buffer = Buffer.concat([buffer, data]);

      while (buffer.length >= 4) {
        const msgLen = buffer.readUInt32BE(0);
        if (buffer.length < 4 + msgLen) break;

        const raw = buffer.subarray(4, 4 + msgLen).toString('utf-8');
        buffer = buffer.subarray(4 + msgLen);

        const request = JSON.parse(raw);
        let response: Record<string, unknown>;

        if (request.action === 'llm_call') {
          // Return a simple mock response
          response = {
            ok: true,
            chunks: [
              { type: 'text', content: 'Hello from mock LLM via IPC.' },
              { type: 'done', usage: { inputTokens: 10, outputTokens: 8 } },
            ],
          };
        } else {
          response = { ok: true };
        }

        const responseBuf = Buffer.from(JSON.stringify(response), 'utf-8');
        const lenBuf = Buffer.alloc(4);
        lenBuf.writeUInt32BE(responseBuf.length, 0);
        socket.write(Buffer.concat([lenBuf, responseBuf]));
      }
    });
  });

  server.listen(socketPath);
  return {
    server,
    close: () => {
      server.close();
    },
  };
}

describe('pi-session (pi-coding-agent runner)', () => {
  let tempDir: string;
  let workspace: string;
  let skillsDir: string;
  let socketPath: string;
  let mockServer: { server: Server; close: () => void };

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'ax-pi-session-test-'));
    workspace = join(tempDir, 'workspace');
    skillsDir = join(tempDir, 'skills');
    socketPath = join(tempDir, 'ipc.sock');
    mkdirSync(workspace, { recursive: true });
    mkdirSync(skillsDir, { recursive: true });
    mockServer = createMockIPCServer(socketPath);
  });

  afterEach(() => {
    mockServer.close();
    try { rmSync(tempDir, { recursive: true, force: true }); } catch {}
  });

  test('runPiSession completes without error for a simple message', async () => {
    const { runPiSession } = await import('../../../src/container/agents/pi-session.js');

    // Capture stdout
    const chunks: string[] = [];
    const originalWrite = process.stdout.write;
    process.stdout.write = ((chunk: string | Uint8Array) => {
      chunks.push(chunk.toString());
      return true;
    }) as typeof process.stdout.write;

    try {
      await runPiSession({
        agent: 'pi-coding-agent',
        ipcSocket: socketPath,
        workspace,
        skills: skillsDir,
        userMessage: 'hello',
      });
    } finally {
      process.stdout.write = originalWrite;
    }

    const output = chunks.join('');
    expect(output.length).toBeGreaterThan(0);
    expect(output).toContain('Hello from mock LLM via IPC');
  }, 30_000);

  test('runPiSession returns immediately for empty message', async () => {
    const { runPiSession } = await import('../../../src/container/agents/pi-session.js');

    // Should not throw or hang
    await runPiSession({
      agent: 'pi-coding-agent',
      ipcSocket: socketPath,
      workspace,
      skills: skillsDir,
      userMessage: '',
    });
  });

  test('runPiSession returns immediately for whitespace-only message', async () => {
    const { runPiSession } = await import('../../../src/container/agents/pi-session.js');

    await runPiSession({
      agent: 'pi-coding-agent',
      ipcSocket: socketPath,
      workspace,
      skills: skillsDir,
      userMessage: '   ',
    });
  });
});
