// src/logger.ts
import { type Writable } from 'node:stream';
import { styleText } from 'node:util';
import { appendFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

// ═══════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════

export interface LogEvent {
  timestamp: string;
  event: string;
  status: string;
  details?: Record<string, unknown>;
}

export interface LoggerOptions {
  format?: 'json' | 'pretty';
  stream?: Writable;
}

export interface Logger {
  llm_call(model: string, inputTokens: number, outputTokens: number, status: string): void;
  tool_use(tool: string, command: string, status: string): void;
  scan_inbound(status: 'clean' | 'blocked', reason?: string): void;
  scan_outbound(status: 'clean' | 'blocked', taint?: number, reason?: string): void;
  agent_spawn(requestId: string, sandbox: string): void;
  agent_complete(requestId: string, durationSec: number, exitCode: number): void;
  info(message: string, details?: Record<string, unknown>): void;
  warn(message: string, details?: Record<string, unknown>): void;
  error(message: string, details?: Record<string, unknown>): void;
}

// ═══════════════════════════════════════════════════════
// Logger Factory
// ═══════════════════════════════════════════════════════

export function createLogger(opts: LoggerOptions = {}): Logger {
  const format = opts.format ?? 'pretty';
  const stream = opts.stream ?? process.stdout;

  function write(event: LogEvent): void {
    if (format === 'json') {
      stream.write(JSON.stringify(event) + '\n');
    } else {
      stream.write(formatPretty(event) + '\n');
    }
  }

  function timestamp(): string {
    return new Date().toISOString();
  }

  function timestampShort(): string {
    const now = new Date();
    return `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
  }

  function pad(n: number): string {
    return n.toString().padStart(2, '0');
  }

  function formatPretty(event: LogEvent): string {
    const time = timestampShort();
    const status = colorizeStatus(event.status);
    const details = formatDetails(event.details);

    return `${styleText('gray', time)} ${event.event} ${details} ${status}`;
  }

  function colorizeStatus(status: string): string {
    if (status === 'ok' || status === 'clean') {
      return styleText('green', status);
    }
    if (status === 'blocked' || status === 'error') {
      return styleText('red', status);
    }
    if (status === 'warn') {
      return styleText('yellow', status);
    }
    return status;
  }

  function formatDetails(details?: Record<string, unknown>): string {
    if (!details) return '';

    const parts: string[] = [];

    if (details.model) parts.push(`${details.model}`);
    if (details.tool) parts.push(`${details.tool}`);
    if (details.command) parts.push(`"${details.command}"`);
    if (details.reason) parts.push(`${details.reason}`);
    if (details.taint !== undefined) parts.push(`taint:${details.taint}`);
    if (details.input_tokens) parts.push(`${details.input_tokens} in`);
    if (details.output_tokens) parts.push(`${details.output_tokens} out`);
    if (details.sandbox) parts.push(`${details.sandbox}`);
    if (details.duration_sec) parts.push(`${details.duration_sec}s`);
    if (details.message) parts.push(`${details.message}`);

    return parts.join(' ');
  }

  return {
    llm_call(model: string, inputTokens: number, outputTokens: number, status: string): void {
      write({
        timestamp: timestamp(),
        event: 'llm_call',
        status,
        details: {
          model,
          input_tokens: inputTokens,
          output_tokens: outputTokens,
        },
      });
    },

    tool_use(tool: string, command: string, status: string): void {
      write({
        timestamp: timestamp(),
        event: 'tool_use',
        status,
        details: { tool, command },
      });
    },

    scan_inbound(status: 'clean' | 'blocked', reason?: string): void {
      write({
        timestamp: timestamp(),
        event: 'scan_inbound',
        status,
        details: reason ? { reason } : undefined,
      });
    },

    scan_outbound(status: 'clean' | 'blocked', taint?: number, reason?: string): void {
      write({
        timestamp: timestamp(),
        event: 'scan_outbound',
        status,
        details: {
          ...(taint !== undefined && { taint }),
          ...(reason && { reason }),
        },
      });
    },

    agent_spawn(requestId: string, sandbox: string): void {
      write({
        timestamp: timestamp(),
        event: 'agent_spawn',
        status: 'spawning',
        details: { request_id: requestId, sandbox },
      });
    },

    agent_complete(requestId: string, durationSec: number, exitCode: number): void {
      write({
        timestamp: timestamp(),
        event: 'agent_complete',
        status: exitCode === 0 ? 'ok' : 'error',
        details: {
          request_id: requestId,
          duration_sec: durationSec,
          exit_code: exitCode,
        },
      });
    },

    info(message: string, details?: Record<string, unknown>): void {
      write({
        timestamp: timestamp(),
        event: 'info',
        status: 'info',
        details: { message, ...details },
      });
    },

    warn(message: string, details?: Record<string, unknown>): void {
      write({
        timestamp: timestamp(),
        event: 'warn',
        status: 'warn',
        details: { message, ...details },
      });
    },

    error(message: string, details?: Record<string, unknown>): void {
      write({
        timestamp: timestamp(),
        event: 'error',
        status: 'error',
        details: { message, ...details },
      });
    },
  };
}

// ═══════════════════════════════════════════════════════
// File-based Debug Logger
// ═══════════════════════════════════════════════════════
//
// Writes JSONL entries to ~/.ax/data/debug.log (or $AX_HOME/data/debug.log).
// Each line is a self-contained JSON object with timestamp, source, event, and details.
// Designed to NEVER crash the application — all errors are silently swallowed.

let resolvedLogPath: string | null = null;

function getLogPath(): string {
  if (!resolvedLogPath) {
    const home = process.env.AX_HOME || join(homedir(), '.ax');
    const dir = join(home, 'data');
    try { mkdirSync(dir, { recursive: true }); } catch { /* best-effort */ }
    resolvedLogPath = join(dir, 'ax.log');
  }
  return resolvedLogPath;
}

/**
 * Append a debug log entry to the debug log file. Safe to call from any context — never throws.
 *
 * @param source  Component identifier (e.g. 'host:ipc', 'container:ipc-client')
 * @param event   Event name (e.g. 'call_start', 'validation_failed')
 * @param details Optional key-value details to include in the log entry
 */
export function debug(source: string, event: string, details?: Record<string, unknown>): void {
  try {
    const entry: Record<string, unknown> = {
      ts: new Date().toISOString(),
      pid: process.pid,
      src: source,
      event,
    };
    if (details) {
      for (const [k, v] of Object.entries(details)) {
        entry[k] = v;
      }
    }
    appendFileSync(getLogPath(), JSON.stringify(entry) + '\n');
  } catch {
    // Debug logging must never crash the application
  }
}

/**
 * Truncate a string for logging (avoids massive payloads in debug log).
 */
export function truncate(s: string, maxLen = 500): string {
  return s.length > maxLen ? s.slice(0, maxLen) + `...[${s.length} total]` : s;
}
