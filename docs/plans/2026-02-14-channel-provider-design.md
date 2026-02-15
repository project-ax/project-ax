# Channel Provider Design

**Date:** 2026-02-14
**Status:** Approved
**Scope:** Redesign `ChannelProvider` interface + rewrite Slack adapter

## Problem

The current `ChannelProvider` interface is too minimal for production use. It lacks threading, media support, access control, and meaningful session identity. The existing Slack adapter works but maps sessions to random UUIDs (losing semantic context) and has no access control or media handling.

## Goals

1. A `ChannelProvider` interface general enough for Slack, Discord, Telegram, WhatsApp, etc.
2. Typed, hierarchical session addressing (superior to OpenClaw's string-key approach)
3. Config-driven access control (DM policies, mention-gating, allowlists)
4. Bidirectional rich media (attachments in and out, with size/type limits)
5. Thread-aware sessions with parent-child relationships
6. A working Slack adapter that implements the full interface

## Non-Goals

- Hot-reload API (the design supports it; building it is deferred)
- Event bus / plugin system (YAGNI)
- Other platform adapters (Discord, Telegram, WhatsApp are future work)

## Design

### Core Types (`src/providers/channel/types.ts`)

#### Session Addressing

```typescript
export type SessionScope = 'dm' | 'channel' | 'thread' | 'group';

export interface SessionAddress {
  provider: string;           // 'slack', 'discord', 'telegram', 'whatsapp'
  scope: SessionScope;
  identifiers: {
    workspace?: string;       // Slack team ID, Discord guild ID
    channel?: string;         // Channel/chat/group ID
    thread?: string;          // Thread timestamp (Slack) or thread ID (Discord)
    peer?: string;            // User ID on the platform
  };
  parent?: SessionAddress;    // thread → channel, channel → workspace
}
```

**Why not string keys?** OpenClaw uses `agent:main:slack:thread:C01:ts` — colon-delimited strings that require parsing conventions, break when new dimensions are added, and have no type safety. AX uses typed objects with deterministic serialization:

```typescript
export function canonicalize(addr: SessionAddress): string {
  const parts = [addr.provider, addr.scope];
  const ids = addr.identifiers;
  if (ids.workspace) parts.push(ids.workspace);
  if (ids.channel) parts.push(ids.channel);
  if (ids.thread) parts.push(ids.thread);
  if (ids.peer) parts.push(ids.peer);
  return parts.join(':');
}
// e.g. "slack:thread:T01:C01:1234.5678:U789"
```

Strings for storage/lookup. Objects for logic.

#### Message Types

```typescript
export interface Attachment {
  filename: string;
  mimeType: string;
  size: number;               // bytes
  content?: Buffer;           // populated if within size limit
  url?: string;               // platform-hosted URL (for large files)
}

export interface InboundMessage {
  id: string;                 // platform message ID (Slack ts, Discord snowflake)
  session: SessionAddress;    // typed session identity
  sender: string;             // platform user ID
  content: string;
  attachments: Attachment[];  // always present, empty array if none
  timestamp: Date;
  replyTo?: string;           // message ID this replies to
  raw?: unknown;              // platform-specific event payload for edge cases
}

export interface OutboundMessage {
  content: string;
  attachments?: Attachment[];
  replyTo?: string;           // message ID to reply to (creates/continues thread)
}
```

#### Access Control Config

```typescript
export type DMPolicy = 'open' | 'allowlist' | 'disabled';

export interface ChannelAccessConfig {
  dmPolicy: DMPolicy;                // who can DM the bot (default: 'open')
  allowedUsers?: string[];           // user IDs when dmPolicy is 'allowlist'
  requireMention: boolean;           // require @mention in channels (default: true)
  mentionPatterns?: string[];        // additional trigger patterns beyond @mention
  maxAttachmentBytes: number;        // per-attachment size limit (default: 20MB)
  allowedMimeTypes?: string[];       // whitelist; undefined = allow all
}
```

#### ChannelProvider Interface

```typescript
export interface ChannelProvider {
  /** Provider name — 'slack', 'discord', etc. */
  name: string;

  /** Initialize connection to the platform */
  connect(): Promise<void>;

  /** Register handler for inbound messages */
  onMessage(handler: (msg: InboundMessage) => Promise<void>): void;

  /**
   * Check if an inbound event should be processed.
   * Evaluates DM policy, mention requirements, allowlists.
   * Called by host server before forwarding to agent.
   */
  shouldRespond(msg: InboundMessage): boolean;

  /** Send a response to the platform */
  send(session: SessionAddress, content: OutboundMessage): Promise<void>;

  /** Graceful shutdown */
  disconnect(): Promise<void>;
}
```

### Slack Adapter (`src/providers/channel/slack.ts`)

Uses `@slack/bolt` in Socket Mode (WebSocket — no inbound HTTP ports).

**Credentials:** `SLACK_BOT_TOKEN` (xoxb-) + `SLACK_APP_TOKEN` (xapp-)

**Events handled:**
- `message` — DMs and channel messages
- `app_mention` — @mention in channels

**Session mapping:**
- DM → `{ provider: 'slack', scope: 'dm', identifiers: { workspace, peer } }`
- Channel → `{ provider: 'slack', scope: 'channel', identifiers: { workspace, channel, peer } }`
- Thread → `{ provider: 'slack', scope: 'thread', identifiers: { workspace, channel, thread, peer }, parent: channelSession }`

**Access control:**
- `shouldRespond()` checks DM policy (open/allowlist/disabled) and mention requirements
- Strips bot mention from message text before forwarding
- Config read from `ax.yaml` `channel_config.slack` section with sensible defaults

**Media:**
- Inbound: `files.info` API, respects `maxAttachmentBytes` and `allowedMimeTypes`
- Outbound: `files.uploadV2` API
- Text chunking: 4000 char limit, splits on newline boundaries

**Send routing:**
- Extracts `channel` and optional `thread` from `SessionAddress.identifiers`
- Posts via `chat.postMessage` with `thread_ts` for threaded replies

### Config Schema (`ax.yaml`)

```yaml
providers:
  channels:
    - slack

channel_config:
  slack:
    dm_policy: allowlist        # 'open' | 'allowlist' | 'disabled'
    allowed_users:
      - U01234567
    require_mention: true
    max_attachment_bytes: 20971520  # 20MB
    # allowed_mime_types: ['image/*', 'application/pdf']  # optional whitelist
```

`channel_config` is optional. Defaults: DMs open, mention required in channels, 20MB attachment limit.

### Host Server Changes (`src/host/server.ts`)

The channel loop gains `shouldRespond()` and uses `SessionAddress` for routing:

```typescript
for (const channel of providers.channels) {
  channel.onMessage(async (msg) => {
    if (!channel.shouldRespond(msg)) {
      logger.debug('Channel message filtered', { provider: channel.name, sender: msg.sender });
      return;
    }
    const result = await router.processInbound(msg);
    if (!result.queued) {
      await channel.send(msg.session, {
        content: `Message blocked: ${result.scanResult.reason ?? 'security scan failed'}`,
      });
      return;
    }
    sessionCanaries.set(result.sessionId, result.canaryToken);
    const { responseContent } = await processCompletion(
      msg.content, `ch-${randomUUID().slice(0, 8)}`, [], msg.id
    );
    await channel.send(msg.session, { content: responseContent });
  });
  await channel.connect();
}
```

### File Structure

```
src/providers/channel/
  types.ts          # All types: SessionAddress, messages, access config, ChannelProvider
  slack.ts          # Slack adapter (rewrite)
tests/providers/channel/
  slack.test.ts     # Unit tests
```

### What Other Adapters Need to Implement

Any new channel adapter (Discord, Telegram, WhatsApp) implements `ChannelProvider`:

1. Export `create(config: Config): Promise<ChannelProvider>`
2. Map platform events → `InboundMessage` with proper `SessionAddress`
3. Implement `shouldRespond()` checking `ChannelAccessConfig`
4. Implement `send()` routing from `SessionAddress` back to platform API
5. Add entry to `src/host/provider-map.ts` static allowlist

The types are platform-agnostic. Platform quirks stay inside the adapter.

## Security Considerations

- Credentials (`SLACK_BOT_TOKEN`, `SLACK_APP_TOKEN`) stay on the host — never enter agent containers
- Inbound messages are taint-tagged as `external` trust level
- Attachment downloads respect size limits before pulling into memory
- `shouldRespond()` runs before any agent processing — blocked messages never reach the sandbox
- No dynamic imports from config values — Slack adapter path is in the static allowlist
