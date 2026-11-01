import pg from 'pg'

export type DbStatus = 'up' | 'down'

/**
 * `select 1` against the database with a hard timeout (default 2 s). Never throws:
 * any failure, including the timeout, is reported as "down".
 */
export async function checkDatabase(connectionString: string, timeoutMs = 2000): Promise<DbStatus> {
  const client = new pg.Client({
    connectionString,
    connectionTimeoutMillis: timeoutMs,
    query_timeout: timeoutMs,
    statement_timeout: timeoutMs,
  })

  let timer: NodeJS.Timeout | undefined
  const timeout = new Promise<DbStatus>((resolve) => {
    timer = setTimeout(() => resolve('down'), timeoutMs)
  })
  const probe: Promise<DbStatus> = (async () => {
    await client.connect()
    await client.query('select 1')
    return 'up' as const
  })().catch(() => 'down' as const)

  try {
    return await Promise.race([probe, timeout])
  } finally {
    clearTimeout(timer)
    client.end().catch(() => undefined)
  }
}
