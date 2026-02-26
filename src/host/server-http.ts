/**
 * HTTP request handling — OpenAI-compatible API surface.
 *
 * Handles routing, request parsing, SSE streaming, and non-streaming
 * response formatting. The actual completion logic lives in server-completions.ts.
 */

import type { IncomingMessage, ServerResponse } from 'node:http';
import type { ContentBlock } from '../types.js';

// =====================================================
// Types
// =====================================================

export interface OpenAIChatRequest {
  model?: string;
  messages: { role: string; content: string | import('../types.js').ContentBlock[] }[];
  stream?: boolean;
  max_tokens?: number;
  session_id?: string;
  /** OpenAI-compatible user field. Format: "<userId>/<conversationId>". */
  user?: string;
}

export interface OpenAIChatResponse {
  id: string;
  object: 'chat.completion';
  created: number;
  model: string;
  choices: {
    index: number;
    message: { role: 'assistant'; content: string };
    finish_reason: 'stop' | 'length' | 'content_filter';
  }[];
  usage: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
}

export interface OpenAIStreamChunk {
  id: string;
  object: 'chat.completion.chunk';
  created: number;
  model: string;
  choices: {
    index: number;
    delta: { role?: string; content?: string };
    finish_reason: 'stop' | 'length' | 'content_filter' | null;
  }[];
}

// =====================================================
// HTTP Utilities
// =====================================================

export function sendError(res: ServerResponse, status: number, message: string): void {
  const body = JSON.stringify({ error: { message, type: 'invalid_request_error', code: null } });
  res.writeHead(status, { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) });
  res.end(body);
}

export function sendSSEChunk(res: ServerResponse, chunk: OpenAIStreamChunk): void {
  res.write(`data: ${JSON.stringify(chunk)}\n\n`);
}

/**
 * Rewrite bare image filenames in response text to proper /v1/files/ URLs.
 *
 * Agents emit markdown like `![alt](generated-xxx.png)` but the bare filename
 * doesn't resolve over HTTP. This rewrites them to
 * `![alt](/v1/files/generated-xxx.png?agent=...&user=...)` so clients can
 * render images in both streaming and non-streaming modes.
 *
 * Also normalises `[alt](file)` → `![alt](file)` (missing `!` prefix).
 */
export function rewriteImageUrls(
  text: string,
  contentBlocks: ContentBlock[],
  agentName: string,
  userId: string,
): string {
  let result = text;
  for (const block of contentBlocks) {
    if (block.type === 'image') {
      const basename = block.fileId.split('/').pop() ?? block.fileId;
      const escaped = basename.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const fileUrl = `/v1/files/${encodeURIComponent(block.fileId)}?agent=${encodeURIComponent(agentName)}&user=${encodeURIComponent(userId)}`;
      // Match both ![alt](file) and [alt](file), normalise to ![alt](url)
      result = result.replace(
        new RegExp(`(!?\\[[^\\]]*\\])\\(${escaped}\\)`, 'g'),
        (_, ref: string) => `!${ref.startsWith('!') ? ref.slice(1) : ref}(${fileUrl})`,
      );
    }
  }
  return result;
}

export async function readBody(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  let size = 0;
  const MAX_BODY = 1024 * 1024; // 1MB

  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > MAX_BODY) throw new Error('Request body too large');
    chunks.push(chunk as Buffer);
  }
  return Buffer.concat(chunks).toString('utf-8');
}
