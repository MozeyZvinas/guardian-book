import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createApp } from './app.js'
import { loadConfig } from './config.js'
import { createLogger, silentLogger } from './logger.js'
import { CONTENT_SECURITY_POLICY, PERMISSIONS_POLICY } from './middleware/securityHeaders.js'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

function makeDist(): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'gb-web-dist-'))
  writeFileSync(
    path.join(dir, 'index.html'),
    '<!doctype html><html lang="en"><body><div id="root">Guardian Book test shell</div></body></html>',
  )
  mkdirSync(path.join(dir, 'assets'))
  writeFileSync(path.join(dir, 'assets', 'app-abc123.js'), 'console.log("app")')
  return dir
}

describe('createApp', () => {
  let dist: string

  beforeAll(() => {
    dist = makeDist()
  })
  afterAll(() => {
    rmSync(dist, { recursive: true, force: true })
  })

  const zeroEnvApp = () =>
    createApp({ config: loadConfig({}), logger: silentLogger, webDistDir: dist, version: '0.0.0-test' })

  it('GET /healthz with zero env reports nothing configured and no db key', async () => {
    const res = await request(zeroEnvApp()).get('/healthz')
    expect(res.status).toBe(200)
    expect(res.body).toEqual({
      ok: true,
      version: '0.0.0-test',
      configured: { db: false, auth: false, meta: false, bucket: false },
    })
    expect(res.headers['cache-control']).toBe('no-store')
  })

  it('GET /healthz probes the database when DATABASE_URL is set', async () => {
    const calls: string[] = []
    const app = createApp({
      config: loadConfig({ DATABASE_URL: 'postgres://u:p@127.0.0.1:5433/guardian' }),
      logger: silentLogger,
      webDistDir: dist,
      version: 'v',
      checkDb: async (url) => {
        calls.push(url)
        return 'down'
      },
    })
    const res = await request(app).get('/healthz')
    expect(res.status).toBe(200)
    expect(res.body.configured.db).toBe(true)
    expect(res.body.db).toBe('down')
    expect(calls).toEqual(['postgres://u:p@127.0.0.1:5433/guardian'])
  })

  it('sets the security headers on every response and hides x-powered-by', async () => {
    for (const url of ['/healthz', '/', '/api/nothing']) {
      const res = await request(zeroEnvApp()).get(url)
      expect(res.headers['content-security-policy']).toBe(CONTENT_SECURITY_POLICY)
      expect(res.headers['content-security-policy']).toContain("default-src 'self'")
      expect(res.headers['content-security-policy']).toContain("img-src 'self' data:")
      expect(res.headers['x-content-type-options']).toBe('nosniff')
      expect(res.headers['referrer-policy']).toBe('strict-origin-when-cross-origin')
      expect(res.headers['permissions-policy']).toBe(PERMISSIONS_POLICY)
      expect(res.headers['permissions-policy']).toContain('camera=(self)')
      expect(res.headers['x-powered-by']).toBeUndefined()
    }
  })

  it('generates a request ID, echoes a safe one and replaces an unsafe one', async () => {
    const generated = await request(zeroEnvApp()).get('/healthz')
    expect(generated.headers['x-request-id']).toMatch(UUID)

    const echoed = await request(zeroEnvApp()).get('/healthz').set('x-request-id', 'client-id-12345')
    expect(echoed.headers['x-request-id']).toBe('client-id-12345')

    const replaced = await request(zeroEnvApp()).get('/healthz').set('x-request-id', 'bad id <script>')
    expect(replaced.headers['x-request-id']).toMatch(UUID)
  })

  it('logs one JSON line per request with route, status, latency and request ID', async () => {
    const lines: string[] = []
    const app = createApp({
      config: loadConfig({}),
      logger: createLogger((line) => lines.push(line)),
      webDistDir: dist,
      version: 'v',
    })
    await request(app).get('/healthz?email=leak@example.com').set('x-request-id', 'trace-0001')
    const entries = lines.map((line) => JSON.parse(line) as Record<string, unknown>)
    const entry = entries.find((e) => e['msg'] === 'request')
    expect(entry).toBeDefined()
    expect(entry).toMatchObject({ requestId: 'trace-0001', method: 'GET', route: '/healthz', status: 200 })
    expect(typeof entry?.['durationMs']).toBe('number')
    expect(JSON.stringify(entry)).not.toContain('leak@example.com')
  })

  it('answers unknown /api routes with a JSON 404, never the web shell', async () => {
    const res = await request(zeroEnvApp()).get('/api/does-not-exist')
    expect(res.status).toBe(404)
    expect(res.body).toEqual({ error: { code: 'not_found', message: 'No such route.' } })
  })

  it('serves the web build at / and falls back to index.html for app routes', async () => {
    const root = await request(zeroEnvApp()).get('/')
    expect(root.status).toBe(200)
    expect(root.text).toContain('Guardian Book test shell')
    expect(root.headers['cache-control']).toBe('no-cache')

    const deep = await request(zeroEnvApp()).get('/evidence')
    expect(deep.status).toBe(200)
    expect(deep.text).toContain('Guardian Book test shell')
  })

  it('serves hashed assets with a long immutable cache', async () => {
    const res = await request(zeroEnvApp()).get('/assets/app-abc123.js')
    expect(res.status).toBe(200)
    expect(res.text).toContain('console.log')
    expect(res.headers['cache-control']).toBe('public, max-age=31536000, immutable')
  })

  it('explains itself when the web build is missing instead of crashing', async () => {
    const app = createApp({
      config: loadConfig({}),
      logger: silentLogger,
      webDistDir: path.join(dist, 'does-not-exist'),
      version: 'v',
    })
    const health = await request(app).get('/healthz')
    expect(health.status).toBe(200)
    const root = await request(app).get('/')
    expect(root.status).toBe(503)
    expect(root.text).toContain('web build')
  })
})
