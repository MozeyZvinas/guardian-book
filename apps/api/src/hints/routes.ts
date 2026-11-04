import { Router } from 'express'
import { askBodySchema } from '@guardian-book/shared'
import { requireActor, requireRole } from '../auth/session.js'
import type { PracticeDeps } from '../inputs/deps.js'
import { parse, requestIdOf, uuidParam } from '../lib/http.js'
import { askAboutStep } from './service.js'

/** `POST /api/attempts/:id/ask` (brief B13 §3): one question about one lost step, one verified hint. */
export function hintsRouter(deps: PracticeDeps): Router {
  const router = Router()

  router.post('/api/attempts/:id/ask', requireRole('learner'), async (req, res, next) => {
    try {
      const actor = requireActor(res)
      const attemptId = uuidParam(req, 'id')
      const body = parse(askBodySchema, req.body)
      const payload = await askAboutStep(deps, actor, attemptId, body, requestIdOf(req) ?? null)
      res.setHeader('Cache-Control', 'no-store')
      res.json(payload)
    } catch (err) {
      next(err)
    }
  })

  return router
}
