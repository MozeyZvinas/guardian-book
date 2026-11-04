import { Router } from 'express'
import {
  approveGuidelineBodySchema,
  confirmReviewBodySchema,
  feedbackBodySchema,
  releaseReviewBodySchema,
  type ApproveGuidelineResponse,
  type AttemptReviewResponse,
  type FeedbackResponse,
  type GuidelinesResponse,
  type PictureResponse,
  type QueueResponse,
  type ReviewAttemptResponse,
  type ReviewResponse,
  type TeacherLearnerResponse,
} from '@guardian-book/shared'
import { can } from '../access/index.js'
import { recordAudit } from '../audit/record.js'
import { requireActor, requireRole } from '../auth/session.js'
import { HttpError, notFound, parse, requestIdOf, uuidParam } from '../lib/http.js'
import type { TeacherDeps } from './deps.js'
import { approveGuideline, listGuidelines } from './guidelines.js'
import { teacherLearnerProfile } from './learner.js'
import { classPicture } from './picture.js'
import { listQueue } from './queue.js'
import { addFeedback, attemptReviewForActor, confirmReview, releaseReview, reviewAttemptView } from './review.js'
import { isMultipart, readScriptUpload, uploadScript, type ScriptDeps } from './scripts.js'

/**
 * The teacher space (spec 03 §5, §8.3, §9.3; brief B07): guidelines, the class picture,
 * the queue, the review (confirm → release, feedback) and the learner profile. Every route:
 * session, role, then `access.can` on the object (a denial is a 404).
 */
export function teacherRouter(deps: TeacherDeps & ScriptDeps): Router {
  const router = Router()
  const { db } = deps

  // ── T7 guidelines ───────────────────────────────────────────────────────────────────────

  router.get('/api/teacher/classes/:id/guidelines', requireRole('teacher'), async (req, res, next) => {
    try {
      const payload: GuidelinesResponse = await listGuidelines(db, requireActor(res), uuidParam(req, 'id'))
      res.setHeader('Cache-Control', 'no-store')
      res.json(payload)
    } catch (err) {
      next(err)
    }
  })

  router.post('/api/teacher/classes/:id/guidelines/:itemId/approve', requireRole('teacher'), async (req, res, next) => {
    try {
      const body = parse(approveGuidelineBodySchema, req.body)
      const payload: ApproveGuidelineResponse = await approveGuideline(db, requireActor(res), uuidParam(req, 'id'), uuidParam(req, 'itemId'), body, requestIdOf(req))
      res.setHeader('Cache-Control', 'no-store')
      res.status(payload.replayed ? 200 : 201).json(payload)
    } catch (err) {
      next(err)
    }
  })

  // ── B11 · a teacher uploads a learner's script (P1-g) ───────────────────────────────────

  /** Multipart (`learnerId`, `itemId`, `idempotencyKey`, `image`): 202 + poll `GET /api/teacher/attempts/:id`; a replay answers 200. */
  router.post('/api/teacher/classes/:id/scripts', requireRole('teacher'), async (req, res, next) => {
    try {
      const actor = requireActor(res)
      const classId = uuidParam(req, 'id')
      // The object check comes before the body is read: a stranger's upload is a 404, never buffered.
      if (!(await can(db, actor, 'script.upload', { type: 'class', id: classId }))) throw notFound()
      const body = isMultipart(req) ? await readScriptUpload(req) : { fields: req.body as unknown, file: null }
      const payload = await uploadScript(deps, actor, classId, { fields: body.fields, file: body.file, requestId: requestIdOf(req) })
      res.setHeader('Cache-Control', 'no-store')
      res.status(payload.replayed ? 200 : 202).json(payload)
    } catch (err) {
      next(err)
    }
  })

  // ── T2 picture, T3 queue ────────────────────────────────────────────────────────────────

  router.get('/api/teacher/classes/:id/picture', requireRole('teacher'), async (req, res, next) => {
    try {
      const payload: PictureResponse = await classPicture(db, requireActor(res), uuidParam(req, 'id'))
      res.setHeader('Cache-Control', 'no-store')
      res.json(payload)
    } catch (err) {
      next(err)
    }
  })

  router.get('/api/teacher/queue', requireRole('teacher'), async (req, res, next) => {
    try {
      const classId = req.query['classId']
      if (typeof classId !== 'string' || !/^[0-9a-f-]{36}$/i.test(classId)) throw new HttpError(400, 'validation', 'classId is required.')
      const payload: QueueResponse = await listQueue(db, requireActor(res), classId.toLowerCase())
      res.setHeader('Cache-Control', 'no-store')
      res.json(payload)
    } catch (err) {
      next(err)
    }
  })

  // ── T3a review ──────────────────────────────────────────────────────────────────────────

  router.get('/api/teacher/attempts/:id', requireRole('teacher'), async (req, res, next) => {
    try {
      const payload: ReviewAttemptResponse = await reviewAttemptView(db, requireActor(res), uuidParam(req, 'id'))
      res.setHeader('Cache-Control', 'no-store')
      res.json(payload)
    } catch (err) {
      next(err)
    }
  })

  router.post('/api/teacher/attempts/:id/review', requireRole('teacher'), async (req, res, next) => {
    try {
      const body = parse(confirmReviewBodySchema, req.body)
      const payload: ReviewResponse = { review: await confirmReview(db, requireActor(res), uuidParam(req, 'id'), body, requestIdOf(req)) }
      res.setHeader('Cache-Control', 'no-store')
      res.json(payload)
    } catch (err) {
      next(err)
    }
  })

  /** Release by attempt: 409 `not_confirmed` when no review exists yet (spec 03 §4). */
  router.post('/api/teacher/attempts/:id/release', requireRole('teacher'), async (req, res, next) => {
    try {
      const body = parse(releaseReviewBodySchema, req.body)
      const payload: ReviewResponse = { review: await releaseReview(db, requireActor(res), { attemptId: uuidParam(req, 'id') }, body.version, requestIdOf(req)) }
      res.setHeader('Cache-Control', 'no-store')
      res.json(payload)
    } catch (err) {
      next(err)
    }
  })

  router.post('/api/teacher/reviews/:id/release', requireRole('teacher'), async (req, res, next) => {
    try {
      const body = parse(releaseReviewBodySchema, req.body)
      const payload: ReviewResponse = { review: await releaseReview(db, requireActor(res), { reviewId: uuidParam(req, 'id') }, body.version, requestIdOf(req)) }
      res.setHeader('Cache-Control', 'no-store')
      res.json(payload)
    } catch (err) {
      next(err)
    }
  })

  router.post('/api/teacher/reviews/:id/feedback', requireRole('teacher'), async (req, res, next) => {
    try {
      const body = parse(feedbackBodySchema, req.body)
      const payload: FeedbackResponse = { feedback: await addFeedback(db, requireActor(res), uuidParam(req, 'id'), body, requestIdOf(req)) }
      res.setHeader('Cache-Control', 'no-store')
      res.status(201).json(payload)
    } catch (err) {
      next(err)
    }
  })

  /** The released review and the feedback for this reader: owner (after release) or class teacher; guardians 404. */
  router.get('/api/attempts/:id/review', async (req, res, next) => {
    try {
      const actor = requireActor(res)
      const attemptId = uuidParam(req, 'id')
      const payload: AttemptReviewResponse = await attemptReviewForActor(db, actor, attemptId)
      if (actor.role === 'admin') {
        await recordAudit(db, { actorId: actor.userId, action: 'access.admin_read', subjectType: 'review', subjectId: attemptId, outcome: 'ok', requestId: requestIdOf(req) })
      }
      res.setHeader('Cache-Control', 'no-store')
      res.json(payload)
    } catch (err) {
      next(err)
    }
  })

  // ── T6 learner profile ──────────────────────────────────────────────────────────────────

  router.get('/api/teacher/learners/:id', requireRole('teacher'), async (req, res, next) => {
    try {
      const payload: TeacherLearnerResponse = await teacherLearnerProfile(db, requireActor(res), uuidParam(req, 'id'))
      res.setHeader('Cache-Control', 'no-store')
      res.json(payload)
    } catch (err) {
      next(err)
    }
  })

  return router
}
