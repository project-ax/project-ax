// src/agent/prompt/modules/skills.ts
import { BasePromptModule } from '../base-module.js';
import type { PromptContext } from '../types.js';

/**
 * Skills module: progressive disclosure of available skills.
 * Only compact summaries are injected; the agent calls `skill_read`
 * to load full instructions on demand.
 * Priority 70 — late in prompt, after context.
 */
export class SkillsModule extends BasePromptModule {
  readonly name = 'skills';
  readonly priority = 70;
  readonly optional = true;

  shouldInclude(ctx: PromptContext): boolean {
    return ctx.skills.length > 0;
  }

  render(ctx: PromptContext): string[] {
    const rows = ctx.skills
      .map(s => `| ${s.name} | ${s.description} |`)
      .join('\n');

    return [
      '## Available Skills',
      '',
      'Before replying, scan this list for a skill that matches the current task.',
      'If exactly one skill clearly applies: call `skill_read` to load its full',
      'instructions, then follow them. If multiple could apply: choose the most',
      'specific one, then read and follow it. If none clearly apply: do not load',
      'any skill — just respond normally.',
      '',
      'Never read more than one skill up front; only read after selecting.',
      '',
      '| Skill | Description |',
      '|-------|-------------|',
      rows,
      '',
      '### Creating Skills',
      '',
      'You can create new skills using `skill_propose`. Skills are markdown',
      'instruction files — like checklists, workflows, or domain-specific knowledge.',
      '',
      '**When to create a skill:**',
      '- You notice a recurring multi-step pattern in your work',
      '- The user asks you to remember a workflow for future sessions',
      '- You need domain-specific knowledge packaged for reuse',
      '',
      '**After creating a skill:** Continue working on your current task.',
      'The skill appears in your list on the next turn — do not pause or wait',
      'for confirmation.',
    ];
  }

  renderMinimal(ctx: PromptContext): string[] {
    return [
      '## Skills',
      `${ctx.skills.length} skills available. Use \`skill_read\` to load as needed.`,
    ];
  }
}
