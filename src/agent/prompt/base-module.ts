// src/agent/prompt/base-module.ts
import type { PromptContext, PromptModule } from './types.js';

/**
 * Base implementation of PromptModule with default token estimation.
 */
export abstract class BasePromptModule implements PromptModule {
  abstract readonly name: string;
  abstract readonly priority: number;

  abstract shouldInclude(ctx: PromptContext): boolean;
  abstract render(ctx: PromptContext): string[];

  /** Rough estimate: 1 token ~ 4 characters */
  estimateTokens(ctx: PromptContext): number {
    return Math.ceil(this.render(ctx).join('\n').length / 4);
  }
}
