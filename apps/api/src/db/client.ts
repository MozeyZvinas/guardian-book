import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres'
import pg from 'pg'
import * as schema from './schema.js'

export type Db = NodePgDatabase<typeof schema>
/** A transaction handle; the same query API as `Db`. */
export type Tx = Parameters<Parameters<Db['transaction']>[0]>[0]
/** Either; services take this so they work inside or outside a transaction. */
export type DbOrTx = Db | Tx

export interface DbHandle {
  db: Db
  pool: pg.Pool
  close(): Promise<void>
}

/**
 * One pool per process. Never created at module scope: the app boots with zero env and
 * only opens a pool when `DATABASE_URL` is configured.
 */
export function createDb(connectionString: string, max = 10): DbHandle {
  const pool = new pg.Pool({ connectionString, max, connectionTimeoutMillis: 5000 })
  const db = drizzle({ client: pool, schema })
  return {
    db,
    pool,
    close: () => pool.end(),
  }
}

export { schema }
