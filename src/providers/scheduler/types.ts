// src/providers/scheduler/types.ts — Scheduler provider types
import type { InboundMessage } from '../channel/types.js';
import type { ProactiveHint } from '../memory/types.js';

export interface CronJobDef {
  id: string;
  schedule: string;
  agentId: string;
  prompt: string;
  maxTokenBudget?: number;
}

export interface SchedulerProvider {
  start(onMessage: (msg: InboundMessage) => void): Promise<void>;
  stop(): Promise<void>;
  addCron?(job: CronJobDef): void;
  removeCron?(jobId: string): void;
  listJobs?(): CronJobDef[];
  /** Manually trigger cron check at optional Date (for testing). */
  checkCronNow?(at?: Date): void;
  /** Record tokens used so budget tracking can suppress hints. */
  recordTokenUsage?(tokens: number): void;
  /** List hints that were queued (budget exceeded). */
  listPendingHints?(): ProactiveHint[];
}
