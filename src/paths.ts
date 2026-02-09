/**
 * Centralized path resolution for SureClaw.
 *
 * All config and data files live under ~/.sureclaw/ by default.
 * Override with SURECLAW_HOME env var (useful for tests).
 *
 * Layout:
 *   ~/.sureclaw/
 *     sureclaw.yaml     — main config
 *     .env              — API keys
 *     data/
 *       messages.db     — message queue
 *       conversations.db — conversation history
 *       memory.db       — SQLite memory provider
 *       memory/         — file memory provider
 *       audit.db        — SQLite audit provider
 *       audit/          — file audit provider
 *       credentials.enc — encrypted credentials
 */

import { join } from 'node:path';
import { homedir } from 'node:os';

/** Root directory for all SureClaw files. */
export function sureclawHome(): string {
  return process.env.SURECLAW_HOME || join(homedir(), '.sureclaw');
}

/** Path to sureclaw.yaml config file. */
export function configPath(): string {
  return join(sureclawHome(), 'sureclaw.yaml');
}

/** Path to .env file. */
export function envPath(): string {
  return join(sureclawHome(), '.env');
}

/** Path to the data subdirectory. */
export function dataDir(): string {
  return join(sureclawHome(), 'data');
}

/** Resolve a file path under the data directory. */
export function dataFile(...segments: string[]): string {
  return join(dataDir(), ...segments);
}
