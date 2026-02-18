// src/agent/prompt/builder.ts
import type { PromptContext, PromptModule } from './types.js';
import { IdentityModule } from './modules/identity.js';
import { InjectionDefenseModule } from './modules/injection-defense.js';
import { SecurityModule } from './modules/security.js';
import { ContextModule } from './modules/context.js';
import { SkillsModule } from './modules/skills.js';
import { RuntimeModule } from './modules/runtime.js';

export interface PromptResult {
  content: string;
  metadata: PromptMetadata;
}

export interface PromptMetadata {
  moduleCount: number;
  modules: string[];
  estimatedTokens: number;
  buildTimeMs: number;
}

/**
 * Assembles system prompt from ordered modules.
 * Modules are registered at construction and filtered/rendered per-call.
 */
export class PromptBuilder {
  private readonly modules: PromptModule[];

  constructor() {
    this.modules = [
      new IdentityModule(),           // 0
      new InjectionDefenseModule(),   // 5
      new SecurityModule(),           // 10
      new ContextModule(),            // 60
      new SkillsModule(),             // 70
      new RuntimeModule(),            // 90
    ].sort((a, b) => a.priority - b.priority);
  }

  build(ctx: PromptContext): PromptResult {
    const start = Date.now();

    // Filter modules that should be included
    const active = this.modules.filter(m => m.shouldInclude(ctx));

    // Render each module
    const sections: string[] = [];
    for (const mod of active) {
      const lines = mod.render(ctx);
      if (lines.length > 0) {
        sections.push(lines.join('\n'));
      }
    }

    const content = sections.join('\n\n');
    const estimatedTokens = Math.ceil(content.length / 4);

    return {
      content,
      metadata: {
        moduleCount: active.length,
        modules: active.map(m => m.name),
        estimatedTokens,
        buildTimeMs: Date.now() - start,
      },
    };
  }
}
