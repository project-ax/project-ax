// src/providers/web/types.ts — Web provider types
import type { TaintTag } from '../../types.js';

export interface FetchRequest {
  url: string;
  method?: 'GET' | 'HEAD';
  headers?: Record<string, string>;
  timeoutMs?: number;
}

export interface FetchResponse {
  status: number;
  headers: Record<string, string>;
  body: string;
  taint: TaintTag;
}

export interface SearchResult {
  title: string;
  url: string;
  snippet: string;
  taint: TaintTag;
}

export interface WebProvider {
  fetch(req: FetchRequest): Promise<FetchResponse>;
  search(query: string, maxResults?: number): Promise<SearchResult[]>;
}
