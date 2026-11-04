import { eq } from 'drizzle-orm'
import { Router } from 'express'
import type { SkillAudience } from '@guardian-book/shared'
import { can } from '../../access/index.js'
import { recordAudit } from '../../audit/record.js'
import { requireActor, type Actor } from '../../auth/session.js'
import type { Db } from '../../db/client.js'
import { profiles } from '../../db/schema.js'
import { brainView, projectBrain } from '../../evidence/projection.js'
import { notFound, requestIdOf, uuidParam } from '../../lib/http.js'
import { whatComesUpMap } from '../../library/service.js'

/**
 * The Brain (P0-07; spec 05 §4.2 L6, §9): what Guardian Book believes about a learner and
 * the evidence behind it, computed from events on every read.
 *
 * - `GET /api/me/brain`: the learner's own, in learner wording.
 * - `GET /api/learners/:id/brain`: the learner's own, or their class teacher's (teacher
 *   wording). Anyone else, or another school, gets a 404 (`access.can('progress.read')`).
 */
export function brainRouter(db: Db): Router {
  const router = Router()

  router.get('/api/me/brain', async (_req, res, next) => {
    try {
      const actor = requireActor(res)
      if (actor.role !== 'learner') throw notFound()
      res.setHeader('Cache-Control', 'no-store')
      res.json(await brainFor(db, actor, actor.userId, 'learner'))
    } catch (err) {
      next(err)
    }
  })

  router.get('/api/learners/:id/brain', async (req, res, next) => {
    try {
      const actor = requireActor(res)
      const learnerId = uuidParam(req, 'id')
      if (!(await can(db, actor, 'progress.read', { type: 'learner', id: learnerId }))) throw notFound()
      const audience: SkillAudience = actor.role === 'teacher' ? 'teacher' : 'learner'
      const body = await brainFor(db, actor, learnerId, audience)
      if (actor.role === 'admin') {
        await recordAudit(db, { actorId: actor.userId, action: 'access.admin_read', subjectType: 'brain', subjectId: learnerId, outcome: 'ok', requestId: requestIdOf(req) })
      }
      res.setHeader('Cache-Control', 'no-store')
      res.json(body)
    } catch (err) {
      next(err)
    }
  })

  return router
}

async function brainFor(db: Db, _actor: Actor, learnerId: string, audience: SkillAudience) {
  const [learner] = await db.select({ id: profiles.userId, nickname: profiles.nickname, role: profiles.role }).from(profiles).where(eq(profiles.userId, learnerId)).limit(1)
  if (!learner || learner.role !== 'learner') throw notFound()
  const projection = await projectBrain(db, learnerId)
  // B17: how often each skill comes up in the loaded past papers (aggregate structure only).
  return { ...brainView(projection, { id: learner.id, nickname: learner.nickname }, audience), whatComesUp: await whatComesUpMap(db) }
}
