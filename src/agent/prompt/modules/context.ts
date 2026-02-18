// src/agent/prompt/modules/context.ts
import { BasePromptModule } from '../base-module.js';
import type { PromptContext } from '../types.js';

/**
 * Context module: injects CONTEXT.md workspace context.
 * Priority 60 — after security, before runtime.
 * Optional — can be dropped if token budget is tight.
 */
export class ContextModule extends BasePromptModule {
  readonly name = 'context';
  readonly priority = 60;
  readonly optional = true;

  shouldInclude(ctx: PromptContext): boolean {
    return ctx.contextContent.length > 0;
  }

  render(ctx: PromptContext): string[] {
    return ['## Context', '', ctx.contextContent];
  }
}
