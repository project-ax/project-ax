import { describe, test, expect } from 'vitest';
import { canonicalize, type SessionAddress } from '../../../src/providers/channel/types.js';

describe('canonicalize', () => {
  test('serializes DM session', () => {
    const addr: SessionAddress = {
      provider: 'slack',
      scope: 'dm',
      identifiers: { workspace: 'T01', peer: 'U789' },
    };
    expect(canonicalize(addr)).toBe('slack:dm:T01:U789');
  });

  test('serializes channel session', () => {
    const addr: SessionAddress = {
      provider: 'discord',
      scope: 'channel',
      identifiers: { workspace: 'G01', channel: 'C01', peer: 'U123' },
    };
    expect(canonicalize(addr)).toBe('discord:channel:G01:C01:U123');
  });

  test('serializes thread session with all identifiers', () => {
    const addr: SessionAddress = {
      provider: 'slack',
      scope: 'thread',
      identifiers: { workspace: 'T01', channel: 'C01', thread: '1234.5678', peer: 'U789' },
    };
    expect(canonicalize(addr)).toBe('slack:thread:T01:C01:1234.5678:U789');
  });

  test('omits empty identifier segments', () => {
    const addr: SessionAddress = {
      provider: 'telegram',
      scope: 'dm',
      identifiers: { peer: 'U999' },
    };
    expect(canonicalize(addr)).toBe('telegram:dm:U999');
  });

  test('serializes scheduler session', () => {
    const addr: SessionAddress = {
      provider: 'scheduler',
      scope: 'dm',
      identifiers: { peer: 'heartbeat' },
    };
    expect(canonicalize(addr)).toBe('scheduler:dm:heartbeat');
  });
});
