import express, { type ErrorRequestHandler, type Express } from 'express'
import type { AppConfig } from './config.js'
import type { DbStatus } from './db/health.js'
import type { Logger } from './logger.js'
import { requestLog } from './middleware/requestLog.js'
import { securityHeaders } from './middleware/securityHeaders.js'
import { healthzRouter } from './routes/healthz.js'
import { webStatic } from './static.js'

export interface AppOptions {
  config: AppConfig
  logger: Logger
  /** Absolute path to the built web app. */
  webDistDir: string
  version: string
  /** Injected in tests; defaults to a real `select 1`. */
  checkDb?: (url: string) => Promise<DbStatus>
}

function errorHandler(logger: Logger): ErrorRequestHandler {
  return (err: unknown, req, res, _next) => {
    const requestId = typeof res.locals['requestId'] === 'string' ? res.locals['requestId'] : undefined
    logger.error('unhandled error', { requestId, route: req.path, err })
    if (res.headersSent) return
    res.status(500).json({ error: { code: 'internal', message: 'Something went wrong.', requestId } })
  }
}

export function createApp(options: AppOptions): Express {
  const { config, logger, webDistDir, version, checkDb } = options
  const app = express()

  app.disable('x-powered-by')
  app.use(requestLog(logger))
  app.use(securityHeaders())

  app.use(healthzRouter(checkDb ? { config, version, checkDb } : { config, version }))

  // API routes mount here in later briefs. Anything unknown under /api is a JSON 404
  // (spec 03 §5 error shape), never the web app's index.html.
  app.use('/api', express.json({ limit: '1mb' }))
  app.all('/api/{*splat}', (_req, res) => {
    res.status(404).json({ error: { code: 'not_found', message: 'No such route.' } })
  })

  app.use(webStatic(webDistDir))
  app.use(errorHandler(logger))

  return app
}
