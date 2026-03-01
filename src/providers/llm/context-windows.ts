// src/providers/llm/pricing.ts — Model context window sizes.

// ───────────────────────────────────────────────────────
// Context window sizes (tokens)
// ───────────────────────────────────────────────────────

const CONTEXT_WINDOWS: [prefix: string, tokens: number][] = [
  ['claude-opus-4',      200_000],
  ['claude-sonnet-4',    200_000],
  ['claude-haiku-3-5',   200_000],
  ['claude-haiku-3',     200_000],
  ['claude-3-5-sonnet',  200_000],
  ['claude-3-opus',      200_000],
  ['gpt-4o-mini',        128_000],
  ['gpt-4o',             128_000],
  ['gpt-4-turbo',        128_000],
  ['gpt-4',              8_192],
  ['gpt-3.5-turbo',      16_385],
  ['o1-mini',            128_000],
  ['o1',                 200_000],
  ['o3-mini',            200_000],
];

/** Default context window when model is unknown. */
const DEFAULT_CONTEXT_WINDOW = 200_000;

/** Look up context window size for a model ID. Matches by prefix. */
export function getContextWindow(modelId: string): number {
  for (const [prefix, tokens] of CONTEXT_WINDOWS) {
    if (modelId.startsWith(prefix)) return tokens;
  }
  return DEFAULT_CONTEXT_WINDOW;
}
