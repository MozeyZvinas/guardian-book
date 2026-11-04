import { Router } from 'express'
import { checkModeSchema, type CheckAloneResponse, type LearnerPlanResponse } from '@guardian-book/shared'
import { requireActor, requireRole } from '../auth/session.js'
import type { PracticeDeps } from '../inputs/deps.js'
import { HttpError } from '../lib/http.js'
import { learnerPlan, matchItemForCheck, refreshWeeklyIfStale } from './service.js'

/** The learner's side of the loop (spec 03 §8.3 `GET /api/me/plan`; P0-05 check it alone). */
export function plansRouter(deps: PracticeDeps): Router {
  const router = Router()

  router.get('/api/me/plan', requireRole('learner'), async (_req, res, next) => {
    try {
      const actor = requireActor(res)
      await refreshWeeklyIfStale(deps, actor.userId)
      const payload: LearnerPlanResponse = { plan: await learnerPlan(deps.db, actor.userId) }
      res.setHeader('Cache-Control', 'no-store')
      res.json(payload)
    } catch (err) {
      next(err)
    }
  })

  /** `?skill=<tag>&mode=independent|retention&from=<attemptId>`: the matched item for a check-alone or follow-up attempt. */
  router.get('/api/me/check-alone', requireRole('learner'), async (req, res, next) => {
    try {
      const actor = requireActor(res)
      const skill = req.query['skill']
      if (typeof skill !== 'string' || !/^[a-z0-9]+(?:[-_.][a-z0-9]+)*$/.test(skill)) throw new HttpError(400, 'validation', 'skill is required.')
      const mode = checkModeSchema.safeParse(req.query['mode'] ?? 'independent')
      if (!mode.success) throw new HttpError(400, 'validation', 'mode must be independent or retention.')
      const from = req.query['from']
      const fromAttemptId = typeof from === 'string' && /^[0-9a-f-]{36}$/i.test(from) ? from.toLowerCase() : null
      const payload: CheckAloneResponse = await matchItemForCheck(deps.db, actor.userId, skill, mode.data, fromAttemptId)
      res.setHeader('Cache-Control', 'no-store')
      res.json(payload)
    } catch (err) {
      next(err)
    }
  })

  return router
}
