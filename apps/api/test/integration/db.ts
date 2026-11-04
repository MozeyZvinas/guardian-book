import path from 'node:path'
import pg from 'pg'
import request from 'supertest'
import type { Express } from 'express'
import { createApp } from '../../src/app.js'
import { loadConfig } from '../../src/config.js'
import { createDb, type Db, type DbHandle } from '../../src/db/client.js'
import { runMigrations } from '../../src/db/migrate.js'
import { seed, type SeedResult } from '../../src/db/seed.js'
import { SEED_PEOPLE, type SeedPersonKey } from '../../src/db/seed-data.js'
import type { Gateway } from '../../src/gateway/gateway.js'
import type { Transcriber } from '../../src/gateway/transcribe.js'
import { silentLogger } from '../../src/logger.js'
import { JobRegistry } from '../../src/modelRuns/jobs.js'
import { memoryStorage, type Storage } from '../../src/storage/index.js'
import { integrationDatabaseUrl } from './harness.js'

/** Test-only fixture; never a real secret. Every seeded person signs in with it. */
export const TEST_PASSWORD = 'integration-only-password'
export const TEST_ORIGIN = 'https://guardianbook.test'

export const databaseUrl = integrationDatabaseUrl()

/** Drops everything and re-applies the migrations: every test file starts from zero. */
export async function resetDatabase(): Promise<void> {
  const client = new pg.Client({ connectionString: databaseUrl })
  await client.connect()
  try {
    // Drizzle keeps its migration ledger in the `drizzle` schema: drop it too, or nothing re-runs.
    await client.query('drop schema public cascade; drop schema if exists drizzle cascade; create schema public;')
  } finally {
    await client.end()
  }
  await runMigrations(databaseUrl)
}

export interface TestContext {
  handle: DbHandle
  db: Db
  app: Express
  seeded: SeedResult
  jobs: JobRegistry
  close(): Promise<void>
}

export interface FreshContextOptions {
  seed?: boolean
  /** Extra env for `loadConfig` (caps, model ID). */
  env?: Record<string, string>
  /** A scripted gateway (B04 tests); default: unconfigured, every call refused. */
  gateway?: Gateway
  /** `null` = uploads answer 503; default: in-memory storage. */
  storage?: Storage | null
  /** A scripted transcriber (B13); default: unconfigured, voice answers 503. */
  transcriber?: Transcriber
  now?: () => Date
}

/** A fresh database, migrated and seeded, with the app wired to it over an https origin. */
export async function freshContext(options: FreshContextOptions = {}): Promise<TestContext> {
  await resetDatabase()
  const handle = createDb(databaseUrl, 4)
  const seeded =
    options.seed === false
      ? { classCodes: { '12A': '', '11B': '', '10C': '', try: '' }, items: { inserted: 0, updated: 0, unchanged: 0 } }
      : await seed(handle.db, { password: TEST_PASSWORD })
  const jobs = new JobRegistry(silentLogger)
  const app = createApp({
    config: loadConfig({
      DATABASE_URL: databaseUrl,
      BETTER_AUTH_SECRET: 'integration-only-secret-0123456789abcdef',
      BETTER_AUTH_URL: TEST_ORIGIN,
      // B09: the seeded try-it class is reachable, as in production once the founder sets the variable.
      ...(seeded.classCodes.try ? { PUBLIC_TRY_CLASS_CODE: seeded.classCodes.try } : {}),
      ...(options.env ?? {}),
    }),
    logger: silentLogger,
    webDistDir: path.join(import.meta.dirname, 'no-dist'),
    version: 'integration',
    db: handle.db,
    ...(options.gateway ? { gateway: options.gateway } : {}),
    storage: options.storage === undefined ? memoryStorage() : options.storage,
    ...(options.transcriber ? { transcriber: options.transcriber } : {}),
    jobs,
    ...(options.now ? { now: options.now } : {}),
  })
  return { handle, db: handle.db, app, seeded, jobs, close: () => handle.close() }
}

/** Signs in as a seeded person and returns the Cookie header to send back. */
export async function signInAs(app: Express, who: SeedPersonKey, password = TEST_PASSWORD): Promise<string> {
  const res = await request(app)
    .post('/api/auth/sign-in/email')
    .set('Origin', TEST_ORIGIN)
    .send({ email: SEED_PEOPLE[who].email, password })
  if (res.status !== 200) {
    throw new Error(`sign-in as ${who} failed: ${res.status} ${JSON.stringify(res.body)}`)
  }
  return cookieHeader(res.headers['set-cookie'])
}

export function cookieHeader(setCookie: string | string[] | undefined): string {
  const list = Array.isArray(setCookie) ? setCookie : setCookie ? [setCookie] : []
  return list.map((line) => line.split(';')[0] ?? '').join('; ')
}

/** Drizzle wraps driver errors ("Failed query: ...") with the pg error as `cause`; match either. */
export async function expectDbError(work: Promise<unknown>, pattern: RegExp): Promise<void> {
  let caught: unknown = null
  try {
    await work
  } catch (err) {
    caught = err
  }
  if (!caught) throw new Error(`expected a database error matching ${pattern}, but the query succeeded`)
  const messages: string[] = []
  let current: unknown = caught
  for (let depth = 0; depth < 4 && current instanceof Error; depth += 1) {
    messages.push(current.message)
    current = current.cause
  }
  if (!messages.some((m) => pattern.test(m))) {
    throw new Error(`expected a database error matching ${pattern}, got: ${messages.join(' | ')}`)
  }
}

export async function countRows(db: Db, table: string): Promise<number> {
  const result = await db.execute<{ n: string }>(`select count(*)::text as n from "${table}"`)
  return Number(result.rows[0]?.n ?? 0)
}
