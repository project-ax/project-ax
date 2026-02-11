import { describe, test, expect, vi } from 'vitest';
import type { Config } from '../../../src/types.js';
import type { ConversationTurn, ProactiveHint } from '../../../src/providers/memory/types.js';
import { create } from '../../../src/providers/memory/memu.js';

const config = {} as Config;

describe('memory-memu', () => {
  test('create() returns a valid MemoryProvider', async () => {
    const provider = await create(config);
    expect(typeof provider.write).toBe('function');
    expect(typeof provider.query).toBe('function');
    expect(typeof provider.read).toBe('function');
    expect(typeof provider.delete).toBe('function');
    expect(typeof provider.list).toBe('function');
    expect(typeof provider.memorize).toBe('function');
    expect(typeof provider.onProactiveHint).toBe('function');
  });

  test('write() is a no-op that returns a UUID', async () => {
    const provider = await create(config);
    const id = await provider.write({ scope: 'test', content: 'hello' });
    expect(id).toMatch(/^[0-9a-f]{8}-/);
    // write is a no-op — entry should not be queryable
    const result = await provider.read(id);
    expect(result).toBeNull();
  });

  test('delete() is a no-op', async () => {
    const provider = await create(config);
    // Should not throw
    await provider.delete('some-id');
  });

  test('memorize() extracts explicit memory requests', async () => {
    const provider = await create(config);
    const conversation: ConversationTurn[] = [
      { role: 'user', content: 'Remember that my favorite color is blue' },
      { role: 'assistant', content: 'Got it, your favorite color is blue.' },
    ];

    await provider.memorize!(conversation);

    const results = await provider.list('memu');
    expect(results.length).toBeGreaterThanOrEqual(1);

    const fact = results.find(r => r.content.includes('favorite color is blue'));
    expect(fact).toBeDefined();
    expect(fact!.tags).toContain('explicit');
    expect(fact!.tags).toContain('user-requested');
  });

  test('memorize() extracts user preferences', async () => {
    const provider = await create(config);
    const conversation: ConversationTurn[] = [
      { role: 'user', content: 'I prefer dark mode for all my applications' },
      { role: 'assistant', content: 'Noted!' },
    ];

    await provider.memorize!(conversation);

    const results = await provider.list('memu');
    const pref = results.find(r => r.tags?.includes('preference'));
    expect(pref).toBeDefined();
    expect(pref!.content).toContain('dark mode');
  });

  test('memorize() extracts action items', async () => {
    const provider = await create(config);
    const conversation: ConversationTurn[] = [
      { role: 'user', content: 'I need to finish the report by Friday' },
      { role: 'assistant', content: "I'll remind you about the report." },
    ];

    await provider.memorize!(conversation);

    const results = await provider.list('memu');
    const action = results.find(r => r.tags?.includes('action-item'));
    expect(action).toBeDefined();
    expect(action!.content).toContain('finish the report');
  });

  test('memorize() ignores assistant turns', async () => {
    const provider = await create(config);
    const conversation: ConversationTurn[] = [
      { role: 'assistant', content: 'Remember that I am an AI' },
      { role: 'user', content: 'Hello, how are you?' },
    ];

    await provider.memorize!(conversation);

    const results = await provider.list('memu');
    // "Hello, how are you?" doesn't match any extraction patterns
    // "Remember that I am an AI" is from assistant, should be ignored
    const aiRemember = results.find(r => r.content.includes('I am an AI'));
    expect(aiRemember).toBeUndefined();
  });

  test('memorize() with empty conversation is a no-op', async () => {
    const provider = await create(config);
    await provider.memorize!([]);
    const results = await provider.list('memu');
    expect(results).toEqual([]);
  });

  test('query() filters by scope', async () => {
    const provider = await create(config);
    await provider.memorize!([
      { role: 'user', content: 'Remember that my name is Alice' },
      { role: 'assistant', content: 'Got it.' },
    ]);

    const memuResults = await provider.query({ scope: 'memu' });
    expect(memuResults.length).toBeGreaterThan(0);

    const otherResults = await provider.query({ scope: 'other' });
    expect(otherResults.length).toBe(0);
  });

  test('query() filters by text', async () => {
    const provider = await create(config);
    await provider.memorize!([
      { role: 'user', content: 'Remember that my name is Alice' },
      { role: 'assistant', content: 'Got it.' },
      { role: 'user', content: 'Note that the project deadline is March 1st' },
      { role: 'assistant', content: 'Noted.' },
    ]);

    const aliceResults = await provider.query({
      scope: 'memu',
      query: 'alice',
    });
    expect(aliceResults.length).toBe(1);

    const deadlineResults = await provider.query({
      scope: 'memu',
      query: 'deadline',
    });
    expect(deadlineResults.length).toBe(1);
  });

  test('query() filters by tags', async () => {
    const provider = await create(config);
    await provider.memorize!([
      { role: 'user', content: 'I need to buy groceries tomorrow' },
      { role: 'assistant', content: 'Added to your list.' },
      { role: 'user', content: 'I prefer TypeScript over JavaScript' },
      { role: 'assistant', content: 'Noted.' },
    ]);

    const actions = await provider.query({
      scope: 'memu',
      tags: ['action-item'],
    });
    expect(actions.length).toBeGreaterThanOrEqual(1);

    const prefs = await provider.query({
      scope: 'memu',
      tags: ['preference'],
    });
    expect(prefs.length).toBeGreaterThanOrEqual(1);
  });

  test('query() with wildcard scope returns all entries', async () => {
    const provider = await create(config);
    await provider.memorize!([
      { role: 'user', content: 'Remember that my API key format is sk-xxx' },
      { role: 'assistant', content: 'Got it.' },
    ]);

    const results = await provider.query({ scope: '*' });
    expect(results.length).toBeGreaterThan(0);
  });

  test('read() returns entry by ID', async () => {
    const provider = await create(config);
    await provider.memorize!([
      { role: 'user', content: 'Remember that the server port is 8080' },
      { role: 'assistant', content: 'Noted.' },
    ]);

    const all = await provider.list('memu');
    expect(all.length).toBeGreaterThan(0);

    const entry = await provider.read(all[0].id!);
    expect(entry).toBeDefined();
    expect(entry!.id).toBe(all[0].id);
  });

  test('read() returns null for unknown ID', async () => {
    const provider = await create(config);
    const result = await provider.read('nonexistent');
    expect(result).toBeNull();
  });

  test('onProactiveHint() emits hints for action items', async () => {
    const provider = await create(config);
    const hints: ProactiveHint[] = [];
    provider.onProactiveHint!((hint) => hints.push(hint));

    await provider.memorize!([
      { role: 'user', content: 'I need to deploy the new version tonight' },
      { role: 'assistant', content: "I'll remind you." },
    ]);

    expect(hints.length).toBeGreaterThanOrEqual(1);
    const taskHint = hints.find(h => h.kind === 'pending_task');
    expect(taskHint).toBeDefined();
    expect(taskHint!.source).toBe('memory');
    expect(taskHint!.suggestedPrompt).toContain('deploy');
  });

  test('list() respects limit parameter', async () => {
    const provider = await create(config);

    // Create multiple facts
    await provider.memorize!([
      { role: 'user', content: 'Remember that item A is important' },
      { role: 'assistant', content: 'Got it.' },
      { role: 'user', content: 'Note that item B is also important' },
      { role: 'assistant', content: 'Got it.' },
      { role: 'user', content: "Don't forget about item C either" },
      { role: 'assistant', content: 'Got it.' },
    ]);

    const limited = await provider.list('memu', 1);
    expect(limited.length).toBe(1);
  });
});
