/**
 * Shared sandbox utilities — common patterns across all sandbox providers.
 */

import { execFileSync, type ChildProcess } from 'node:child_process';
import type { SandboxProcess } from './types.js';

/** Create a promise that resolves with the child's exit code. */
export function exitCodePromise(child: ChildProcess): Promise<number> {
  return new Promise<number>((resolve, reject) => {
    child.on('exit', (code) => resolve(code ?? 1));
    child.on('error', reject);
  });
}

/** Kill the child after timeoutSec (+ optional grace period). No-op if undefined. */
export function enforceTimeout(child: ChildProcess, timeoutSec?: number, graceSec = 0): void {
  if (!timeoutSec) return;
  setTimeout(() => {
    if (!child.killed) {
      child.kill('SIGKILL');
    }
  }, (timeoutSec + graceSec) * 1000);
}

/** Send SIGKILL to a pid, swallowing errors for already-exited processes. */
export async function killProcess(pid: number): Promise<void> {
  try {
    process.kill(pid, 'SIGKILL');
  } catch {
    // Process already exited
  }
}

/** Check if a command is available on the system. */
export async function checkCommand(cmd: string, args: string[] = ['--version']): Promise<boolean> {
  try {
    execFileSync(cmd, args, { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

/** Wrap a ChildProcess into a SandboxProcess. */
export function sandboxProcess(child: ChildProcess, exitCode: Promise<number>): SandboxProcess {
  return {
    pid: child.pid!,
    exitCode,
    stdout: child.stdout!,
    stderr: child.stderr!,
    stdin: child.stdin!,
    kill() { child.kill(); },
  };
}
