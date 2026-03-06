// src/migrations/jobs.ts — migration definitions for the jobs store
import { sql, type Kysely } from 'kysely';
import type { MigrationSet } from '../utils/migrator.js';

/**
 * Build jobs migrations for the given database dialect.
 * SQLite uses unixepoch(), PostgreSQL uses extract(epoch from now()).
 */
export function buildJobsMigrations(dbType: 'sqlite' | 'postgresql'): MigrationSet {
  const nowEpoch = dbType === 'postgresql'
    ? sql`(EXTRACT(EPOCH FROM NOW())::integer)`
    : sql`(unixepoch())`;

  return {
    jobs_001_initial: {
      async up(db: Kysely<any>) {
        await db.schema
          .createTable('cron_jobs')
          .ifNotExists()
          .addColumn('id', 'text', col => col.primaryKey())
          .addColumn('agent_id', 'text', col => col.notNull())
          .addColumn('schedule', 'text', col => col.notNull())
          .addColumn('prompt', 'text', col => col.notNull())
          .addColumn('max_token_budget', 'integer')
          .addColumn('delivery', 'text')
          .addColumn('run_once', 'integer', col =>
            col.notNull().defaultTo(0),
          )
          .addColumn('run_at', 'text')
          .addColumn('created_at', 'integer', col =>
            col.notNull().defaultTo(nowEpoch),
          )
          .execute();

        await db.schema
          .createIndex('idx_cron_jobs_agent')
          .ifNotExists()
          .on('cron_jobs')
          .column('agent_id')
          .execute();
      },
      async down(db: Kysely<any>) {
        await db.schema.dropTable('cron_jobs').execute();
      },
    },
  };
}

/** Default SQLite migrations — backward compatible with existing callers. */
export const jobsMigrations: MigrationSet = buildJobsMigrations('sqlite');
