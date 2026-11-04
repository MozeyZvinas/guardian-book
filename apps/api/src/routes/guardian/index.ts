import { and, eq, isNull } from 'drizzle-orm'
import { Router } from 'express'
import { setLanguageBodySchema, type GuardianWeekView, type LanguageResponse, type SupportGivenResponse } from '@guardian-book/shared'
import { can } from '../../access/index.js'
import { requireActor, requireRole } from '../../auth/session.js'
import { guardianLinks } from '../../db/schema.js'
import type { PracticeDeps } from '../../inputs/deps.js'
import { notFound, parse, requestIdOf, uuidParam } from '../../lib/http.js'
import { guardianWeek, refreshWeeklyIfStale, supportGiven } from '../../plans/service.js'
import { preferredLanguage, setPreferredLanguage } from '../../translate/service.js'
import { warmTranslations, withWeekTranslations } from '../../translate/week.js'

/**
 * The guardian space (spec 03 §8.2, §8.3, §9.3; spec 05 §4.3 G1, G4): the week with a
 * linked learner, "We did it", and the parent's home language (B12). An unlinked learner
 * is a 404; guardians never reach an attempt, an answer or an image through here (the
 * response has no such field). G2 Notes reads B07's `GET /api/guardian/notes`; G3 reads
 * `GET /api/calendar`.
 */
export function guardianRouter(deps: PracticeDeps): Router {
  const router = Router()

  router.get('/api/guardian/learners/:id/plan', requireRole('guardian'), async (req, res, next) => {
    try {
      const actor = requireActor(res)
      const learnerId = uuidParam(req, 'id')
      if (!(await can(deps.db, actor, 'plan.read', { type: 'learner', id: learnerId }))) throw notFound()
      await refreshWeeklyIfStale(deps, learnerId)
      // B12: every parent-facing text travels with its translation state in the guardian's language.
      const payload: GuardianWeekView = await withWeekTranslations(deps, actor, await guardianWeek(deps, actor, learnerId))
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

  // ── G4 · the parent's home language (B12) ───────────────────────────────────────────────

  router.get('/api/guardian/language', requireRole('guardian'), async (_req, res, next) => {
    try {
      const actor = requireActor(res)
      const payload: LanguageResponse = { language: await preferredLanguage(deps.db, actor.userId) }
      res.setHeader('Cache-Control', 'no-store')
      res.json(payload)
    } catch (err) {
      next(err)
    }
  })

  /** Stores the choice on the guardian's own profile, then starts translating what they can already see. */
  router.patch('/api/guardian/language', requireRole('guardian'), async (req, res, next) => {
    try {
      const actor = requireActor(res)
      const body = parse(setLanguageBodySchema, req.body)
      const language = await setPreferredLanguage(deps.db, actor, body.language, requestIdOf(req))
      const linked = await deps.db
        .select({ learnerId: guardianLinks.learnerId })
        .from(guardianLinks)
        .where(and(eq(guardianLinks.guardianId, actor.userId), isNull(guardianLinks.revokedAt)))
      await warmTranslations(
        deps,
        actor,
        linked.map((row) => row.learnerId),
        language,
      )
      const payload: LanguageResponse = { language }
      res.setHeader('Cache-Control', 'no-store')
      res.json(payload)
    } catch (err) {
      next(err)
    }
  })

  return router
}
