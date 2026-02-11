import { tavily } from '@tavily/core';
import type { WebProvider, FetchRequest, FetchResponse, SearchResult } from './types.js';
import type { Config, TaintTag } from '../../types.js';

/**
 * Web provider using the official Tavily JS SDK.
 *
 * Requires TAVILY_API_KEY environment variable.
 * - fetch() uses Tavily Extract to pull page content from a URL.
 * - search() uses Tavily Search for web queries.
 * All results are taint-tagged as external content.
 */

const DEFAULT_MAX_RESULTS = 5;

function taintTag(source: string): TaintTag {
  return { source, trust: 'external', timestamp: new Date() };
}

function requireApiKey(): string {
  const apiKey = process.env.TAVILY_API_KEY;
  if (!apiKey) {
    throw new Error(
      'TAVILY_API_KEY environment variable is required.\n' +
      'Get an API key at https://tavily.com/',
    );
  }
  return apiKey;
}

export async function create(_config: Config): Promise<WebProvider> {
  return {
    async fetch(req: FetchRequest): Promise<FetchResponse> {
      const apiKey = requireApiKey();
      const client = tavily({ apiKey });
      const response = await client.extract([req.url], {
        extractDepth: 'basic',
        format: 'markdown',
      });

      if (response.failedResults?.length && !response.results?.length) {
        const err = response.failedResults[0];
        return {
          status: 500,
          headers: {},
          body: err.error || 'Extraction failed',
          taint: taintTag('web_fetch'),
        };
      }

      const result = response.results?.[0];
      return {
        status: 200,
        headers: { 'content-type': 'text/markdown' },
        body: result?.rawContent ?? '',
        taint: taintTag('web_fetch'),
      };
    },

    async search(query: string, maxResults?: number): Promise<SearchResult[]> {
      const apiKey = requireApiKey();
      const count = Math.min(maxResults ?? DEFAULT_MAX_RESULTS, 20);
      const client = tavily({ apiKey });
      const response = await client.search(query, {
        maxResults: count,
        searchDepth: 'basic',
      });

      const results = response.results ?? [];

      return results.slice(0, count).map((r): SearchResult => ({
        title: r.title,
        url: r.url,
        snippet: r.content,
        taint: taintTag('web_search'),
      }));
    },
  };
}
