import { Router } from 'express'
import type { GuardianWeekResponse, SupportGivenResponse } from '@guardian-book/shared'
import { can } from '../../access/index.js'
import { requireActor, requireRole } from '../../auth/session.js'
import type { PracticeDeps } from '../../inputs/deps.js'
import { notFound, requestIdOf, uuidParam } from '../../lib/http.js'
import { guardianWeek, refreshWeeklyIfStale, supportGiven } from '../../plans/service.js'

/**
 * The guardian space (spec 03 §8.2, §8.3, §9.3; spec 05 §4.3 G1): the week with a linked
 * learner, and "We did it". An unlinked learner is a 404; guardians never reach an
 * attempt, an answer or an image through here (the response has no such field).
 * G2 Notes reads B07's `GET /api/guardian/notes`; G3 reads `GET /api/calendar`.
 */
export function guardianRouter(deps: PracticeDeps): Router {
  const router = Router()

  router.get('/api/guardian/learners/:id/plan', requireRole('guardian'), async (req, res, next) => {
    try {
      const actor = requireActor(res)
      const learnerId = uuidParam(req, 'id')
      if (!(await can(deps.db, actor, 'plan.read', { type: 'learner', id: learnerId }))) throw notFound()
      await refreshWeeklyIfStale(deps, learnerId)
      const payload: GuardianWeekResponse = await guardianWeek(deps, actor, learnerId)
      res.setHeader('Cache-Control', 'no-store')
      res.json(payload)
    } catch (err) {
      next(err)
    }
  })

  router.post('/api/guardian/learners/:id/plan/done', requireRole('guardian'), async (req, res, next) => {
    try {
      const actor = requireActor(res)
      const learnerId = uuidParam(req, 'id')
      if (!(await can(deps.db, actor, 'plan.done', { type: 'learner', id: learnerId }))) throw notFound()
      const payload: SupportGivenResponse = await supportGiven(deps, actor, learnerId, requestIdOf(req))
      res.setHeader('Cache-Control', 'no-store')
      res.status(payload.alreadyDone ? 200 : 201).json(payload)
    } catch (err) {
      next(err)
    }
  })

  return router
}
