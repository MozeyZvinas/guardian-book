import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createApp } from './app.js'
import { describeConfig, loadConfig } from './config.js'
import { createDb, type DbHandle } from './db/client.js'
import { runMigrations } from './db/migrate.js'
import { logger } from './logger.js'
import { appVersion } from './version.js'

// Same relative position from `apps/api/src` (tsx) and `apps/api/dist` (node).
const here = path.dirname(fileURLToPath(import.meta.url))
const webDistDir = process.env['WEB_DIST_DIR'] ?? path.resolve(here, '../../web/dist')

const config = loadConfig()
const version = appVersion()

logger.info('config', describeConfig(config))

// The release step (spec 03 §2): pending migrations run before the server listens. They
// are additive and idempotent. A failure is logged, never fatal: /healthz still answers.
let handle: DbHandle | null = null
if (config.db.url) {
  if (config.db.migrateOnBoot) {
    try {
      await runMigrations(config.db.url, logger)
    } catch (err) {
      logger.error('migrations failed; starting anyway', { err })
    }
  }
  handle = createDb(config.db.url)
}

const app = createApp({ config, logger, webDistDir, version, db: handle?.db ?? null })
const server = app.listen(config.port, () => {
  logger.info('listening', { port: config.port, version })
})

function shutdown(signal: string): void {
  logger.info('shutting down', { signal })
  server.close(() => {
    const done = () => process.exit(0)
    if (handle) handle.close().then(done, done)
    else done()
  })
  setTimeout(() => process.exit(0), 5000).unref()
}

process.on('SIGTERM', () => shutdown('SIGTERM'))
process.on('SIGINT', () => shutdown('SIGINT'))
