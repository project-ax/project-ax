// src/host/host-process.ts — Standalone host pod process for k8s deployment.
//
// Handles HTTP requests, SSE streaming, webhooks, and channel connections.
// Does NOT run agent conversation loops or make LLM calls.
//
// Instead of calling processCompletion directly, publishes session requests
// to NATS and subscribes to results/events for the response.
//
// For local development, use server.ts instead (all-in-one process).

import { createServer as createHttpServer, type Server as HttpServer } from 'node:http';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { existsSync, readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { getLogger } from '../logger.js';
import { loadConfig } from '../config.js';
import { loadProviders } from './registry.js';
import { sendError, sendSSEChunk, readBody } from './server-http.js';
import type { OpenAIChatRequest, OpenAIStreamChunk } from './server-http.js';
import { isValidSessionId, webhookTransformPath } from '../paths.js';
import { createWebhookHandler } from './server-webhooks.js';
import { createWebhookTransform } from './webhook-transform.js';
import {
  encode, decode,
  sessionRequestSubject, resultSubject, eventSubject,
  type SessionRequest, type SessionResult,
} from './nats-session-protocol.js';
import type { StreamEvent } from './event-bus.js';
import { initTracing, shutdownTracing } from '../utils/tracing.js';

const logger = getLogger().child({ component: 'host-process' });

/** Timeout waiting for session result (10 min — agent processing can be slow). */
const SESSION_RESULT_TIMEOUT_MS = 600_000;

/** SSE keepalive interval. */
const SSE_KEEPALIVE_MS = 15_000;

async function main(): Promise<void> {
  await initTracing();

  const config = loadConfig();
  const providers = await loadProviders(config);
  const eventBus = providers.eventbus;

  // NATS connection for session dispatch
  const natsModule = await import('nats');
  const natsUrl = process.env.NATS_URL ?? 'nats://localhost:4222';
  const nc = await natsModule.connect({
    servers: natsUrl,
    name: `ax-host-${process.pid}`,
    reconnect: true,
    maxReconnectAttempts: -1,
    reconnectTimeWait: 1000,
  });
  logger.info('nats_connected', { url: natsUrl });

  const port = parseInt(process.env.PORT ?? '8080', 10);
  const agentType = config.agent ?? 'pi-coding-agent';
  const modelId = providers.llm.name;
  let draining = false;

  // ── Webhook handler (optional — only if config has webhooks.enabled) ──

  const webhookPrefix = config.webhooks?.path
    ? (config.webhooks.path.endsWith('/') ? config.webhooks.path : config.webhooks.path + '/')
    : '/webhooks/';

  const webhookHandler = config.webhooks?.enabled
    ? createWebhookHandler({
        config: {
          token: config.webhooks.token,
          maxBodyBytes: config.webhooks.max_body_bytes,
          model: config.webhooks.model,
          allowedAgentIds: config.webhooks.allowed_agent_ids,
        },
        transform: createWebhookTransform(
          providers.llm,
          config.webhooks.model ?? config.models?.fast?.[0] ?? config.models?.default?.[0] ?? 'claude-haiku-4-5-20251001',
        ),
        dispatch: (result, runId) => {
          const targetAgent = result.agentId ?? agentType;
          const sessionRequest: SessionRequest = {
            type: 'session_request',
            requestId: runId,
            sessionId: result.sessionKey ?? `webhook:${runId}`,
            content: result.message,
            messages: [{ role: 'user', content: result.message }],
            stream: false,
            userId: 'webhook',
            agentType: targetAgent,
            model: result.model,
            persistentSessionId: result.sessionKey,
          };
          nc.publish(sessionRequestSubject(targetAgent), encode(sessionRequest));
        },
        logger,
        transformExists: (name) => existsSync(webhookTransformPath(name)),
        readTransform: (name) => readFileSync(webhookTransformPath(name), 'utf-8'),
        audit: (entry) => {
          providers.audit.log({
            action: entry.action,
            sessionId: entry.runId ?? 'webhook',
            args: { webhook: entry.webhook, ip: entry.ip },
            result: 'success',
            durationMs: 0,
          }).catch(() => {});
        },
      })
    : null;

  // ── Request Handler ──

  async function handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
    // CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    const url = req.url ?? '/';

    if (draining && (url === '/v1/chat/completions' || url.startsWith(webhookPrefix))) {
      sendError(res, 503, 'Server is shutting down');
      return;
    }

    if (url === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: draining ? 'draining' : 'ok' }));
      return;
    }

    if (url === '/v1/models' && req.method === 'GET') {
      const body = JSON.stringify({
        object: 'list',
        data: [{ id: modelId, object: 'model', created: Math.floor(Date.now() / 1000), owned_by: 'ax' }],
      });
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(body);
      return;
    }

    if (url === '/v1/chat/completions' && req.method === 'POST') {
      try {
        await handleCompletions(req, res);
      } catch (err) {
        logger.error('request_failed', { error: (err as Error).message });
        if (!res.headersSent) sendError(res, 500, 'Internal server error');
      }
      return;
    }

    // SSE event stream: subscribe to NATS events
    if (url.startsWith('/v1/events') && req.method === 'GET') {
      handleEvents(req, res);
      return;
    }

    // Webhooks
    if (webhookHandler && url.startsWith(webhookPrefix)) {
      const webhookName = url.slice(webhookPrefix.length).split('?')[0];
      if (!webhookName) {
        sendError(res, 404, 'Not found');
        return;
      }
      try {
        await webhookHandler(req, res, webhookName);
      } catch (err) {
        logger.error('webhook_handler_failed', { error: (err as Error).message });
        if (!res.headersSent) sendError(res, 500, 'Webhook processing failed');
      }
      return;
    }

    sendError(res, 404, 'Not found');
  }

  // ── Completions: NATS dispatch ──

  async function handleCompletions(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const requestId = `chatcmpl-${randomUUID()}`;
    const created = Math.floor(Date.now() / 1000);

    let body: string;
    try {
      body = await readBody(req);
    } catch {
      sendError(res, 413, 'Request body too large');
      return;
    }

    let chatReq: OpenAIChatRequest;
    try {
      chatReq = JSON.parse(body);
    } catch {
      sendError(res, 400, 'Invalid JSON');
      return;
    }

    if (!chatReq.messages?.length) {
      sendError(res, 400, 'messages array is required');
      return;
    }

    if (chatReq.session_id !== undefined && !isValidSessionId(chatReq.session_id)) {
      sendError(res, 400, 'Invalid session_id');
      return;
    }

    const requestModel = chatReq.model ?? modelId;

    // Derive session ID
    let sessionId = chatReq.session_id;
    if (!sessionId && chatReq.user) {
      const parts = chatReq.user.split('/');
      if (parts.length >= 2 && parts[0] && parts[1]) {
        const agentPrefix = chatReq.model?.startsWith('agent:')
          ? chatReq.model.slice(6) : 'main';
        const candidate = `${agentPrefix}:http:${parts[0]}:${parts[1]}`;
        if (isValidSessionId(candidate)) sessionId = candidate;
      }
    }
    if (!sessionId) sessionId = randomUUID();

    const lastMsg = chatReq.messages[chatReq.messages.length - 1];
    const content = lastMsg?.content ?? '';
    const userId = chatReq.user?.split('/')[0] || undefined;

    // Build session request
    const sessionRequest: SessionRequest = {
      type: 'session_request',
      requestId,
      sessionId,
      content,
      messages: chatReq.messages,
      stream: chatReq.stream ?? false,
      userId,
      agentType,
      model: chatReq.model,
      persistentSessionId: sessionId,
    };

    // Publish session request to NATS
    const subject = sessionRequestSubject(agentType);

    if (chatReq.stream) {
      // ── Streaming mode ──
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'X-Request-Id': requestId,
        'X-Accel-Buffering': 'no',
      });

      // Role chunk
      sendSSEChunk(res, {
        id: requestId, object: 'chat.completion.chunk', created, model: requestModel,
        choices: [{ index: 0, delta: { role: 'assistant' }, finish_reason: null }],
      });

      let toolCallIndex = 0;
      let hasToolCalls = false;
      let streamedContent = false;

      // Subscribe to events for this request via NATS
      const eventSub = nc.subscribe(eventSubject(requestId));
      const resultSub = nc.subscribe(resultSubject(requestId));

      // Keepalive
      const keepalive = setInterval(() => {
        try { res.write(':keepalive\n\n'); } catch { /* client gone */ }
      }, SSE_KEEPALIVE_MS);

      // Process events in background
      const eventLoop = (async () => {
        for await (const msg of eventSub) {
          try {
            const event = decode<StreamEvent>(msg.data);
            if (event.type === 'llm.chunk' && typeof event.data.content === 'string') {
              streamedContent = true;
              sendSSEChunk(res, {
                id: requestId, object: 'chat.completion.chunk', created, model: requestModel,
                choices: [{ index: 0, delta: { content: event.data.content as string }, finish_reason: null }],
              });
            } else if (event.type === 'tool.call' && event.data.toolName) {
              streamedContent = true;
              hasToolCalls = true;
              sendSSEChunk(res, {
                id: requestId, object: 'chat.completion.chunk', created, model: requestModel,
                choices: [{ index: 0, delta: {
                  tool_calls: [{
                    index: toolCallIndex++,
                    id: (event.data.toolId as string) ?? `call_${toolCallIndex}`,
                    type: 'function',
                    function: {
                      name: event.data.toolName as string,
                      arguments: JSON.stringify(event.data.args ?? {}),
                    },
                  }],
                }, finish_reason: null }],
              });
            }
          } catch { /* malformed event, skip */ }
        }
      })();

      // Publish session request
      nc.publish(subject, encode(sessionRequest));

      // Wait for result
      let resultReceived = false;
      const resultTimeout = setTimeout(() => {
        if (!resultReceived) {
          eventSub.unsubscribe();
          resultSub.unsubscribe();
          clearInterval(keepalive);
          if (!res.writableEnded) {
            sendSSEChunk(res, {
              id: requestId, object: 'chat.completion.chunk', created, model: requestModel,
              choices: [{ index: 0, delta: { content: 'Request timed out' }, finish_reason: 'stop' }],
            });
            res.write('data: [DONE]\n\n');
            res.end();
          }
        }
      }, SESSION_RESULT_TIMEOUT_MS);

      for await (const msg of resultSub) {
        resultReceived = true;
        clearTimeout(resultTimeout);

        try {
          const result = decode<SessionResult>(msg.data);

          // Stop event subscription
          eventSub.unsubscribe();
          await eventLoop.catch(() => {});

          // Fallback: if no streaming events, send full response as single chunk
          if (!streamedContent && result.responseContent) {
            sendSSEChunk(res, {
              id: requestId, object: 'chat.completion.chunk', created, model: requestModel,
              choices: [{ index: 0, delta: { content: result.responseContent }, finish_reason: null }],
            });
          }

          // Finish chunk
          const streamFinishReason = hasToolCalls && result.finishReason === 'stop'
            ? 'tool_calls' as const : result.finishReason;
          sendSSEChunk(res, {
            id: requestId, object: 'chat.completion.chunk', created, model: requestModel,
            choices: [{ index: 0, delta: {}, finish_reason: streamFinishReason }],
          });
          res.write('data: [DONE]\n\n');
          res.end();
        } catch (err) {
          logger.error('result_decode_failed', { error: (err as Error).message });
          if (!res.writableEnded) res.end();
        }

        resultSub.unsubscribe();
        break;
      }

      clearInterval(keepalive);
      clearTimeout(resultTimeout);
    } else {
      // ── Non-streaming mode ──

      // Publish and wait for result via NATS request/reply
      nc.publish(subject, encode(sessionRequest));

      // Subscribe to result subject and wait
      const resultSub = nc.subscribe(resultSubject(requestId), { max: 1 });
      const timeout = setTimeout(() => {
        resultSub.unsubscribe();
      }, SESSION_RESULT_TIMEOUT_MS);

      for await (const msg of resultSub) {
        clearTimeout(timeout);
        try {
          const result = decode<SessionResult>(msg.data);

          const response = {
            id: requestId, object: 'chat.completion', created, model: requestModel,
            choices: [{
              index: 0,
              message: { role: 'assistant', content: result.responseContent },
              finish_reason: result.finishReason,
            }],
            usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
          };

          const responseBody = JSON.stringify(response);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(responseBody);
        } catch (err) {
          logger.error('result_decode_failed', { error: (err as Error).message });
          sendError(res, 500, 'Failed to decode result');
        }
        break;
      }
    }
  }

  // ── SSE events via NATS ──

  function handleEvents(req: IncomingMessage, res: ServerResponse): void {
    const parsedUrl = new URL(req.url ?? '/', 'http://localhost');
    const requestIdFilter = parsedUrl.searchParams.get('request_id') ?? undefined;
    const typesParam = parsedUrl.searchParams.get('types') ?? undefined;
    const typeFilter = typesParam ? new Set(typesParam.split(',').map(t => t.trim()).filter(Boolean)) : undefined;

    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    res.write(':connected\n\n');

    // Subscribe to NATS events
    const natsSubject = requestIdFilter
      ? eventSubject(requestIdFilter)
      : 'events.global';

    const sub = nc.subscribe(natsSubject);

    const keepalive = setInterval(() => {
      try { res.write(':keepalive\n\n'); } catch { /* client gone */ }
    }, SSE_KEEPALIVE_MS);

    // Forward NATS events to SSE
    (async () => {
      for await (const msg of sub) {
        try {
          const event = decode<StreamEvent>(msg.data);
          if (typeFilter && !typeFilter.has(event.type)) continue;
          res.write(`data: ${JSON.stringify(event)}\n\n`);
        } catch { /* skip malformed */ }
      }
    })().catch(() => {});

    const cleanup = () => {
      clearInterval(keepalive);
      sub.unsubscribe();
    };
    req.on('close', cleanup);
    req.on('error', cleanup);
  }

  // ── Start HTTP server ──

  const server: HttpServer = createHttpServer(handleRequest);
  await new Promise<void>((resolve, reject) => {
    server.listen(port, '0.0.0.0', () => {
      logger.info('host_listening', { port });
      resolve();
    });
    server.on('error', reject);
  });

  // ── Graceful shutdown ──

  const shutdown = async () => {
    draining = true;
    logger.info('host_shutting_down');

    server.close();
    await nc.drain();
    providers.eventbus.close();
    providers.storage.close();
    await shutdownTracing();

    process.exit(0);
  };

  process.on('SIGTERM', () => void shutdown());
  process.on('SIGINT', () => void shutdown());
}

main().catch((err) => {
  console.error('[host-process] fatal:', err);
  process.exit(1);
});
