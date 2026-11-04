import { and, asc, count, eq } from 'drizzle-orm'
import { Router } from 'express'
import { evidencePayload, fixAttemptBodySchema, provenanceColumns, uuidv7, type AttemptFixView, type FixAttemptResponse } from '@guardian-book/shared'
import { can } from '../access/index.js'
import { recordAudit } from '../audit/record.js'
import { requireActor, requireRole } from '../auth/session.js'
import type { Db, DbOrTx } from '../db/client.js'
import { assessments, attempts, learningEvents } from '../db/schema.js'
import { appendEvent } from '../evidence/append.js'
import type { PracticeDeps } from '../inputs/deps.js'
import { isMultipart, readMultipart } from '../inputs/multipart.js'
import { HttpError, notFound, parse, requestIdOf, uuidParam } from '../lib/http.js'
import { budgetExhausted, checkCaps } from '../modelRuns/index.js'
import { schedulePlanForGap } from '../plans/service.js'
import { assertUploadSize, extensionFor, prepareImage, sniffMediaType, unsupportedFile } from '../storage/images.js'
import { storageNotConfigured } from '../storage/index.js'
import { modelNotConfigured, pdfNotMarkable, startAssessment, type StoredStep } from './service.js'

/**
 * Fix it, then check it alone (P0-05; spec 03 §8.3 `POST /api/attempts/:id/fix`, §9.1;
 * brief B06 §1–2). A retry is a child attempt on the same item, assessed only for the
 * steps the original lost. A pass on the FIRST retry appends `fixed_independently`; a
 * later retry never does ("fixed on their own" is counted once). Independent and
 * retention attempts append their own completion events once assessed, and a lost step on
 * any proposed assessment triggers the Help Plan the same day.
 */

export const nothingToFix = () => new HttpError(409, 'nothing_to_fix', 'There is no lost step to fix on this one yet.')

export const fixIdempotencyKey = (parentAttemptId: string, retryNo: number): string => `fix:${parentAttemptId}:${retryNo}`

/** The retry number a fix attempt's idempotency key carries, or null for an ordinary attempt. */
export function retryNoOf(idempotencyKey: string): number | null {
  const match = /^fix:[0-9a-f-]{36}:(\d+)$/.exec(idempotencyKey)
  return match ? Number(match[1]) : null
}

/** The steps a retry sets out to fix: every step the original lost marks on. */
export function targetStepNos(parentSteps: readonly Pick<StoredStep, 'step_no' | 'awarded' | 'available'>[]): number[] {
  return parentSteps.filter((step) => step.awarded < step.available).map((step) => step.step_no)
}

/** "Fixed on their own": the first retry, and every target step now fully earned. */
export function fixedOnFirstRetry(retryNo: number, targets: readonly number[], steps: readonly Pick<StoredStep, 'step_no' | 'awarded' | 'available'>[]): boolean {
  if (retryNo !== 1 || targets.length === 0) return false
  return targets.every((stepNo) => steps.some((step) => step.step_no === stepNo && step.awarded >= step.available))
}

const asSteps = (value: unknown): StoredStep[] => (Array.isArray(value) ? (value as StoredStep[]) : [])

/** The parent's lost steps (what a retry is marked on), or null when the parent has no proposed result. */
export async function fixTargetsFor(db: DbOrTx, parentAttemptId: string): Promise<{ stepNos: number[]; steps: StoredStep[] } | null> {
  const [row] = await db.select({ status: assessments.status, steps: assessments.steps }).from(assessments).where(eq(assessments.attemptId, parentAttemptId)).limit(1)
  if (!row || row.status !== 'proposed') return null
  const steps = asSteps(row.steps)
  const stepNos = targetStepNos(steps)
  return stepNos.length > 0 ? { stepNos, steps: steps.filter((step) => stepNos.includes(step.step_no)) } : null
}

/** What `GET /api/attempts/:id` says about a retry. */
export async function fixView(db: DbOrTx, attempt: { id: string; parentAttemptId: string | null; idempotencyKey: string }, assessed: boolean): Promise<AttemptFixView | null> {
  if (!attempt.parentAttemptId) return null
  const targets = await fixTargetsFor(db, attempt.parentAttemptId)
  const [fixed] = await db.select({ id: learningEvents.id }).from(learningEvents).where(and(eq(learningEvents.attemptId, attempt.id), eq(learningEvents.kind, 'fixed_independently'))).limit(1)
  return {
    parentAttemptId: attempt.parentAttemptId,
    retryNo: retryNoOf(attempt.idempotencyKey) ?? 1,
    targetStepNos: targets?.stepNos ?? [],
    fixedIndependently: assessed ? Boolean(fixed) : null,
  }
}

interface ProposedAttempt {
  id: string
  learnerId: string
  itemId: string
  mode: 'assisted' | 'independent' | 'retention'
  parentAttemptId: string | null
  idempotencyKey: string
}

/**
 * After a proposed assessment is written (called by the assessment job): the loop's events
 * and the same-day plan trigger. Everything here is append-only evidence; the `assessed`
 * event already moved the Brain, and a second statement about the same attempt and skill
 * resolves to one outcome in the reducer.
 */
export async function afterProposed(deps: PracticeDeps, attempt: ProposedAttempt, steps: StoredStep[], basis: 'model_high' | 'none'): Promise<void> {
  const { db } = deps
  const lost = steps.filter((step) => step.awarded < step.available)
  const skillsCorrect = [...new Set(steps.filter((step) => step.awarded >= step.available).map((step) => step.skill_tag))]
  const skillsLost = [...new Set(lost.map((step) => step.skill_tag))]

  if (attempt.parentAttemptId) {
    const retryNo = retryNoOf(attempt.idempotencyKey) ?? 1
    const targets = await fixTargetsFor(db, attempt.parentAttemptId)
    if (targets && fixedOnFirstRetry(retryNo, targets.stepNos, steps)) {
      await appendEvent(db, {
        learnerId: attempt.learnerId,
        kind: 'fixed_independently',
        attemptId: attempt.id,
        itemId: attempt.itemId,
        skillTag: targets.steps[0]?.skill_tag ?? null,
        basis,
        payload: evidencePayload({ skills_correct: skillsCorrect, mode: 'assisted' }, { retry_of: attempt.parentAttemptId, retry_no: retryNo }),
      })
    }
  }

  if (attempt.mode === 'independent' || attempt.mode === 'retention') {
    await appendEvent(db, {
      learnerId: attempt.learnerId,
      kind: attempt.mode === 'independent' ? 'independent_check_completed' : 'retention_check_completed',
      attemptId: attempt.id,
      itemId: attempt.itemId,
      skillTag: skillsLost[0] ?? skillsCorrect[0] ?? null,
      basis,
      payload: evidencePayload({ skills_correct: skillsCorrect, skills_lost: skillsLost, mode: attempt.mode }, { passed: lost.length === 0 }),
    })
  }

  // A gap detected today: the Help Plan is issued the same day (brief B06 §4).
  const gap = lost[0]?.skill_tag
  if (gap) await schedulePlanForGap(deps, attempt.learnerId, gap)
}

export function fixRouter(deps: PracticeDeps): Router {
  const router = Router()

  router.post('/api/attempts/:id/fix', requireRole('learner'), async (req, res, next) => {
    try {
      const actor = requireActor(res)
      const parentId = uuidParam(req, 'id')
      if (!(await can(deps.db, actor, 'attempt.fix', { type: 'attempt', id: parentId }))) throw notFound()

      const [parent] = await deps.db.select().from(attempts).where(eq(attempts.id, parentId)).limit(1)
      if (!parent) throw notFound()
      const targets = await fixTargetsFor(deps.db, parentId)
      if (!targets) throw nothingToFix()

      // Typed text as JSON, or a photo as multipart (`file`); PDFs cannot be marked.
      let answerText: string | null = null
      let image: { bytes: Buffer; mediaType: 'image/jpeg' | 'image/png' | 'image/webp' } | null = null
      if (isMultipart(req)) {
        const body = await readMultipart(req)
        if (body.file) {
          assertUploadSize(body.file.bytes)
          const mediaType = sniffMediaType(body.file.bytes)
          if (!mediaType) throw unsupportedFile()
          if (mediaType === 'application/pdf') throw pdfNotMarkable()
          image = { bytes: body.file.bytes, mediaType }
        } else {
          answerText = parse(fixAttemptBodySchema, body.fields).answerText
        }
      } else {
        answerText = parse(fixAttemptBodySchema, req.body).answerText
      }

      if (!deps.gateway.configured) throw modelNotConfigured()
      const cap = await checkCaps(deps.db, actor.userId, deps.limits, deps.now())
      if (!cap.ok) throw budgetExhausted(cap.reason)

      let imageKey: string | null = null
      if (image) {
        if (!deps.storage) throw storageNotConfigured()
        const prepared = await prepareImage(image.bytes, image.mediaType)
        imageKey = `fixes/${actor.userId}/${uuidv7()}.${extensionFor(image.mediaType)}`
        await deps.storage.putObject(imageKey, prepared.buffer, image.mediaType)
      }

      const [existing] = await deps.db.select({ children: count() }).from(attempts).where(eq(attempts.parentAttemptId, parentId))
      const retryNo = Number(existing?.children ?? 0) + 1
      const attemptId = await createFixAttempt(deps.db, {
        parent,
        retryNo,
        answerText,
        imageKey,
        actorId: actor.userId,
        requestId: requestIdOf(req),
        targetStepNos: targets.stepNos,
      })
      const decision = await startAssessment(deps, attemptId)
      const payload: FixAttemptResponse = { attemptId, parentAttemptId: parentId, retryNo, status: decision === 'done' ? 'done' : 'assessing' }
      res.setHeader('Cache-Control', 'no-store')
      res.status(202).json(payload)
    } catch (err) {
      next(err)
    }
  })

  return router
}

interface CreateFixInput {
  parent: typeof attempts.$inferSelect
  retryNo: number
  answerText: string | null
  imageKey: string | null
  actorId: string
  requestId: string | undefined
  targetStepNos: number[]
}

async function createFixAttempt(db: Db, input: CreateFixInput): Promise<string> {
  return db.transaction(async (tx) => {
    const [row] = await tx
      .insert(attempts)
      .values({
        learnerId: input.parent.learnerId,
        itemId: input.parent.itemId,
        itemRevision: input.parent.itemRevision,
        kind: input.imageKey ? 'photo' : 'typed',
        mode: 'assisted',
        answerText: input.imageKey ? null : input.answerText,
        imageKey: input.imageKey,
        parentAttemptId: input.parent.id,
        idempotencyKey: fixIdempotencyKey(input.parent.id, input.retryNo),
        ...provenanceColumns('learner_work'),
      })
      .returning({ id: attempts.id })
    if (!row) throw new Error('fix attempt insert returned no row')
    await appendEvent(tx, {
      learnerId: input.parent.learnerId,
      kind: 'attempt_submitted',
      attemptId: row.id,
      itemId: input.parent.itemId,
      skillTag: null,
      basis: 'none',
      payload: { mode: 'assisted', kind: input.imageKey ? 'photo' : 'typed', retry_of: input.parent.id, retry_no: input.retryNo, target_steps: input.targetStepNos },
    })
    await recordAudit(tx, { actorId: input.actorId, action: 'attempt.fix_created', subjectType: 'attempt', subjectId: row.id, outcome: 'ok', requestId: input.requestId ?? null })
    return row.id
  })
}

/** Retries of an attempt, oldest first (the fix screen shows the latest). */
export async function retriesOf(db: DbOrTx, parentAttemptId: string): Promise<string[]> {
  const rows = await db.select({ id: attempts.id }).from(attempts).where(eq(attempts.parentAttemptId, parentAttemptId)).orderBy(asc(attempts.createdAt))
  return rows.map((row) => row.id)
}
