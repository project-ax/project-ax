import { describe, test, expect } from 'vitest';
import {
  encode, decode,
  sessionRequestSubject, resultSubject, eventSubject,
  AGENT_RUNTIME_QUEUE_GROUP,
  type SessionRequest, type SessionResult,
} from '../../src/host/nats-session-protocol.js';

describe('nats-session-protocol', () => {
  test('sessionRequestSubject formats correctly', () => {
    expect(sessionRequestSubject('pi-coding-agent')).toBe('session.request.pi-coding-agent');
    expect(sessionRequestSubject('claude-code')).toBe('session.request.claude-code');
  });

  test('resultSubject formats correctly', () => {
    expect(resultSubject('req-123')).toBe('results.req-123');
  });

  test('eventSubject formats correctly', () => {
    expect(eventSubject('req-456')).toBe('events.req-456');
  });

  test('AGENT_RUNTIME_QUEUE_GROUP is defined', () => {
    expect(AGENT_RUNTIME_QUEUE_GROUP).toBe('ax-agent-runtime');
  });

  test('encode/decode round-trip preserves data', () => {
    const original: SessionRequest = {
      type: 'session_request',
      requestId: 'test-123',
      sessionId: 'session-456',
      content: 'Hello, world!',
      messages: [{ role: 'user', content: 'Hello, world!' }],
      stream: false,
      userId: 'user1',
      agentType: 'pi-coding-agent',
    };

    const encoded = encode(original);
    expect(encoded).toBeInstanceOf(Uint8Array);

    const decoded = decode<SessionRequest>(encoded);
    expect(decoded.type).toBe('session_request');
    expect(decoded.requestId).toBe('test-123');
    expect(decoded.sessionId).toBe('session-456');
    expect(decoded.content).toBe('Hello, world!');
    expect(decoded.messages).toHaveLength(1);
    expect(decoded.stream).toBe(false);
  });

  test('encode/decode handles SessionResult', () => {
    const result: SessionResult = {
      type: 'session_result',
      requestId: 'req-789',
      responseContent: 'The answer is 42.',
      finishReason: 'stop',
    };

    const decoded = decode<SessionResult>(encode(result));
    expect(decoded.type).toBe('session_result');
    expect(decoded.responseContent).toBe('The answer is 42.');
    expect(decoded.finishReason).toBe('stop');
  });

  test('encode/decode handles content blocks', () => {
    const result: SessionResult = {
      type: 'session_result',
      requestId: 'req-img',
      responseContent: 'Here is an image',
      finishReason: 'stop',
      contentBlocks: [
        { type: 'text', text: 'Here is an image' },
        { type: 'image', fileId: 'files/abc.png', mimeType: 'image/png' },
      ],
    };

    const decoded = decode<SessionResult>(encode(result));
    expect(decoded.contentBlocks).toHaveLength(2);
    expect(decoded.contentBlocks![0].type).toBe('text');
    expect(decoded.contentBlocks![1].type).toBe('image');
  });

  test('encode handles unicode and special characters', () => {
    const req: SessionRequest = {
      type: 'session_request',
      requestId: 'unicode-test',
      sessionId: 'sess',
      content: 'Hello 🌍! Tëst with spëcîal chars: <>&"\'',
      messages: [],
      stream: false,
      agentType: 'pi-coding-agent',
    };

    const decoded = decode<SessionRequest>(encode(req));
    expect(decoded.content).toBe('Hello 🌍! Tëst with spëcîal chars: <>&"\'');
  });
});
