/**
 * Cross-platform safe binary lookup.
 *
 * Resolves the `bin` field from SkillInstallStep.
 * Uses `command -v` on POSIX (via /bin/sh since it's a builtin) and `where` on Windows.
 *
 * SECURITY: Input is validated against a strict regex to reject paths,
 * shell operators, and metacharacters before any subprocess is spawned.
 * The regex ensures only [a-zA-Z0-9_.-] characters pass, making the
 * shell invocation safe from injection.
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

/** Only simple binary names: alphanumeric, underscore, dot, hyphen. No paths, no shell metacharacters. */
const BIN_NAME_RE = /^[a-zA-Z0-9_.-]+$/;

/**
 * Check if a binary exists in the system PATH.
 *
 * @param name - Binary name to look up (e.g. "gog", "npm", "python3")
 * @returns true if the binary is found in PATH, false otherwise
 */
export async function binExists(name: string): Promise<boolean> {
  // Reject anything that isn't a simple binary name
  if (!BIN_NAME_RE.test(name)) return false;

  try {
    if (process.platform === 'win32') {
      await execFileAsync('where', [name], { timeout: 5000 });
    } else {
      // `command -v` is a shell builtin — must invoke via /bin/sh.
      // Safe because `name` is regex-validated (no metacharacters).
      await execFileAsync('/bin/sh', ['-c', `command -v ${name}`], { timeout: 5000 });
    }
    return true;
  } catch {
    return false;
  }
}

/** Exported for testing — the regex used to validate binary names. */
export const BIN_NAME_REGEX = BIN_NAME_RE;
