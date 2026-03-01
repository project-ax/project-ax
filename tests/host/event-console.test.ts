import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createEventBus, type StreamEvent } from '../../src/host/event-bus.js';
import { attachEventConsole, attachJsonEventConsole } from '../../src/host/event-console.js';

function makeEvent(overrides: Partial<StreamEvent> = {}): StreamEvent {
  return {
    type: 'test.event',
    requestId: 'req-1',
    timestamp: 1709128800000, // fixed timestamp for deterministic output
    data: {},
    ...overrides,
  };
}

/** Strip ANSI escape codes for assertion readability. */
function stripAnsi(s: string): string {
  return s.replace(/\x1B\[[0-9;]*m/g, '');
}

describe('attachEventConsole', () => {
  let writeSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
  });

  afterEach(() => {
    writeSpy.mockRestore();
  });

  it('prints formatted event lines to stdout', () => {
    const bus = createEventBus();
    const unsub = attachEventConsole(bus);

    bus.emit(makeEvent({ type: 'llm.start', data: { model: 'claude-sonnet-4' } }));

    expect(writeSpy).toHaveBeenCalledTimes(1);
    const output = stripAnsi(writeSpy.mock.calls[0][0] as string);
    expect(output).toContain('llm.start');
    expect(output).toContain('ok');
    expect(output).toMatch(/\d{2}:\d{2}:\d{2}/); // timestamp

    unsub();
  });

  it('skips llm.chunk events (too noisy)', () => {
    const bus = createEventBus();
    const unsub = attachEventConsole(bus);

    bus.emit(makeEvent({ type: 'llm.chunk', data: { content: 'hello' } }));

    expect(writeSpy).not.toHaveBeenCalled();

    unsub();
  });

  it('shows tool name in tool.call events', () => {
    const bus = createEventBus();
    const unsub = attachEventConsole(bus);

    bus.emit(makeEvent({ type: 'tool.call', data: { toolName: 'bash', toolId: 'tc-1' } }));

    const output = stripAnsi(writeSpy.mock.calls[0][0] as string);
    expect(output).toContain('tool.call: bash');
    expect(output).toContain('ok');

    unsub();
  });

  it('shows blocked status for scan.inbound BLOCK', () => {
    const bus = createEventBus();
    const unsub = attachEventConsole(bus);

    bus.emit(makeEvent({ type: 'scan.inbound', data: { verdict: 'BLOCK', reason: 'injection' } }));

    const output = stripAnsi(writeSpy.mock.calls[0][0] as string);
    expect(output).toContain('scan.inbound');
    expect(output).toContain('blocked');

    unsub();
  });

  it('shows ok status for scan.inbound PASS', () => {
    const bus = createEventBus();
    const unsub = attachEventConsole(bus);

    bus.emit(makeEvent({ type: 'scan.inbound', data: { verdict: 'PASS' } }));

    const output = stripAnsi(writeSpy.mock.calls[0][0] as string);
    expect(output).toContain('scan.inbound');
    expect(output).toContain('ok');

    unsub();
  });

  it('shows flagged status for scan.outbound FLAG', () => {
    const bus = createEventBus();
    const unsub = attachEventConsole(bus);

    bus.emit(makeEvent({ type: 'scan.outbound', data: { verdict: 'FLAG', canaryLeaked: false } }));

    const output = stripAnsi(writeSpy.mock.calls[0][0] as string);
    expect(output).toContain('scan.outbound');
    expect(output).toContain('flagged');

    unsub();
  });

  it('shows canary leaked for scan.outbound with leak', () => {
    const bus = createEventBus();
    const unsub = attachEventConsole(bus);

    bus.emit(makeEvent({ type: 'scan.outbound', data: { verdict: 'PASS', canaryLeaked: true } }));

    const output = stripAnsi(writeSpy.mock.calls[0][0] as string);
    expect(output).toContain('scan.outbound');
    expect(output).toContain('canary leaked');

    unsub();
  });

  it('shows error message for completion.error', () => {
    const bus = createEventBus();
    const unsub = attachEventConsole(bus);

    bus.emit(makeEvent({ type: 'completion.error', data: { error: 'timeout', sessionId: 's1' } }));

    const output = stripAnsi(writeSpy.mock.calls[0][0] as string);
    expect(output).toContain('completion.error');
    expect(output).toContain('timeout');

    unsub();
  });

  it('shows token stats for llm.done', () => {
    const bus = createEventBus();
    const unsub = attachEventConsole(bus);

    bus.emit(makeEvent({
      type: 'llm.done',
      data: { chunkCount: 10, toolUseCount: 2, inputTokens: 500, outputTokens: 150 },
    }));

    const output = stripAnsi(writeSpy.mock.calls[0][0] as string);
    expect(output).toContain('llm.done');
    expect(output).toContain('in:500');
    expect(output).toContain('out:150');
    expect(output).toContain('tools:2');

    unsub();
  });

  it('shows stream status for llm.thinking', () => {
    const bus = createEventBus();
    const unsub = attachEventConsole(bus);

    bus.emit(makeEvent({ type: 'llm.thinking', data: { contentLength: 42 } }));

    const output = stripAnsi(writeSpy.mock.calls[0][0] as string);
    expect(output).toContain('llm.thinking');
    expect(output).toContain('stream');

    unsub();
  });

  it('unsubscribes cleanly', () => {
    const bus = createEventBus();
    const unsub = attachEventConsole(bus);

    bus.emit(makeEvent({ type: 'llm.start' }));
    expect(writeSpy).toHaveBeenCalledTimes(1);

    unsub();
    bus.emit(makeEvent({ type: 'llm.start' }));
    expect(writeSpy).toHaveBeenCalledTimes(1); // no new calls
  });

  it('shows spawn for completion.agent', () => {
    const bus = createEventBus();
    const unsub = attachEventConsole(bus);

    bus.emit(makeEvent({ type: 'completion.agent', data: { agentType: 'pi-session', attempt: 0, sessionId: 's1' } }));

    const output = stripAnsi(writeSpy.mock.calls[0][0] as string);
    expect(output).toContain('agent: pi-session');
    expect(output).toContain('spawn');

    unsub();
  });

  it('shows profile for server.config', () => {
    const bus = createEventBus();
    const unsub = attachEventConsole(bus);

    bus.emit(makeEvent({ type: 'server.config', data: { profile: 'yolo' } }));

    const output = stripAnsi(writeSpy.mock.calls[0][0] as string);
    expect(output).toContain('server.config');
    expect(output).toContain('profile: yolo');

    unsub();
  });

  it('shows ok for server.providers', () => {
    const bus = createEventBus();
    const unsub = attachEventConsole(bus);

    bus.emit(makeEvent({ type: 'server.providers', data: {} }));

    const output = stripAnsi(writeSpy.mock.calls[0][0] as string);
    expect(output).toContain('server.providers');
    expect(output).toContain('ok');

    unsub();
  });

  it('shows socket and port for server.ready', () => {
    const bus = createEventBus();
    const unsub = attachEventConsole(bus);

    bus.emit(makeEvent({ type: 'server.ready', data: { socket: '/tmp/ax.sock', port: 18789 } }));

    const output = stripAnsi(writeSpy.mock.calls[0][0] as string);
    expect(output).toContain('server.ready');
    expect(output).toContain('/tmp/ax.sock');
    expect(output).toContain('port: 18789');

    unsub();
  });
});

describe('attachJsonEventConsole', () => {
  let writeSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
  });

  afterEach(() => {
    writeSpy.mockRestore();
  });

  it('writes valid JSONL for each event', () => {
    const bus = createEventBus();
    const unsub = attachJsonEventConsole(bus);

    bus.emit(makeEvent({ type: 'llm.start', data: { model: 'claude-sonnet-4' } }));

    expect(writeSpy).toHaveBeenCalledTimes(1);
    const output = writeSpy.mock.calls[0][0] as string;
    expect(output).toMatch(/\n$/); // ends with newline
    const parsed = JSON.parse(output);
    expect(parsed.type).toBe('llm.start');
    expect(parsed.data.model).toBe('claude-sonnet-4');

    unsub();
  });

  it('skips llm.chunk events in JSON mode', () => {
    const bus = createEventBus();
    const unsub = attachJsonEventConsole(bus);

    bus.emit(makeEvent({ type: 'llm.chunk', data: { content: 'hello' } }));

    expect(writeSpy).not.toHaveBeenCalled();

    unsub();
  });

  it('unsubscribes cleanly', () => {
    const bus = createEventBus();
    const unsub = attachJsonEventConsole(bus);

    bus.emit(makeEvent({ type: 'llm.start' }));
    expect(writeSpy).toHaveBeenCalledTimes(1);

    unsub();
    bus.emit(makeEvent({ type: 'llm.start' }));
    expect(writeSpy).toHaveBeenCalledTimes(1);
  });
});
