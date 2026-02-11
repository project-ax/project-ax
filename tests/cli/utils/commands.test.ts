// tests/cli/utils/commands.test.ts
import { describe, it, expect } from 'vitest';
import { parseInput, COMMANDS } from '../../../src/cli/utils/commands.js';

describe('parseInput', () => {
  it('should identify regular messages', () => {
    const result = parseInput('Hello world');
    expect(result).toEqual({ type: 'message', content: 'Hello world' });
  });

  it('should parse /quit command', () => {
    const result = parseInput('/quit');
    expect(result).toEqual({ type: 'command', name: 'quit', args: '' });
  });

  it('should parse /clear command', () => {
    const result = parseInput('/clear');
    expect(result).toEqual({ type: 'command', name: 'clear', args: '' });
  });

  it('should parse /help command', () => {
    const result = parseInput('/help');
    expect(result).toEqual({ type: 'command', name: 'help', args: '' });
  });

  it('should handle unknown commands', () => {
    const result = parseInput('/foo');
    expect(result).toEqual({ type: 'command', name: 'foo', args: '' });
  });

  it('should parse command arguments', () => {
    const result = parseInput('/model gpt-4');
    expect(result).toEqual({ type: 'command', name: 'model', args: 'gpt-4' });
  });

  it('should trim whitespace from messages', () => {
    const result = parseInput('  hello  ');
    expect(result).toEqual({ type: 'message', content: 'hello' });
  });

  it('should ignore empty input', () => {
    const result = parseInput('');
    expect(result).toEqual({ type: 'empty' });
  });

  it('should ignore whitespace-only input', () => {
    const result = parseInput('   ');
    expect(result).toEqual({ type: 'empty' });
  });

  it('should list known commands', () => {
    expect(COMMANDS).toContainEqual(expect.objectContaining({ name: 'quit' }));
    expect(COMMANDS).toContainEqual(expect.objectContaining({ name: 'clear' }));
    expect(COMMANDS).toContainEqual(expect.objectContaining({ name: 'help' }));
  });

  it('should distinguish known from unknown commands', () => {
    const quit = parseInput('/quit');
    expect(quit.type === 'command' && COMMANDS.some(c => c.name === quit.name)).toBe(true);

    const unknown = parseInput('/foo');
    expect(unknown.type === 'command' && COMMANDS.some(c => c.name === unknown.name)).toBe(false);
  });
});
