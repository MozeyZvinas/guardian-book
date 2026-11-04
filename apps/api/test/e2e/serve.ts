import path from 'node:path'
import { fileURLToPath } from 'node:url'
import express from 'express'
import sharp from 'sharp'
import { createApp } from '../../src/app.js'
import { loadConfig } from '../../src/config.js'
import { loadContent } from '../../src/content/loader.js'
import { createDb } from '../../src/db/client.js'
import { runMigrations } from '../../src/db/migrate.js'
import { seed } from '../../src/db/seed.js'
import { createGateway } from '../../src/gateway/gateway.js'
import { createTranscriber } from '../../src/gateway/transcribe.js'
import { logger } from '../../src/logger.js'
import { JobRegistry } from '../../src/modelRuns/jobs.js'
import { memoryStorage } from '../../src/storage/index.js'
import { TEST_PASSWORD, resetDatabase } from '../integration/db.js'
import { integrationDatabaseUrl } from '../integration/harness.js'
import { scriptedModel, scriptedTranscriber } from '../integration/practiceGateway.js'

/**
 * The end-to-end server (brief B04 §6): the real app on a fresh, seeded loopback database
 * with the built web app, in-memory private storage and a mocked model, so Playwright can
 * drive bring → feedback with no key and no spend. `E2E_LIVE=1` swaps in the real gateway
 * from `.env` for the live smoke (never in CI).
 *
 *   pnpm build && pnpm --filter @guardian-book/api exec tsx test/e2e/serve.ts
 */

const here = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(here, '../../../..')
const port = Number(process.env['E2E_PORT'] ?? 8097)
const live = process.env['E2E_LIVE'] === '1'

if (live) {
  try {
    process.loadEnvFile(path.join(repoRoot, '.env'))
  } catch {
    // Environment may already be set.
  }
}

const databaseUrl = integrationDatabaseUrl()
await resetDatabase()
const handle = createDb(databaseUrl, 4)
await runMigrations(databaseUrl)
const seeded = await seed(handle.db, { password: TEST_PASSWORD })
logger.info('e2e: seeded', { items: seeded.items })
// B17: the five fictional library questions (never DBE text), approved for no class yet:
// the teacher approves the paper in the e2e flow, as in production.
const library = await loadContent(handle.db, path.resolve(here, '../fixtures/library'))
logger.info('e2e: library fixture loaded', { inserted: library.inserted.length })

const config = loadConfig({
  ...(live ? process.env : {}),
  DATABASE_URL: databaseUrl,
  BETTER_AUTH_SECRET: 'e2e-only-secret-0123456789abcdef',
  BETTER_AUTH_URL: `http://127.0.0.1:${port}`,
  // B09: /try sign-ups join the seeded try-it class, as in production.
  PUBLIC_TRY_CLASS_CODE: seeded.classCodes.try,
})
const gateway = live ? createGateway({ config: config.meta, logger }) : scriptedModel().gateway
// B13: voice. Live swaps in Muse Voice Transcribe from `.env`; otherwise every clip says the same thing.
const transcriber = live ? createTranscriber({ config: config.meta, logger }) : scriptedTranscriber().transcriber
const storage = memoryStorage(`http://127.0.0.1:${port}/e2e-bucket`)
// The fixture's one diagram: a plain synthetic PNG under the item's diagram key, served only through the API proxy.
await storage.putObject(
  'library-fixture/p1-2023-nov-q2-1.png',
  await sharp({ create: { width: 360, height: 120, channels: 3, background: { r: 246, g: 247, b: 247 } } })
    .png()
    .toBuffer(),
  'image/png',
)
const jobs = new JobRegistry(logger)

const app = createApp({
  config,
  logger,
  webDistDir: path.resolve(repoRoot, 'apps/web/dist'),
  version: 'e2e',
  db: handle.db,
  gateway,
  storage,
  transcriber,
  jobs,
})

// The memory bucket's "presigned" links point here, so the feedback page can show the photo.
// Mounted in front of the app: its SPA fallback would otherwise answer first.
const outer = express()
outer.get('/e2e-bucket/{*key}', async (req, res) => {
  const key = Array.isArray(req.params['key']) ? req.params['key'].join('/') : String(req.params['key'] ?? '')
  if (!req.query['X-Amz-Signature']) {
    res.status(403).type('text/plain').send('AccessDenied: this bucket is private; a signed URL is required.')
    return
  }
  const object = await storage.getObject(key)
  if (!object) {
    res.status(404).end()
    return
  }
  res.type(object.contentType).send(object.body)
})
outer.use(app)

outer.listen(port, () => {
  logger.info('e2e: listening', { port, live, model: gateway.model })
})
