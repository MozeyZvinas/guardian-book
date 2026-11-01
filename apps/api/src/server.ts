import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createApp } from './app.js'
import { describeConfig, loadConfig } from './config.js'
import { logger } from './logger.js'
import { appVersion } from './version.js'

// Same relative position from `apps/api/src` (tsx) and `apps/api/dist` (node).
const here = path.dirname(fileURLToPath(import.meta.url))
const webDistDir = process.env['WEB_DIST_DIR'] ?? path.resolve(here, '../../web/dist')

const config = loadConfig()
const version = appVersion()

logger.info('config', describeConfig(config))

const app = createApp({ config, logger, webDistDir, version })
const server = app.listen(config.port, () => {
  logger.info('listening', { port: config.port, version })
})

function shutdown(signal: string): void {
  logger.info('shutting down', { signal })
  server.close(() => process.exit(0))
  setTimeout(() => process.exit(0), 5000).unref()
}

process.on('SIGTERM', () => shutdown('SIGTERM'))
process.on('SIGINT', () => shutdown('SIGINT'))
