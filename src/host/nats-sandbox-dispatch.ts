// src/host/nats-sandbox-dispatch.ts — NATS-based sandbox tool dispatch
//
// Used by sandbox tool IPC handlers to dispatch tool calls to remote
// sandbox pods via NATS request/reply when the sandbox provider is k8s-pod.
//
// Per-turn pod affinity: the first tool call in a turn claims a warm pod,
// subsequent calls in the same turn reuse the same pod via its unique subject.

import { getLogger } from '../logger.js';
import type {
  SandboxClaimRequest,
  SandboxClaimResponse,
  SandboxToolRequest,
  SandboxToolResponse,
} from '../sandbox-worker/types.js';

const logger = getLogger().child({ component: 'nats-sandbox-dispatch' });

/** Default timeout for NATS request/reply operations. */
const CLAIM_TIMEOUT_MS = 60_000;   // 60s — workspace setup can be slow
const TOOL_TIMEOUT_MS = 120_000;   // 120s — bash commands can be long

/**
 * Encode an object to NATS message payload.
 */
function encode(obj: unknown): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(obj));
}

/**
 * Decode a NATS message payload.
 */
function decode<T = unknown>(data: Uint8Array): T {
  return JSON.parse(new TextDecoder().decode(data)) as T;
}

/**
 * Tracks per-turn pod affinity: requestId → claimed pod subject.
 * When a tool call arrives for a requestId that already has a claimed pod,
 * the call is dispatched directly to that pod instead of going through
 * the task queue again.
 */
export interface PodAffinity {
  podSubject: string;
  podId: string;
  sessionId: string;
}

/**
 * NATSSandboxDispatcher — dispatches sandbox tool calls to remote pods via NATS.
 *
 * Usage:
 *   const dispatcher = await createNATSSandboxDispatcher({ natsUrl });
 *   // First tool call in a turn — claims a warm pod:
 *   const result = await dispatcher.dispatch(requestId, sessionId, { type: 'bash', command: 'ls' });
 *   // Second tool call — reuses same pod:
 *   const result2 = await dispatcher.dispatch(requestId, sessionId, { type: 'read_file', path: 'foo.txt' });
 *   // End of turn — release the pod:
 *   await dispatcher.release(requestId);
 */
export interface NATSSandboxDispatcher {
  /**
   * Dispatch a tool request. Claims a pod on first call per requestId,
   * reuses the same pod for subsequent calls.
   */
  dispatch(
    requestId: string,
    sessionId: string,
    tool: SandboxToolRequest,
    tier?: string,
  ): Promise<SandboxToolResponse>;

  /**
   * Release the pod claimed for a given requestId.
   * Should be called at end of turn.
   */
  release(requestId: string): Promise<void>;

  /**
   * Check if a requestId has a claimed pod.
   */
  hasPod(requestId: string): boolean;

  /**
   * Close the dispatcher and release all claimed pods.
   */
  close(): Promise<void>;
}

export async function createNATSSandboxDispatcher(options?: {
  natsUrl?: string;
}): Promise<NATSSandboxDispatcher> {
  const natsModule = await import('nats');
  const { connect } = natsModule;

  const natsUrl = options?.natsUrl ?? process.env.NATS_URL ?? 'nats://localhost:4222';

  const nc = await connect({
    servers: natsUrl,
    name: `ax-sandbox-dispatch-${process.pid}`,
    reconnect: true,
    maxReconnectAttempts: -1,
    reconnectTimeWait: 1000,
  });

  logger.info('nats_dispatch_connected', { url: natsUrl });

  // Per-turn pod affinity map
  const affinity = new Map<string, PodAffinity>();

  async function claimPod(
    requestId: string,
    sessionId: string,
    tier: string,
  ): Promise<PodAffinity> {
    const existing = affinity.get(requestId);
    if (existing) return existing;

    const claimReq: SandboxClaimRequest = {
      type: 'claim',
      requestId,
      sessionId,
    };

    logger.debug('claiming_pod', { requestId, sessionId, tier });

    const response = await nc.request(
      `tasks.sandbox.${tier}`,
      encode(claimReq),
      { timeout: CLAIM_TIMEOUT_MS },
    );

    const ack = decode<SandboxClaimResponse>(response.data);
    if (ack.type !== 'claim_ack') {
      throw new Error(`Unexpected claim response type: ${ack.type}`);
    }

    const pod: PodAffinity = {
      podSubject: ack.podSubject,
      podId: ack.podId,
      sessionId,
    };

    affinity.set(requestId, pod);
    logger.info('pod_claimed', { requestId, podId: pod.podId, podSubject: pod.podSubject });

    return pod;
  }

  return {
    async dispatch(
      requestId: string,
      sessionId: string,
      tool: SandboxToolRequest,
      tier = 'light',
    ): Promise<SandboxToolResponse> {
      // Ensure we have a claimed pod for this turn
      const pod = await claimPod(requestId, sessionId, tier);

      logger.debug('dispatching_tool', {
        requestId,
        podId: pod.podId,
        toolType: tool.type,
      });

      const response = await nc.request(
        pod.podSubject,
        encode(tool),
        { timeout: TOOL_TIMEOUT_MS },
      );

      return decode<SandboxToolResponse>(response.data);
    },

    async release(requestId: string): Promise<void> {
      const pod = affinity.get(requestId);
      if (!pod) return;

      try {
        await nc.request(
          pod.podSubject,
          encode({ type: 'release' } as SandboxToolRequest),
          { timeout: 10_000 },
        );
        logger.debug('pod_released', { requestId, podId: pod.podId });
      } catch (err) {
        logger.warn('pod_release_failed', {
          requestId,
          podId: pod.podId,
          error: (err as Error).message,
        });
      } finally {
        affinity.delete(requestId);
      }
    },

    hasPod(requestId: string): boolean {
      return affinity.has(requestId);
    },

    async close(): Promise<void> {
      // Release all claimed pods
      const releases = [...affinity.keys()].map((reqId) => this.release(reqId));
      await Promise.allSettled(releases);
      await nc.drain();
    },
  };
}
