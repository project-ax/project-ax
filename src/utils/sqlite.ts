// src/utils/sqlite.ts — Runtime-agnostic SQLite adapter
// Priority: bun:sqlite → node:sqlite → better-sqlite3

import { createRequire } from 'node:module';

export interface SQLiteStatement {
  run(...params: unknown[]): void;
  get(...params: unknown[]): unknown;
  all(...params: unknown[]): unknown[];
}

export interface SQLiteDatabase {
  exec(sql: string): void;
  prepare(sql: string): SQLiteStatement;
  close(): void;
}

const isBun = typeof (globalThis as Record<string, unknown>).Bun !== 'undefined';

export function openDatabase(path: string): SQLiteDatabase {
  const req = createRequire(import.meta.url);

  if (isBun) {
    const { Database } = req('bun:sqlite');
    const db = new Database(path);
    db.exec('PRAGMA journal_mode = WAL');
    db.exec('PRAGMA foreign_keys = ON');
    return db;
  }

  // Node.js: prefer built-in node:sqlite (22.5+), fall back to better-sqlite3
  try {
    const { DatabaseSync } = req('node:sqlite');
    const db = new DatabaseSync(path);
    db.exec('PRAGMA journal_mode = WAL');
    db.exec('PRAGMA foreign_keys = ON');
    return db;
  } catch {
    try {
      const BetterSqlite3 = req('better-sqlite3');
      const db = new BetterSqlite3(path);
      db.pragma('journal_mode = WAL');
      db.pragma('foreign_keys = ON');
      return db;
    } catch (err) {
      throw new Error(
        `Failed to load SQLite. Use Node.js 22.5+ (has built-in sqlite) ` +
        `or run 'npm rebuild better-sqlite3'.\nCause: ${err}`,
      );
    }
  }
}
