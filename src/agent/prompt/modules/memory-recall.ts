// src/agent/prompt/modules/memory-recall.ts
import { BasePromptModule } from '../base-module.js';
import { isBootstrapMode } from '../types.js';
import type { PromptContext } from '../types.js';

/**
 * Memory recall module: teaches the agent to search persistent memory
 * before answering about prior work. Adapted from OpenClaw's memory system.
 * Priority 60 — after security, before skills.
 * Optional — excluded in bootstrap mode.
 */
export class MemoryRecallModule extends BasePromptModule {
  readonly name = 'memory-recall';
  readonly priority = 60;
  readonly optional = true;

  shouldInclude(ctx: PromptContext): boolean {
    if (isBootstrapMode(ctx)) return false;
    return true;
  }

  render(_ctx: PromptContext): string[] {
    return [
      '## Memory',
      '',
      'You have persistent memory across sessions. Before answering anything about',
      'prior work, decisions, dates, people, preferences, or past conversations:',
      'search your memory first.',
      '',
      '**How to use memory:**',
      '- Call `memory({ type: "query", ... })` with a relevant scope and query to search past entries',
      '- Call `memory({ type: "read", ... })` to read a specific entry by ID',
      '- Call `memory({ type: "write", ... })` to store important facts, decisions, or user preferences',
      '',
      '**When to search memory:**',
      '- The user asks "did we..." or "what was..." or "remember when..."',
      '- You need context from a previous session',
      '- You are unsure about a user preference you may have stored before',
      '',
      '**When to write memory:**',
      '- After completing a significant task (store outcome and key decisions)',
      '- When the user shares a preference or workflow you should remember',
      '- When you learn something about the project that will be useful later',
      '',
      'Memory is limited — if you want to remember something, write it.',
      '"Mental notes" don\'t survive session restarts. Files do.',
      '',
      'Keep memory entries concise and factual. Tag them for easier retrieval.',
    ];
  }

  renderMinimal(_ctx: PromptContext): string[] {
    return [
      '## Memory',
      'Search memory (`memory({ type: "query" })`) before answering about prior work or preferences.',
      'Write important facts via `memory({ type: "write" })`. Mental notes don\'t survive restarts.',
    ];
  }
}
