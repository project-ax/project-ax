// tests/host/delivery.test.ts — Tests for delivery resolution logic

import { describe, it, expect } from 'vitest';
import { resolveDelivery } from '../../src/host/delivery.js';
import type { SessionAddress, ChannelProvider } from '../../src/providers/channel/types.js';
import type { CronDelivery } from '../../src/providers/scheduler/types.js';
import type { SessionStore } from '../../src/session-store.js';

// ─── Helpers ─────────────────────────────────────────

function mockSessionStore(sessions: Record<string, SessionAddress> = {}): SessionStore {
  return {
    getLastChannelSession: (agentId: string) => sessions[agentId],
    trackSession: () => {},
    close: () => {},
  } as SessionStore;
}

function mockChannel(name: string): ChannelProvider {
  return {
    name,
    connect: async () => {},
    onMessage: () => {},
    shouldRespond: () => true,
    send: async () => {},
    disconnect: async () => {},
  };
}

function makeSession(provider: string): SessionAddress {
  return {
    provider,
    scope: 'dm',
    identifiers: { peer: 'user-1' },
  };
}

// ─── Tests ───────────────────────────────────────────

describe('resolveDelivery', () => {
  const agentId = 'agent-1';
  const slackChannel = mockChannel('slack');
  const discordChannel = mockChannel('discord');

  it('returns mode "none" when delivery is undefined', () => {
    const result = resolveDelivery(undefined, {
      sessionStore: mockSessionStore(),
      agentId,
      channels: [slackChannel],
    });
    expect(result).toEqual({ mode: 'none' });
  });

  it('returns mode "none" when delivery.mode is "none"', () => {
    const result = resolveDelivery({ mode: 'none' }, {
      sessionStore: mockSessionStore(),
      agentId,
      channels: [slackChannel],
    });
    expect(result).toEqual({ mode: 'none' });
  });

  it('resolves explicit SessionAddress target with matching channel provider', () => {
    const session = makeSession('slack');
    const delivery: CronDelivery = { mode: 'channel', target: session };

    const result = resolveDelivery(delivery, {
      sessionStore: mockSessionStore(),
      agentId,
      channels: [slackChannel, discordChannel],
    });

    expect(result).toEqual({
      mode: 'channel',
      session,
      channelProvider: slackChannel,
    });
  });

  it('returns mode "none" when explicit SessionAddress target has no matching channel', () => {
    const session = makeSession('teams'); // no 'teams' channel registered
    const delivery: CronDelivery = { mode: 'channel', target: session };

    const result = resolveDelivery(delivery, {
      sessionStore: mockSessionStore(),
      agentId,
      channels: [slackChannel, discordChannel],
    });

    expect(result).toEqual({ mode: 'none' });
  });

  it('resolves "last" target from sessionStore when session and channel exist', () => {
    const session = makeSession('discord');
    const store = mockSessionStore({ [agentId]: session });
    const delivery: CronDelivery = { mode: 'channel', target: 'last' };

    const result = resolveDelivery(delivery, {
      sessionStore: store,
      agentId,
      channels: [slackChannel, discordChannel],
    });

    expect(result).toEqual({
      mode: 'channel',
      session,
      channelProvider: discordChannel,
    });
  });

  it('returns mode "none" when "last" target finds no session in store', () => {
    const store = mockSessionStore({}); // no sessions recorded
    const delivery: CronDelivery = { mode: 'channel', target: 'last' };

    const result = resolveDelivery(delivery, {
      sessionStore: store,
      agentId,
      channels: [slackChannel],
    });

    expect(result).toEqual({ mode: 'none' });
  });

  it('returns mode "none" when "last" target finds session but no matching channel', () => {
    const session = makeSession('teams'); // stored session uses 'teams' provider
    const store = mockSessionStore({ [agentId]: session });
    const delivery: CronDelivery = { mode: 'channel', target: 'last' };

    const result = resolveDelivery(delivery, {
      sessionStore: store,
      agentId,
      channels: [slackChannel, discordChannel], // no 'teams' channel
    });

    expect(result).toEqual({ mode: 'none' });
  });

  it('falls back to defaultDelivery when no target is specified', () => {
    const session = makeSession('slack');
    const delivery: CronDelivery = { mode: 'channel' }; // no target
    const defaultDelivery: CronDelivery = { mode: 'channel', target: session };

    const result = resolveDelivery(delivery, {
      sessionStore: mockSessionStore(),
      agentId,
      defaultDelivery,
      channels: [slackChannel],
    });

    expect(result).toEqual({
      mode: 'channel',
      session,
      channelProvider: slackChannel,
    });
  });

  it('returns mode "none" when no target and no defaultDelivery', () => {
    const delivery: CronDelivery = { mode: 'channel' }; // no target

    const result = resolveDelivery(delivery, {
      sessionStore: mockSessionStore(),
      agentId,
      channels: [slackChannel],
      // no defaultDelivery
    });

    expect(result).toEqual({ mode: 'none' });
  });

  it('does not infinitely recurse when defaultDelivery itself has no target', () => {
    const delivery: CronDelivery = { mode: 'channel' }; // no target
    const defaultDelivery: CronDelivery = { mode: 'channel' }; // also no target

    // The recursive call passes defaultDelivery: undefined, so the second
    // level hits the "no target + no defaultDelivery" branch and returns none.
    const result = resolveDelivery(delivery, {
      sessionStore: mockSessionStore(),
      agentId,
      defaultDelivery,
      channels: [slackChannel],
    });

    expect(result).toEqual({ mode: 'none' });
  });
});
