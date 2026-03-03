// src/agent/prompt/modules/skills.ts
import { BasePromptModule } from '../base-module.js';
import type { PromptContext } from '../types.js';

/**
 * Skills module: progressive disclosure of available skills.
 * Only compact summaries are injected; the agent calls `skill({ type: "read" })`
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
      .map(s => {
        const warn = s.warnings?.length ? ` \u26A0 ${s.warnings.join(', ')}` : '';
        return `| ${s.name} | ${s.description}${warn} |`;
      })
      .join('\n');

    // Collect skills with missing deps for install guidance
    const skillsWithWarnings = ctx.skills.filter(s => s.warnings?.length);

    const lines = [
      '## Available Skills',
      '',
      'Before replying, scan this list for a skill that matches the current task.',
      'If exactly one skill clearly applies: call `skill({ type: "read" })` to load its full',
      'instructions, then follow them. If multiple could apply: choose the most',
      'specific one, then read and follow it. If none clearly apply: do not load',
      'any skill \u2014 just respond normally.',
      '',
      'Never read more than one skill up front; only read after selecting.',
      '',
      '| Skill | Description |',
      '|-------|-------------|',
      rows,
    ];

    // Surface install guidance when skills have missing dependencies
    if (skillsWithWarnings.length > 0) {
      lines.push(
        '',
        '### Missing Dependencies',
        '',
        'Some skills have missing binary dependencies (marked with \u26A0 above).',
        'Use `skill({ type: "install", name: "<skill>", phase: "inspect" })` to check',
        'what needs to be installed, then present the install steps to the user for approval.',
      );
    }

    lines.push(
      '',
      '### Creating Skills',
      '',
      'You can create new skills using `skill({ type: "propose" })`. Skills are markdown',
      'instruction files \u2014 like checklists, workflows, or domain-specific knowledge.',
      '',
      '**When to create a skill:**',
      '- You notice a recurring multi-step pattern in your work',
      '- The user asks you to remember a workflow for future sessions',
      '- You need domain-specific knowledge packaged for reuse',
      '',
      '**After creating a skill:** Continue working on your current task.',
      'The skill appears in your list on the next turn \u2014 do not pause or wait',
      'for confirmation.',
    );

    return lines;
  }

  renderMinimal(ctx: PromptContext): string[] {
    return [
      '## Skills',
      `${ctx.skills.length} skills available. Use \`skill({ type: "read" })\` to load as needed.`,
    ];
  }
}
