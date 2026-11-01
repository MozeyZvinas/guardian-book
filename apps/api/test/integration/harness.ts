/**
 * Integration-test harness. Tests run against a fresh, local Postgres only:
 * `docker compose up -d` locally, a service container in CI. A hosted database is refused.
 */

export const DEFAULT_LOCAL_DATABASE_URL = 'postgres://guardian:guardian_dev_only@127.0.0.1:5433/guardian'

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]'])

export function isLoopbackDatabaseUrl(url: string): boolean {
  try {
    const { hostname } = new URL(url)
    return LOOPBACK_HOSTS.has(hostname.toLowerCase())
  } catch {
    return false
  }
}

/** Returns the URL unchanged, or throws when its host is not loopback. */
export function assertLoopbackDatabaseUrl(url: string): string {
  if (!isLoopbackDatabaseUrl(url)) {
    let host = '(unparseable)'
    try {
      host = new URL(url).hostname
    } catch {
      // keep the placeholder
    }
    throw new Error(
      `Integration tests refuse the database host "${host}": only loopback (127.0.0.1, localhost, ::1) is allowed. ` +
        'Use `docker compose up -d`; never a hosted database.',
    )
  }
  return url
}

export function integrationDatabaseUrl(env: NodeJS.ProcessEnv = process.env): string {
  return assertLoopbackDatabaseUrl(env['DATABASE_URL'] ?? DEFAULT_LOCAL_DATABASE_URL)
}
