import { openDatabase } from './utils/sqlite.js';
import type { SQLiteDatabase } from './utils/sqlite.js';
import { dataFile } from './paths.js';
import type { SessionAddress, SessionScope } from './providers/channel/types.js';

export class SessionStore {
  private db: SQLiteDatabase;

  constructor(dbPath: string = dataFile('sessions.db')) {
    this.db = openDatabase(dbPath);
    this.migrate();
  }

  private migrate(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS last_sessions (
        agent_id    TEXT NOT NULL,
        provider    TEXT NOT NULL,
        scope       TEXT NOT NULL,
        identifiers TEXT NOT NULL,
        updated_at  INTEGER NOT NULL,
        PRIMARY KEY (agent_id)
      )
    `);
  }

  /** Record the most recent channel interaction for an agent. */
  trackSession(agentId: string, session: SessionAddress): void {
    this.db.prepare(
      `INSERT OR REPLACE INTO last_sessions (agent_id, provider, scope, identifiers, updated_at)
       VALUES (?, ?, ?, ?, ?)`
    ).run(
      agentId,
      session.provider,
      session.scope,
      JSON.stringify(session.identifiers),
      Date.now(),
    );
  }

  /** Get the last channel session for an agent, or undefined if none. */
  getLastChannelSession(agentId: string): SessionAddress | undefined {
    const row = this.db.prepare(
      'SELECT provider, scope, identifiers FROM last_sessions WHERE agent_id = ?'
    ).get(agentId) as { provider: string; scope: string; identifiers: string } | undefined;
    if (!row) return undefined;
    return {
      provider: row.provider,
      scope: row.scope as SessionScope,
      identifiers: JSON.parse(row.identifiers),
    };
  }

  close(): void {
    this.db.close();
  }
}
