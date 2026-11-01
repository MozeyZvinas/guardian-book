import path from 'node:path'
import request from 'supertest'
import { describe, expect, it } from 'vitest'
import { createApp } from '../../src/app.js'
import { loadConfig } from '../../src/config.js'
import { checkDatabase } from '../../src/db/health.js'
import { silentLogger } from '../../src/logger.js'
import { integrationDatabaseUrl } from './harness.js'

const url = integrationDatabaseUrl()

function app(databaseUrl: string) {
  return createApp({
    config: loadConfig({ DATABASE_URL: databaseUrl }),
    logger: silentLogger,
    webDistDir: path.join(import.meta.dirname, 'no-dist'),
    version: 'integration',
  })
}

describe('GET /healthz against a fresh Postgres', () => {
  it('reports db: "up" and configured.db: true', async () => {
    const res = await request(app(url)).get('/healthz')
    expect(res.status).toBe(200)
    expect(res.body.ok).toBe(true)
    expect(res.body.configured.db).toBe(true)
    expect(res.body.db).toBe('up')
  })

  it('reports db: "down" within the 2-second timeout when nothing listens', async () => {
    const started = Date.now()
    const res = await request(app('postgres://guardian:guardian_dev_only@127.0.0.1:1/guardian')).get('/healthz')
    expect(res.status).toBe(200)
    expect(res.body.db).toBe('down')
    expect(Date.now() - started).toBeLessThan(4000)
  })

  it('checkDatabase answers "down" for a wrong password instead of throwing', async () => {
    const wrongPassword = url.replace(/\/\/([^:]+):[^@]+@/, '//$1:wrong-password@')
    await expect(checkDatabase(wrongPassword, 2000)).resolves.toBe('down')
  })
})
