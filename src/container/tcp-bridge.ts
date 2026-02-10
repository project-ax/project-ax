/**
 * TCP-to-Unix-socket bridge for the Agent SDK.
 *
 * The Agent SDK spawns a CLI subprocess that sends HTTP requests to
 * ANTHROPIC_BASE_URL (TCP). The credential-injecting proxy listens on a
 * Unix socket. This bridge forwards every request from localhost:PORT
 * to the Unix socket proxy, streaming responses back.
 *
 * No credential logic — just a dumb forwarder.
 */

import { createServer, type Server } from 'node:http';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';

export interface TCPBridge {
  port: number;
  stop: () => void;
}

export async function startTCPBridge(unixSocketPath: string): Promise<TCPBridge> {
  const { Agent } = await import('undici');
  const dispatcher = new Agent({ connect: { socketPath: unixSocketPath } });

  const server: Server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    try {
      // Read request body
      const chunks: Buffer[] = [];
      for await (const chunk of req) chunks.push(chunk as Buffer);
      const body = Buffer.concat(chunks);

      // Forward to Unix socket proxy
      const headers = new Headers();
      for (const [key, value] of Object.entries(req.headers)) {
        if (!value || key === 'host' || key === 'connection') continue;
        headers.set(key, Array.isArray(value) ? value.join(', ') : value);
      }

      const response = await fetch(`http://localhost${req.url}`, {
        method: req.method ?? 'POST',
        headers,
        body: body.length > 0 ? body : undefined,
        dispatcher,
      } as RequestInit);

      // Stream response back (strip encoding headers — fetch auto-decompresses)
      const outHeaders: Record<string, string> = {};
      response.headers.forEach((v, k) => {
        if (k !== 'transfer-encoding' && k !== 'content-encoding' && k !== 'content-length') {
          outHeaders[k] = v;
        }
      });
      res.writeHead(response.status, outHeaders);

      if (response.body) {
        const reader = response.body.getReader();
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            res.write(value);
          }
        } finally {
          reader.releaseLock();
        }
      }
      res.end();
    } catch (err) {
      if (!res.headersSent) {
        res.writeHead(502, { 'Content-Type': 'application/json' });
      }
      res.end(JSON.stringify({ error: (err as Error).message }));
    }
  });

  const port = await new Promise<number>((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      resolve((server.address() as AddressInfo).port);
    });
  });

  return {
    port,
    stop: () => { server.close(); },
  };
}
