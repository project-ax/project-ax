// src/host/nats-session-protocol.ts — NATS session dispatch protocol.
//
// Defines the message types exchanged between host pods (HTTP ingress)
// and agent runtime pods (conversation plane) via NATS.
//
// Host pods publish session requests; agent runtime pods claim and process them.
// Results and streaming events flow back via NATS subjects.

import type { ContentBlock } from '../types.js';

// ── NATS subjects ──

/** Session request subjects: session.request.{agentType} */
export function sessionRequestSubject(agentType: string): string {
  return `session.request.${agentType}`;
}

/** Result subjects: results.{requestId} */
export function resultSubject(requestId: string): string {
  return `results.${requestId}`;
}

/** Event subjects: events.{requestId} */
export function eventSubject(requestId: string): string {
  return `events.${requestId}`;
}

// ── Queue groups ──

/** Agent runtime pods compete for session requests. */
export const AGENT_RUNTIME_QUEUE_GROUP = 'ax-agent-runtime';

// ── Message types ──

/**
 * Session request — published by host pods to session.request.{agentType}.
 * Agent runtime pods claim these from the queue group.
 */
export interface SessionRequest {
  type: 'session_request';
  requestId: string;
  sessionId: string;
  content: string | ContentBlock[];
  /** Client-provided message history (OpenAI format). */
  messages: { role: string; content: string | ContentBlock[] }[];
  /** Whether the client wants streaming (SSE). */
  stream: boolean;
  /** User ID from the request. */
  userId?: string;
  /** Agent type to use (pi-coding-agent, claude-code). */
  agentType: string;
  /** Model override from the request. */
  model?: string;
  /** Persistent session ID for conversation tracking. */
  persistentSessionId?: string;
  /** Pre-processed message (from channel handler). */
  preProcessed?: {
    sessionId: string;
    messageId: string;
    canaryToken: string;
  };
  /** Whether reply is optional (e.g. channel message without @mention). */
  replyOptional?: boolean;
  /** Session scope for memory. */
  sessionScope?: 'dm' | 'channel' | 'thread' | 'group';
}

/**
 * Session result — published by agent runtime pods to results.{requestId}.
 * Host pods subscribe to receive the final response.
 */
export interface SessionResult {
  type: 'session_result';
  requestId: string;
  responseContent: string;
  finishReason: 'stop' | 'content_filter';
  /** Structured content blocks (when response includes images). */
  contentBlocks?: ContentBlock[];
  /** Error message if processing failed. */
  error?: string;
}

// ── Serialization ──

export function encode(obj: unknown): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(obj));
}

export function decode<T = unknown>(data: Uint8Array): T {
  return JSON.parse(new TextDecoder().decode(data)) as T;
}
