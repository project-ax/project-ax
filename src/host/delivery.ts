// src/host/delivery.ts — Delivery resolution for cron/heartbeat agent responses

import type { SessionAddress, ChannelProvider } from '../providers/channel/types.js';
import type { CronDelivery } from '../providers/scheduler/types.js';
import type { SessionStore } from '../session-store.js';

export interface DeliveryResolution {
  mode: 'channel' | 'none';
  session?: SessionAddress;
  channelProvider?: ChannelProvider;
}

const NONE: DeliveryResolution = { mode: 'none' };

function findChannel(
  channels: ChannelProvider[],
  session: SessionAddress,
): ChannelProvider | undefined {
  return channels.find((ch) => ch.name === session.provider);
}

export function resolveDelivery(
  delivery: CronDelivery | undefined,
  deps: {
    sessionStore: SessionStore;
    agentId: string;
    defaultDelivery?: CronDelivery;
    channels: ChannelProvider[];
  },
): DeliveryResolution {
  // 1. No delivery config — backward compat
  if (!delivery) return NONE;

  // 2. Explicit silent run
  if (delivery.mode === 'none') return NONE;

  // 3-4. mode === 'channel'
  const { target } = delivery;

  if (target !== undefined && target !== 'last') {
    // 3. target is a SessionAddress object — validate provider exists
    const provider = findChannel(deps.channels, target);
    if (!provider) return NONE;
    return { mode: 'channel', session: target, channelProvider: provider };
  }

  if (target === 'last') {
    // 4. target is 'last' — look up most recent session
    const session = deps.sessionStore.getLastChannelSession(deps.agentId);
    if (!session) return NONE;
    const provider = findChannel(deps.channels, session);
    if (!provider) return NONE;
    return { mode: 'channel', session, channelProvider: provider };
  }

  // 5. No target — try defaultDelivery (with undefined default to prevent recursion)
  if (deps.defaultDelivery) {
    return resolveDelivery(deps.defaultDelivery, {
      ...deps,
      defaultDelivery: undefined,
    });
  }

  return NONE;
}
