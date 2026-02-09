import { describe, test, expect, vi, afterEach, beforeEach } from 'vitest';
import type { Config } from '../../src/providers/types.js';

const config = {
  profile: 'balanced',
  providers: { web: 'tavily' },
} as unknown as Config;

// Mock the Tavily SDK
const mockSearch = vi.fn();
const mockExtract = vi.fn();
vi.mock('@tavily/core', () => ({
  tavily: vi.fn(() => ({ search: mockSearch, extract: mockExtract })),
}));

describe('web-tavily', () => {
  const originalApiKey = process.env.TAVILY_API_KEY;

  beforeEach(() => {
    vi.resetModules();
    mockSearch.mockReset();
    mockExtract.mockReset();
  });

  afterEach(() => {
    if (originalApiKey !== undefined) {
      process.env.TAVILY_API_KEY = originalApiKey;
    } else {
      delete process.env.TAVILY_API_KEY;
    }
  });

  test('search throws without TAVILY_API_KEY', async () => {
    delete process.env.TAVILY_API_KEY;
    const { create } = await import('../../src/providers/web/tavily.js');
    const provider = await create(config);

    await expect(provider.search('test query')).rejects.toThrow('TAVILY_API_KEY');
  });

  test('fetch throws without TAVILY_API_KEY', async () => {
    delete process.env.TAVILY_API_KEY;
    const { create } = await import('../../src/providers/web/tavily.js');
    const provider = await create(config);

    await expect(provider.fetch({ url: 'https://example.com' })).rejects.toThrow('TAVILY_API_KEY');
  });

  test('search() returns taint-tagged results', async () => {
    process.env.TAVILY_API_KEY = 'tvly-test-key';

    mockSearch.mockResolvedValue({
      results: [
        { title: 'First Result', url: 'https://example.com/1', content: 'Desc 1', score: 0.95 },
        { title: 'Second Result', url: 'https://example.com/2', content: 'Desc 2', score: 0.85 },
      ],
    });

    const { create } = await import('../../src/providers/web/tavily.js');
    const provider = await create(config);
    const results = await provider.search('test query');

    expect(results.length).toBe(2);
    expect(results[0].title).toBe('First Result');
    expect(results[0].url).toBe('https://example.com/1');
    expect(results[0].snippet).toBe('Desc 1');
    expect(results[0].taint.source).toBe('web_search');
    expect(results[0].taint.trust).toBe('external');
  });

  test('search passes correct options to SDK', async () => {
    process.env.TAVILY_API_KEY = 'tvly-test-key';

    mockSearch.mockResolvedValue({ results: [] });

    const { create } = await import('../../src/providers/web/tavily.js');
    const provider = await create(config);
    await provider.search('test query', 3);

    expect(mockSearch).toHaveBeenCalledWith('test query', {
      maxResults: 3,
      searchDepth: 'basic',
    });
  });

  test('search handles empty results', async () => {
    process.env.TAVILY_API_KEY = 'tvly-test-key';

    mockSearch.mockResolvedValue({ results: [] });

    const { create } = await import('../../src/providers/web/tavily.js');
    const provider = await create(config);
    const results = await provider.search('nonexistent query');

    expect(results).toEqual([]);
  });

  test('search handles API errors', async () => {
    process.env.TAVILY_API_KEY = 'tvly-test-key';

    mockSearch.mockRejectedValue(new Error('Rate limited: 429'));

    const { create } = await import('../../src/providers/web/tavily.js');
    const provider = await create(config);

    await expect(provider.search('test')).rejects.toThrow('429');
  });

  test('maxResults is capped at 20', async () => {
    process.env.TAVILY_API_KEY = 'tvly-test-key';

    mockSearch.mockResolvedValue({ results: [] });

    const { create } = await import('../../src/providers/web/tavily.js');
    const provider = await create(config);
    await provider.search('test query', 100);

    expect(mockSearch).toHaveBeenCalledWith('test query', {
      maxResults: 20,
      searchDepth: 'basic',
    });
  });

  test('fetch() extracts page content via Tavily Extract', async () => {
    process.env.TAVILY_API_KEY = 'tvly-test-key';

    mockExtract.mockResolvedValue({
      results: [{ url: 'https://example.com', rawContent: '# Hello World\nPage content here.' }],
      failedResults: [],
    });

    const { create } = await import('../../src/providers/web/tavily.js');
    const provider = await create(config);
    const resp = await provider.fetch({ url: 'https://example.com' });

    expect(mockExtract).toHaveBeenCalledWith(['https://example.com'], {
      extractDepth: 'basic',
      format: 'markdown',
    });
    expect(resp.status).toBe(200);
    expect(resp.body).toBe('# Hello World\nPage content here.');
    expect(resp.headers['content-type']).toBe('text/markdown');
    expect(resp.taint.source).toBe('web_fetch');
    expect(resp.taint.trust).toBe('external');
  });

  test('fetch() returns error response on extraction failure', async () => {
    process.env.TAVILY_API_KEY = 'tvly-test-key';

    mockExtract.mockResolvedValue({
      results: [],
      failedResults: [{ url: 'https://example.com', error: 'Page not found' }],
    });

    const { create } = await import('../../src/providers/web/tavily.js');
    const provider = await create(config);
    const resp = await provider.fetch({ url: 'https://example.com' });

    expect(resp.status).toBe(500);
    expect(resp.body).toBe('Page not found');
  });
});
