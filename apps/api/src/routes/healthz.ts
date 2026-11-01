import { Router } from 'express'
import type { AppConfig } from '../config.js'
import { configuredFlags } from '../config.js'
import type { DbStatus } from '../db/health.js'
import { checkDatabase } from '../db/health.js'

export interface HealthzResponse {
  ok: true
  version: string
  configured: { db: boolean; auth: boolean; meta: boolean; bucket: boolean }
  /** Present only when DATABASE_URL is set. */
  db?: DbStatus
}

export interface HealthzDeps {
  config: AppConfig
  version: string
  checkDb?: (url: string) => Promise<DbStatus>
}

export function healthzRouter({ config, version, checkDb = checkDatabase }: HealthzDeps): Router {
  const router = Router()

  router.get('/healthz', async (_req, res) => {
    const { db, auth, meta, bucket } = configuredFlags(config)
    const body: HealthzResponse = { ok: true, version, configured: { db, auth, meta, bucket } }
    if (config.db.url) body.db = await checkDb(config.db.url)
    res.setHeader('Cache-Control', 'no-store')
    res.json(body)
  })

  return router
}
