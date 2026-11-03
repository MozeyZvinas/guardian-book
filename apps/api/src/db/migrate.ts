import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import type { Logger } from '../logger.js'
import { createDb } from './client.js'

/** `apps/api/drizzle`, from both `src/db` (tsx) and `dist/db` (node). */
export const MIGRATIONS_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../drizzle')

/**
 * Applies pending migrations (additive only, spec 03 §2). Idempotent: Drizzle records what
 * ran in `__drizzle_migrations`. Used by `pnpm db:migrate`, by the integration tests on a
 * fresh database, and at API boot when a database is configured.
 */
export async function runMigrations(connectionString: string, logger?: Logger): Promise<void> {
  const handle = createDb(connectionString, 1)
  try {
    await migrate(handle.db, { migrationsFolder: MIGRATIONS_DIR })
    logger?.info('migrations applied', { dir: MIGRATIONS_DIR })
  } finally {
    await handle.close()
  }
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isMain) {
  const url = process.env['DATABASE_URL']
  if (!url) {
    console.error('db:migrate: DATABASE_URL is not set. Nothing to do.')
    process.exit(2)
  }
  runMigrations(url)
    .then(() => {
      console.log('db:migrate: up to date')
    })
    .catch((err: unknown) => {
      console.error('db:migrate failed:', err instanceof Error ? err.message : err)
      process.exit(1)
    })
}
