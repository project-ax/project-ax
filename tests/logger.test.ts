// tests/logger.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createLogger, type LogEvent } from '../src/logger.js';
import { Writable } from 'node:stream';

describe('Logger', () => {
  let events: LogEvent[];
  let mockStdout: Writable;

  beforeEach(() => {
    events = [];
    mockStdout = new Writable({
      write(chunk, _encoding, callback) {
        const line = chunk.toString().trim();
        if (line) {
          events.push(JSON.parse(line));
        }
        callback();
      },
    });
  });

  it('should log llm_call event', () => {
    const logger = createLogger({ format: 'json', stream: mockStdout });
    logger.llm_call('anthropic', 1247, 384, 'ok');

    expect(events).toHaveLength(1);
    expect(events[0].event).toBe('llm_call');
    expect(events[0].status).toBe('ok');
    expect(events[0].details.model).toBe('anthropic');
    expect(events[0].details.input_tokens).toBe(1247);
    expect(events[0].details.output_tokens).toBe(384);
  });

  it('should log tool_use event', () => {
    const logger = createLogger({ format: 'json', stream: mockStdout });
    logger.tool_use('bash', 'ls -la', 'ok');

    expect(events).toHaveLength(1);
    expect(events[0].event).toBe('tool_use');
    expect(events[0].status).toBe('ok');
    expect(events[0].details.tool).toBe('bash');
    expect(events[0].details.command).toBe('ls -la');
  });

  it('should log scan_inbound event', () => {
    const logger = createLogger({ format: 'json', stream: mockStdout });
    logger.scan_inbound('clean');

    expect(events).toHaveLength(1);
    expect(events[0].event).toBe('scan_inbound');
    expect(events[0].status).toBe('clean');
  });

  it('should log scan_outbound with taint score', () => {
    const logger = createLogger({ format: 'json', stream: mockStdout });
    logger.scan_outbound('clean', 0.3);

    expect(events).toHaveLength(1);
    expect(events[0].event).toBe('scan_outbound');
    expect(events[0].status).toBe('clean');
    expect(events[0].details.taint).toBe(0.3);
  });

  it('should log blocked scan with reason', () => {
    const logger = createLogger({ format: 'json', stream: mockStdout });
    logger.scan_inbound('blocked', 'injection pattern detected');

    expect(events).toHaveLength(1);
    expect(events[0].event).toBe('scan_inbound');
    expect(events[0].status).toBe('blocked');
    expect(events[0].details.reason).toBe('injection pattern detected');
  });

  it('should support pretty format with colors', () => {
    let output = '';
    const colorStdout = new Writable({
      write(chunk, _encoding, callback) {
        output += chunk.toString();
        callback();
      },
    });

    const logger = createLogger({ format: 'pretty', stream: colorStdout });
    logger.llm_call('anthropic', 100, 50, 'ok');

    expect(output).toContain('llm_call');
    expect(output).toContain('ok');
    expect(output).toMatch(/\d{2}:\d{2}:\d{2}/); // timestamp
  });

  it('should include timestamp in all events', () => {
    const logger = createLogger({ format: 'json', stream: mockStdout });
    logger.info('test message');

    expect(events).toHaveLength(1);
    expect(events[0].timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  });
});
