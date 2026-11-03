import { toNodeHandler } from 'better-auth/node'
import express, { type ErrorRequestHandler, type Express } from 'express'
import { createAuth, type Auth } from './auth/auth.js'
import { attachSession } from './auth/session.js'
import { signUpRouter } from './auth/signup.js'
import type { AppConfig } from './config.js'
import type { Db } from './db/client.js'
import type { DbStatus } from './db/health.js'
import { HttpError, notConfigured } from './lib/http.js'
import type { Logger } from './logger.js'
import { requestLog } from './middleware/requestLog.js'
import { securityHeaders } from './middleware/securityHeaders.js'
import { circleRouter } from './routes/circle.js'
import { healthzRouter } from './routes/healthz.js'
import { itemsRouter } from './routes/items.js'
import { meRouter } from './routes/me.js'
import { webStatic } from './static.js'

export interface AppOptions {
  config: AppConfig
  logger: Logger
  /** Absolute path to the built web app. */
  webDistDir: string
  version: string
  /** Injected in tests; defaults to a real `select 1`. */
  checkDb?: (url: string) => Promise<DbStatus>
  /** The database, when `DATABASE_URL` is configured. Without it, `/api` answers 503. */
  db?: Db | null
  /** Better Auth, when the database and `BETTER_AUTH_*` are configured. */
  auth?: Auth | null
}

/** Route prefixes that need the database; with none configured they answer 503, not 404. */
const API_PREFIXES = ['/api/auth', '/api/me', '/api/teacher', '/api/learner', '/api/guardian', '/api/items', '/api/schools']

function errorHandler(logger: Logger): ErrorRequestHandler {
  return (err: unknown, req, res, _next) => {
    const requestId = typeof res.locals['requestId'] === 'string' ? res.locals['requestId'] : undefined
    if (err instanceof HttpError) {
      if (res.headersSent) return
      res.status(err.status).json({
        error: { code: err.code, message: err.message, ...(err.issues ? { issues: err.issues } : {}), requestId },
      })
      return
    }
    // express.json() parse failures and oversize bodies.
    const status = typeof (err as { status?: unknown })?.status === 'number' ? (err as { status: number }).status : 500
    if (status >= 400 && status < 500) {
      logger.warn('request refused', { requestId, route: req.path, status, message: err instanceof Error ? err.message : String(err) })
      if (res.headersSent) return
      res.status(status).json({ error: { code: 'bad_request', message: 'The request could not be read.', requestId } })
      return
    }
    logger.error('unhandled error', { requestId, route: req.path, err })
    if (res.headersSent) return
    res.status(500).json({ error: { code: 'internal', message: 'Something went wrong.', requestId } })
  }
}

export function createApp(options: AppOptions): Express {
  const { config, logger, webDistDir, version, checkDb } = options
  const db = options.db ?? null
  const auth =
    options.auth ?? (db && config.auth.secret && config.auth.url ? createAuth(db, { secret: config.auth.secret, url: config.auth.url }) : null)
  const app = express()

  app.disable('x-powered-by')
  app.set('trust proxy', 1) // Railway terminates TLS; Better Auth reads the forwarded IP
  app.use(requestLog(logger))
  app.use(securityHeaders())

  app.use(healthzRouter(checkDb ? { config, version, checkDb } : { config, version }))

  if (db && auth) {
    // Sign-up is ours (one transaction with the profile); mounted before Better Auth's
    // handler, which reads the raw body itself and must come before express.json().
    app.use(signUpRouter({ db, auth, logger }))
    app.all('/api/auth/{*splat}', toNodeHandler(auth))

    app.use('/api', express.json({ limit: '1mb' }))
    app.use('/api', attachSession(auth, db))
    app.use(meRouter(db))
    app.use(circleRouter(db))
    app.use(itemsRouter(db))
  } else {
    app.use('/api', express.json({ limit: '1mb' }))
    app.use(API_PREFIXES, (_req, _res, next) => next(notConfigured()))
  }

  // Anything unknown under /api is a JSON 404 (spec 03 §5 error shape), never index.html.
  app.all('/api/{*splat}', (_req, res) => {
    res.status(404).json({ error: { code: 'not_found', message: 'No such route.' } })
  })

  app.use(webStatic(webDistDir))
  app.use(errorHandler(logger))

  return app
}
