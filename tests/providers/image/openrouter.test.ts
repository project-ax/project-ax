import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';

describe('OpenRouter image provider', () => {
  const ORIGINAL_ENV = process.env;

  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV, OPENROUTER_API_KEY: 'test-key' };
  });

  afterEach(() => {
    process.env = ORIGINAL_ENV;
    vi.restoreAllMocks();
  });

  test('throws when OPENROUTER_API_KEY is not set', async () => {
    delete process.env.OPENROUTER_API_KEY;
    const { create } = await import('../../../src/providers/image/openrouter.js');
    const provider = await create({} as any);

    await expect(provider.generate({ prompt: 'test', model: 'test' }))
      .rejects.toThrow('OPENROUTER_API_KEY');
  });

  test('sends chat completions request with modalities', async () => {
    // 1x1 transparent PNG as base64
    const pngBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==';

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{
          message: {
            content: 'A beautiful sunset',
            images: [{
              type: 'image_url',
              image_url: { url: `data:image/png;base64,${pngBase64}` },
            }],
          },
        }],
      }),
    });
    vi.stubGlobal('fetch', mockFetch);

    const { create } = await import('../../../src/providers/image/openrouter.js');
    const provider = await create({} as any);
    const result = await provider.generate({ prompt: 'sunset', model: 'google/gemini-2.5-flash-preview-image-generation' });

    // Verify request shape
    const [url, opts] = mockFetch.mock.calls[0];
    expect(url).toBe('https://openrouter.ai/api/v1/chat/completions');
    const body = JSON.parse(opts.body);
    expect(body.modalities).toEqual(['image', 'text']);
    expect(body.model).toBe('google/gemini-2.5-flash-preview-image-generation');
    expect(body.messages[0]).toEqual({ role: 'user', content: 'sunset' });

    // Verify response parsing
    expect(result.image).toBeInstanceOf(Buffer);
    expect(result.image.length).toBeGreaterThan(0);
    expect(result.mimeType).toBe('image/png');
    expect(result.text).toBe('A beautiful sunset');
    expect(result.model).toBe('google/gemini-2.5-flash-preview-image-generation');
  });

  test('throws on non-ok response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      text: async () => 'Bad request',
    }));

    const { create } = await import('../../../src/providers/image/openrouter.js');
    const provider = await create({} as any);

    await expect(provider.generate({ prompt: 'test', model: 'test' }))
      .rejects.toThrow('OpenRouter image generation failed (400)');
  });

  test('throws when response has no images', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: { content: 'text only' } }] }),
    }));

    const { create } = await import('../../../src/providers/image/openrouter.js');
    const provider = await create({} as any);

    await expect(provider.generate({ prompt: 'test', model: 'test' }))
      .rejects.toThrow('no image data');
  });

  test('uses custom base URL from env', async () => {
    process.env.OPENROUTER_BASE_URL = 'https://custom.example.com/v1';

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{
          message: {
            images: [{
              type: 'image_url',
              image_url: { url: 'data:image/png;base64,AAAA' },
            }],
          },
        }],
      }),
    });
    vi.stubGlobal('fetch', mockFetch);

    const { create } = await import('../../../src/providers/image/openrouter.js');
    const provider = await create({} as any);
    await provider.generate({ prompt: 'test', model: 'test' });

    expect(mockFetch.mock.calls[0][0]).toBe('https://custom.example.com/v1/chat/completions');
  });
});
