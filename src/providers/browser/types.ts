// src/providers/browser/types.ts — Browser provider types

export interface BrowserConfig {
  headless?: boolean;
  viewport?: { width?: number; height?: number };
}

export interface BrowserSession {
  id: string;
}

export interface PageSnapshot {
  title: string;
  url: string;
  text: string;
  refs: { ref: number; tag: string; text: string }[];
}

export interface BrowserProvider {
  launch(config: BrowserConfig): Promise<BrowserSession>;
  navigate(session: string, url: string): Promise<void>;
  snapshot(session: string): Promise<PageSnapshot>;
  click(session: string, ref: number): Promise<void>;
  type(session: string, ref: number, text: string): Promise<void>;
  screenshot(session: string): Promise<Buffer>;
  close(session: string): Promise<void>;
}
