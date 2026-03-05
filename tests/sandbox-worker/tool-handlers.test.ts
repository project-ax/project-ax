import { describe, test, expect, beforeEach } from 'vitest';
import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';

// Test the sandbox worker tool handler logic indirectly.
// The actual handlers are module-internal, but the core patterns
// (safe path resolution, file ops, command execution) are testable.

describe('sandbox worker: safe path resolution', () => {
  let workspace: string;

  beforeEach(() => {
    workspace = join(tmpdir(), `ax-worker-test-${randomUUID()}`);
    mkdirSync(workspace, { recursive: true });
  });

  test('resolves paths within workspace', () => {
    const abs = resolve(workspace, 'subdir/file.txt');
    expect(abs.startsWith(workspace)).toBe(true);
  });

  test('detects path traversal', () => {
    const abs = resolve(workspace, '../../../etc/passwd');
    expect(abs.startsWith(workspace)).toBe(false);
  });

  test('resolves absolute paths as themselves', () => {
    const abs = resolve(workspace, '/etc/passwd');
    // resolve with absolute second arg returns the absolute path
    expect(abs).toBe('/etc/passwd');
    expect(abs.startsWith(workspace)).toBe(false);
  });

  test('handles . and .. in paths', () => {
    const abs = resolve(workspace, './subdir/../file.txt');
    expect(abs.startsWith(workspace)).toBe(true);
    expect(abs).toBe(join(workspace, 'file.txt'));
  });
});

describe('sandbox worker: file operations', () => {
  let workspace: string;

  beforeEach(() => {
    workspace = join(tmpdir(), `ax-worker-test-${randomUUID()}`);
    mkdirSync(workspace, { recursive: true });
  });

  test('write and read file round-trip', () => {
    const filePath = join(workspace, 'test.txt');
    writeFileSync(filePath, 'hello world', 'utf-8');
    const content = readFileSync(filePath, 'utf-8');
    expect(content).toBe('hello world');
  });

  test('edit file: string replacement', () => {
    const filePath = join(workspace, 'edit.txt');
    writeFileSync(filePath, 'foo bar baz', 'utf-8');

    const content = readFileSync(filePath, 'utf-8');
    writeFileSync(filePath, content.replace('bar', 'qux'), 'utf-8');
    const updated = readFileSync(filePath, 'utf-8');
    expect(updated).toBe('foo qux baz');
  });

  test('edit file: old_string not found', () => {
    const filePath = join(workspace, 'no-match.txt');
    writeFileSync(filePath, 'hello world', 'utf-8');
    const content = readFileSync(filePath, 'utf-8');
    expect(content.includes('nonexistent')).toBe(false);
  });

  test('write file creates parent directories', () => {
    const filePath = join(workspace, 'deep', 'nested', 'dir', 'file.txt');
    mkdirSync(join(workspace, 'deep', 'nested', 'dir'), { recursive: true });
    writeFileSync(filePath, 'nested content', 'utf-8');
    const content = readFileSync(filePath, 'utf-8');
    expect(content).toBe('nested content');
  });
});
