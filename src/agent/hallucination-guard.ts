/**
 * Hallucination guard for scheduler tool calls.
 *
 * Detects when a model claims to have scheduled something but didn't
 * actually use any scheduler tool. This happens with some third-party
 * LLM providers (e.g., groq with kimi-k2) that return text claiming
 * actions were taken without emitting any tool_use chunks.
 */

/** Conservative regex patterns matching affirmative scheduling claims. */
const SCHEDULING_PATTERNS = [
  /scheduled?\s+a\s+(task|job|reminder)/i,
  /set\s+up\s+a\s+(reminder|schedule)/i,
  /job\s+id:\s*[0-9a-f-]{8,}/i,
  /\bscheduler_run_at\b/i,
  /\bscheduler_add_cron\b/i,
];

const SCHEDULER_TOOL_NAMES = new Set([
  'scheduler_run_at',
  'scheduler_add_cron',
  'scheduler_remove_cron',
  'scheduler_list_jobs',
]);

/**
 * Returns true if the assistant text claims scheduling happened but no
 * scheduler tool was actually called — i.e., the model hallucinated the
 * tool use.
 */
export function detectSchedulerHallucination(
  text: string,
  toolCallNames: string[],
): boolean {
  // If any scheduler tool was actually called, not a hallucination
  if (toolCallNames.some(name => SCHEDULER_TOOL_NAMES.has(name))) {
    return false;
  }

  // Check if text contains scheduling claims
  return SCHEDULING_PATTERNS.some(pattern => pattern.test(text));
}

/** Corrective prompt injected when hallucination is detected. */
export const CORRECTIVE_PROMPT =
  'You just claimed to have scheduled a task, but you did NOT actually call any scheduler tool. ' +
  'Your text response is not the same as executing a tool. ' +
  'You MUST use the scheduler_run_at or scheduler_add_cron tool to schedule tasks. ' +
  'Please try again and call the actual tool this time.';
