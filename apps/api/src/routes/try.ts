import { eq } from 'drizzle-orm'
import { Router } from 'express'
import type { TryStatusResponse } from '@guardian-book/shared'
import type { Db } from '../db/client.js'
import { classes } from '../db/schema.js'
import { hashCode } from '../lib/codes.js'

/**
 * `GET /api/try` (B09): public, no session. Says whether the "Try it" path works on this
 * server: `PUBLIC_TRY_CLASS_CODE` is set and names a seeded class. Returns the class's
 * name only; never the code or an ID. Unconfigured or no database → `available: false`.
 */
export function tryRouter(deps: { db: Db | null; tryClassCode: string | null }): Router {
  const router = Router()
  router.get('/api/try', async (_req, res, next) => {
    try {
      let body: TryStatusResponse = { available: false, className: null }
      if (deps.db && deps.tryClassCode) {
        const [cls] = await deps.db
          .select({ name: classes.name })
          .from(classes)
          .where(eq(classes.codeHash, hashCode(deps.tryClassCode)))
          .limit(1)
        if (cls) body = { available: true, className: cls.name }
      }
      res.setHeader('Cache-Control', 'no-store')
      res.json(body)
    } catch (err) {
      next(err)
    }
  })
  return router
}
