// src/providers/channel/types.ts — Channel provider types

export interface InboundMessage {
  id: string;
  channel: string;
  sender: string;
  content: string;
  media?: Buffer;
  timestamp: Date;
  isGroup: boolean;
  groupId?: string;
}

export interface OutboundMessage {
  content: string;
  media?: Buffer;
  replyTo?: string;
}

export interface ChannelProvider {
  name: string;
  connect(): Promise<void>;
  onMessage(handler: (msg: InboundMessage) => void): void;
  send(target: string, content: OutboundMessage): Promise<void>;
  disconnect(): Promise<void>;
}
