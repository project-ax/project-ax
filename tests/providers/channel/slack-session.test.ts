import { describe, it, expect } from 'vitest';
import { canonicalize } from '../../../src/providers/channel/types.js';
import type { SessionAddress } from '../../../src/providers/channel/types.js';

describe('Slack session addressing', () => {
  it('DM session is scoped to peer only (no workspace)', () => {
    const addr: SessionAddress = {
      provider: 'slack', scope: 'dm',
      identifiers: { peer: 'U5678' },
    };
    expect(canonicalize(addr)).toBe('slack:dm:U5678');
  });

  it('channel session has no peer ID', () => {
    const addr: SessionAddress = {
      provider: 'slack', scope: 'channel',
      identifiers: { channel: 'C1234' },
    };
    expect(canonicalize(addr)).toBe('slack:channel:C1234');
  });

  it('thread session has no peer ID', () => {
    const addr: SessionAddress = {
      provider: 'slack', scope: 'thread',
      identifiers: { channel: 'C1234', thread: '1709.5678' },
    };
    expect(canonicalize(addr)).toBe('slack:thread:C1234:1709.5678');
  });

  it('group DM session is scoped to channel ID', () => {
    const addr: SessionAddress = {
      provider: 'slack', scope: 'group',
      identifiers: { channel: 'G9999' },
    };
    expect(canonicalize(addr)).toBe('slack:group:G9999');
  });

  it('two users in same channel produce identical session keys', () => {
    const addr1: SessionAddress = {
      provider: 'slack', scope: 'channel',
      identifiers: { channel: 'C1234' },
    };
    const addr2: SessionAddress = {
      provider: 'slack', scope: 'channel',
      identifiers: { channel: 'C1234' },
    };
    expect(canonicalize(addr1)).toBe(canonicalize(addr2));
  });

  it('thread session has parent pointing to channel session', () => {
    const addr: SessionAddress = {
      provider: 'slack', scope: 'thread',
      identifiers: { channel: 'C1234', thread: '1709.5678' },
      parent: {
        provider: 'slack', scope: 'channel',
        identifiers: { channel: 'C1234' },
      },
    };
    // Parent should canonicalize to the shared channel session
    expect(canonicalize(addr.parent!)).toBe('slack:channel:C1234');
  });
});
