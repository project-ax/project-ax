// src/migrations/postgresql.ts — PostgreSQL-compatible migration definitions
//
// These migrations create the same logical schema as the SQLite migrations
// but use PostgreSQL syntax (SERIAL, NOW(), TIMESTAMPTZ, etc.).
// All tables are created in a single migration set since PostgreSQL
// supports CREATE IF NOT EXISTS and proper DDL transactions.

import { sql, type Kysely } from 'kysely';
import type { MigrationSet } from '../utils/migrator.js';

export const postgresqlMigrations: MigrationSet = {
  pg_001_messages: {
    async up(db: Kysely<any>) {
      await db.schema
        .createTable('messages')
        .ifNotExists()
        .addColumn('id', 'text', col => col.primaryKey())
        .addColumn('session_id', 'text', col => col.notNull())
        .addColumn('channel', 'text', col => col.notNull())
        .addColumn('sender', 'text', col => col.notNull())
        .addColumn('content', 'text', col => col.notNull())
        .addColumn('status', 'text', col => col.notNull().defaultTo('pending'))
        .addColumn('created_at', 'timestamptz', col => col.notNull().defaultTo(sql`NOW()`))
        .addColumn('processed_at', 'timestamptz')
        .execute();

      await db.schema
        .createIndex('idx_messages_status')
        .ifNotExists()
        .on('messages')
        .column('status')
        .execute();
    },
    async down(db: Kysely<any>) {
      await db.schema.dropTable('messages').ifExists().execute();
    },
  },

  pg_002_turns: {
    async up(db: Kysely<any>) {
      await sql`
        CREATE TABLE IF NOT EXISTS turns (
          id SERIAL PRIMARY KEY,
          session_id TEXT NOT NULL,
          role TEXT NOT NULL,
          sender TEXT,
          content TEXT NOT NULL,
          created_at BIGINT NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW())::BIGINT,
          is_summary INTEGER NOT NULL DEFAULT 0,
          summarized_up_to INTEGER
        )
      `.execute(db);

      await db.schema
        .createIndex('idx_turns_session')
        .ifNotExists()
        .on('turns')
        .columns(['session_id', 'id'])
        .execute();
    },
    async down(db: Kysely<any>) {
      await db.schema.dropTable('turns').ifExists().execute();
    },
  },

  pg_003_last_sessions: {
    async up(db: Kysely<any>) {
      await db.schema
        .createTable('last_sessions')
        .ifNotExists()
        .addColumn('agent_id', 'text', col => col.primaryKey())
        .addColumn('provider', 'text', col => col.notNull())
        .addColumn('scope', 'text', col => col.notNull())
        .addColumn('identifiers', 'text', col => col.notNull())
        .addColumn('updated_at', 'bigint', col => col.notNull())
        .execute();
    },
    async down(db: Kysely<any>) {
      await db.schema.dropTable('last_sessions').ifExists().execute();
    },
  },

  pg_004_documents: {
    async up(db: Kysely<any>) {
      await sql`
        CREATE TABLE IF NOT EXISTS documents (
          collection TEXT NOT NULL,
          key TEXT NOT NULL,
          content TEXT NOT NULL,
          data BYTEA,
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          PRIMARY KEY (collection, key)
        )
      `.execute(db);
    },
    async down(db: Kysely<any>) {
      await db.schema.dropTable('documents').ifExists().execute();
    },
  },
};
