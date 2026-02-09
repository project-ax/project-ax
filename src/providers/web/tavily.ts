import type { WebProvider, FetchRequest, FetchResponse, SearchResult, TaintTag, Config } from '../types.js';

/**
 * Web search provider using Tavily Search API.
 *
 * Requires TAVILY_API_KEY environment variable.
 * Falls back to the base fetch provider for regular HTTP requests.
 * All search results are taint-tagged as external content.
 */

const TAVILY_API_URL = 'https://api.tavily.com/search';
const DEFAULT_MAX_RESULTS = 5;
const SEARCH_TIMEOUT_MS = 10_000;

function taintTag(): TaintTag {
  return { source: 'web_search', trust: 'external', timestamp: new Date() };
}

interface TavilySearchResult {
  title: string;
  url: string;
  content: string;
  score: number;
}

interface TavilySearchResponse {
  results: TavilySearchResult[];
}

export async function create(config: Config): Promise<WebProvider> {
  const apiKey = process.env.TAVILY_API_KEY;

  // Lazy-load the fetch provider for regular HTTP requests
  const { create: createFetch } = await import('./fetch.js');
  const fetchProvider = await createFetch(config);

  return {
    async fetch(req: FetchRequest): Promise<FetchResponse> {
      return fetchProvider.fetch(req);
    },

    async search(query: string, maxResults?: number): Promise<SearchResult[]> {
      if (!apiKey) {
        throw new Error(
          'Web search requires TAVILY_API_KEY environment variable.\n' +
          'Get an API key at https://tavily.com/',
        );
      }

      const count = Math.min(maxResults ?? DEFAULT_MAX_RESULTS, 20);

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), SEARCH_TIMEOUT_MS);

      try {
        const resp = await globalThis.fetch(TAVILY_API_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            query,
            max_results: count,
            search_depth: 'basic',
          }),
          signal: controller.signal,
        });

        if (!resp.ok) {
          throw new Error(`Tavily Search API returned ${resp.status}: ${resp.statusText}`);
        }

        const data: TavilySearchResponse = await resp.json();
        const results = data.results ?? [];

        return results.slice(0, count).map((r): SearchResult => ({
          title: r.title,
          url: r.url,
          snippet: r.content,
          taint: taintTag(),
        }));
      } catch (err: unknown) {
        if (err instanceof DOMException && err.name === 'AbortError') {
          throw new Error(`Search timeout after ${SEARCH_TIMEOUT_MS}ms`);
        }
        throw err;
      } finally {
        clearTimeout(timer);
      }
    },
  };
}
