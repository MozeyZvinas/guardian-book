import { eq } from 'drizzle-orm'
import { Router } from 'express'
import { createAttemptBodySchema, type AssessResponse, type CreateAttemptResponse } from '@guardian-book/shared'
import { can } from '../access/index.js'
import { recordAudit } from '../audit/record.js'
import { requireActor, requireRole } from '../auth/session.js'
import { attempts } from '../db/schema.js'
import type { PracticeDeps } from '../inputs/deps.js'
import { createInput } from '../inputs/service.js'
import { notFound, parse, requestIdOf, uuidParam } from '../lib/http.js'
import { budgetExhausted, checkCaps } from '../modelRuns/index.js'
import { PRESIGN_MAX_SECONDS, storageNotConfigured } from '../storage/index.js'
import { attemptResponse, modelNotConfigured, startAssessment } from './service.js'

/**
 * `/api/attempts` (spec 03 §5, §9.3; brief B04 §3). `POST /api/attempts` is the typed
 * shortcut: it creates the input (kind `work`, stated) and the attempt in one call.
 * `POST /:id/assess` answers 202 and runs the check in the background; `GET /:id` is what
 * the learner polls every 2 s.
 */
export function attemptsRouter(deps: PracticeDeps): Router {
  const router = Router()

  router.post('/api/attempts', requireRole('learner'), async (req, res, next) => {
    try {
      const actor = requireActor(res)
      const body = parse(createAttemptBodySchema, req.body)
      const result = await createInput(deps, {
        actor,
        fields: { kind: 'work', itemId: body.itemId, text: body.answerText, idempotencyKey: body.idempotencyKey, mode: body.mode },
        file: null,
        requestId: requestIdOf(req),
      })
      if (!result.input.attemptId) throw notFound()
      const payload: CreateAttemptResponse = { attemptId: result.input.attemptId, inputId: result.input.id, replayed: result.replayed }
      res.setHeader('Cache-Control', 'no-store')
      res.status(result.replayed ? 200 : 201).json(payload)
    } catch (err) {
      next(err)
    }
  })

  router.post('/api/attempts/:id/assess', requireRole('learner'), async (req, res, next) => {
    try {
      const actor = requireActor(res)
      const attemptId = uuidParam(req, 'id')
      if (!(await can(deps.db, actor, 'attempt.assess', { type: 'attempt', id: attemptId }))) throw notFound()
      if (!deps.gateway.configured) throw modelNotConfigured()
      // The cap is checked here too, so a refused learner hears it now, not from a poll.
      const cap = await checkCaps(deps.db, actor.userId, deps.limits, deps.now())
      if (!cap.ok) {
        await recordAudit(deps.db, { actorId: actor.userId, action: 'attempt.assess_refused', subjectType: 'attempt', subjectId: attemptId, outcome: 'refused', requestId: requestIdOf(req) })
        throw budgetExhausted(cap.reason)
      }
      const decision = await startAssessment(deps, attemptId)
      if (decision === 'started') {
        await recordAudit(deps.db, { actorId: actor.userId, action: 'attempt.assess_started', subjectType: 'attempt', subjectId: attemptId, outcome: 'ok', requestId: requestIdOf(req) })
      }
      const payload: AssessResponse = { status: decision === 'done' ? 'done' : 'assessing', attemptId }
      res.setHeader('Cache-Control', 'no-store')
      res.status(decision === 'done' ? 200 : 202).json(payload)
    } catch (err) {
      next(err)
    }
  })

  router.get('/api/attempts/:id', async (req, res, next) => {
    try {
      const actor = requireActor(res)
      const attemptId = uuidParam(req, 'id')
      const payload = await attemptResponse(deps, actor, attemptId)
      if (actor.role === 'admin') {
        await recordAudit(deps.db, { actorId: actor.userId, action: 'access.admin_read', subjectType: 'attempt', subjectId: attemptId, outcome: 'ok', requestId: requestIdOf(req) })
      }
      res.setHeader('Cache-Control', 'no-store')
      res.json(payload)
    } catch (err) {
      next(err)
    }
  })

  /** 302 to a presigned URL (≤ 5 min). Owner or class teacher; anyone else: 404 (spec 03 §4). */
  router.get('/api/attempts/:id/image', async (req, res, next) => {
    try {
      const actor = requireActor(res)
      const attemptId = uuidParam(req, 'id')
      if (!(await can(deps.db, actor, 'attempt.read', { type: 'attempt', id: attemptId }))) throw notFound()
      const [row] = await deps.db.select({ imageKey: attempts.imageKey }).from(attempts).where(eq(attempts.id, attemptId)).limit(1)
      if (!row || !row.imageKey) throw notFound()
      if (!deps.storage) throw storageNotConfigured()
      res.setHeader('Cache-Control', 'no-store')
      res.redirect(302, await deps.storage.presignGet(row.imageKey, PRESIGN_MAX_SECONDS))
    } catch (err) {
      next(err)
    }
  })

  return router
}
