/**
 * Centralized path resolution for AX.
 *
 * All config and data files live under ~/.ax/ by default.
 * Override with AX_HOME env var (useful for tests).
 *
 * Layout:
 *   ~/.ax/
 *     ax.yaml     — main config
 *     .env              — API keys
 *     data/
 *       messages.db     — message queue
 *       conversations.db — conversation history
 *       memory.db       — SQLite memory provider
 *       memory/         — file memory provider
 *       audit.db        — SQLite audit provider
 *       audit/          — file audit provider
 *       credentials.enc — encrypted credentials
 *       workspaces/     — persistent agent workspaces (keyed by session UUID)
 *     agents/
 *       assistant/          — all agent files (AGENTS.md, BOOTSTRAP.md, capabilities.yaml, SOUL.md, IDENTITY.md)
 *         users/
 *           <userId>/       — per-user state (USER.md)
 */

import { join } from 'node:path';
import { homedir } from 'node:os';

/** Root directory for all AX files. */
export function axHome(): string {
  return process.env.AX_HOME || join(homedir(), '.ax');
}

/** Path to ax.yaml config file. */
export function configPath(): string {
  return join(axHome(), 'ax.yaml');
}

/** Path to .env file. */
export function envPath(): string {
  return join(axHome(), '.env');
}

/** Path to the data subdirectory. */
export function dataDir(): string {
  return join(axHome(), 'data');
}

/** Resolve a file path under the data directory. */
export function dataFile(...segments: string[]): string {
  return join(dataDir(), ...segments);
}

/** UUID format regex (same as ipc-schemas.ts line 24). */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** Validate that a string is a valid lowercase UUID (prevents path traversal). */
export function isValidSessionId(id: string): boolean {
  return UUID_RE.test(id);
}

/** Path to a persistent agent workspace directory for a given session. */
export function workspaceDir(sessionId: string): string {
  return join(dataDir(), 'workspaces', sessionId);
}

const SAFE_NAME_RE = /^[a-zA-Z0-9_-]+$/;

function validatePathSegment(value: string, label: string): void {
  if (!value || !SAFE_NAME_RE.test(value)) {
    throw new Error(`Invalid ${label}: must be alphanumeric/dash/underscore, got "${value}"`);
  }
}

/** Path to an agent's directory: ~/.ax/agents/<name>/ */
export function agentDir(agentName: string): string {
  validatePathSegment(agentName, 'agent name');
  return join(axHome(), 'agents', agentName);
}

/** @deprecated Use agentDir instead. */
export const agentStateDir = agentDir;

/** Path to a per-user directory within an agent's state: ~/.ax/agents/<name>/users/<userId>/ */
export function agentUserDir(agentName: string, userId: string): string {
  validatePathSegment(agentName, 'agent name');
  validatePathSegment(userId, 'userId');
  return join(agentDir(agentName), 'users', userId);
}
