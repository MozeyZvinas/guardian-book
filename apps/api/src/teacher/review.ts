import { and, asc, eq } from 'drizzle-orm'
import {
  TEACHER_ORIGIN_LABEL,
  originForFeedback,
  provenanceColumns,
  publicOriginLabel,
  type AttemptReviewResponse,
  type ConfirmReviewBody,
  type FeedbackBody,
  type FeedbackView,
  type ProposalStep,
  type ReviewAttemptResponse,
  type ReviewStep,
  type ReviewView,
} from '@guardian-book/shared'
import { can } from '../access/index.js'
import { attemptStatusOf, type StoredStep } from '../assessment/service.js'
import { recordAudit } from '../audit/record.js'
import type { Actor } from '../auth/session.js'
import type { Db, DbOrTx } from '../db/client.js'
import { assessments, attempts, classMembers, classes, guidelineSteps, items, modelRuns, profiles, reviewFeedback, reviews } from '../db/schema.js'
import { appendEvent } from '../evidence/append.js'
import { HttpError, notFound } from '../lib/http.js'
import { reviewEvidencePayload, type OutcomeStep } from './outcomes.js'

/**
 * T3a · Review (spec 03 §2 `reviews`, §3 step 4, §4, §5, §9.1 `review_feedback`; spec 05
 * §4.4 T3a, §9; brief B07 §3). The model's proposal is read from `assessments` and never
 * written again; the teacher's decision is a `reviews` row (one per assessment) with an
 * optimistic lock on `version`; release only after confirm; her words are `review_feedback`
 * rows with an origin and an audience. Confirm and release append events with
 * `basis = teacher_confirmed`, which override the model's for that attempt (spec 03 §3).
 */

export const staleVersion = () => new HttpError(409, 'stale_version', 'Someone changed this result since you opened it. Reload to see the latest.')
export const notConfirmed = () => new HttpError(409, 'not_confirmed', 'Confirm the marks before releasing them.')
export const alreadyReleased = () => new HttpError(409, 'already_released', 'This result has been released; it cannot change.')
export const notAssessed = () => new HttpError(409, 'not_assessed', 'Nothing to confirm yet: the check has not finished.')
export const feedbackTextRequired = () => new HttpError(400, 'validation', 'Write the words you want them to see.', [{ path: 'text', message: 'Required for correct and add.' }])

/** The step shape stored on `reviews.steps` (spec 03 §2): the proposal's fields with the teacher's award. */
export interface ReviewStoredStep {
  step_id: string
  step_no: number
  skill_tag: string
  awarded: number
  available: number
  confidence: 'high'
  evidence: string
  feedback: string
  box: number[] | null
}

type ReviewRow = typeof reviews.$inferSelect
type FeedbackRow = typeof reviewFeedback.$inferSelect

const asStoredSteps = (value: unknown): StoredStep[] => (Array.isArray(value) ? (value as StoredStep[]) : [])
const asReviewSteps = (value: unknown): ReviewStoredStep[] => (Array.isArray(value) ? (value as ReviewStoredStep[]) : [])

export function reviewView(row: ReviewRow): ReviewView {
  const steps: ReviewStep[] = asReviewSteps(row.steps).map((step) => ({ stepId: step.step_id, stepNo: step.step_no, skillTag: step.skill_tag, awarded: step.awarded, available: step.available }))
  return {
    id: row.id,
    state: row.state,
    version: row.version,
    steps,
    total: row.total,
    comment: row.comment,
    confirmedAt: row.confirmedAt.toISOString(),
    releasedAt: row.releasedAt?.toISOString() ?? null,
  }
}

function feedbackView(row: FeedbackRow): FeedbackView {
  return { id: row.id, kind: row.kind, text: row.text, audience: row.audience, origin: row.origin, originLabel: TEACHER_ORIGIN_LABEL[row.origin], createdAt: row.createdAt.toISOString() }
}

const outcomeSteps = (steps: ReviewStoredStep[]): OutcomeStep[] =>
  steps.map((step) => ({ stepId: step.step_id, stepNo: step.step_no, criterion: '', skillTag: step.skill_tag, awarded: step.awarded, available: step.available }))

// ── reading ────────────────────────────────────────────────────────────────────────────────

async function loadAttempt(db: DbOrTx, attemptId: string) {
  const [row] = await db
    .select({ attempt: attempts, item: items, assessment: assessments, nickname: profiles.nickname })
    .from(attempts)
    .innerJoin(items, eq(items.id, attempts.itemId))
    .innerJoin(profiles, eq(profiles.userId, attempts.learnerId))
    .leftJoin(assessments, eq(assessments.attemptId, attempts.id))
    .where(eq(attempts.id, attemptId))
    .limit(1)
  if (!row) throw notFound()
  return row
}

/** The teacher's full view of one attempt: work, guideline, proposal, checks, review, feedback. */
export async function reviewAttemptView(db: Db, actor: Actor, attemptId: string): Promise<ReviewAttemptResponse> {
  if (!(await can(db, actor, 'review.write', { type: 'attempt', id: attemptId }))) throw notFound()
  const row = await loadAttempt(db, attemptId)
  const guideline = await db.select().from(guidelineSteps).where(eq(guidelineSteps.itemId, row.item.id)).orderBy(asc(guidelineSteps.stepNo))
  const proposed = new Map(asStoredSteps(row.assessment?.steps).map((step) => [step.step_id, step]))
  const steps: ProposalStep[] = guideline.map((step) => {
    const p = proposed.get(step.id)
    return {
      stepId: step.id,
      stepNo: step.stepNo,
      stepType: step.stepType,
      criterion: step.criterion,
      notes: step.notes,
      skillTag: step.skillTag,
      marks: step.marks,
      proposed: p ? { awarded: p.awarded, confidence: p.confidence, evidence: p.evidence, feedback: p.feedback, misconceptionTag: p.misconception_tag, hint: p.hint, box: p.box } : null,
    }
  })
  const runs = await db
    .select()
    .from(modelRuns)
    .where(and(eq(modelRuns.subjectType, 'attempt'), eq(modelRuns.subjectId, attemptId), eq(modelRuns.purpose, 'assess')))
    .orderBy(asc(modelRuns.createdAt), asc(modelRuns.attemptNo))
  const review = row.assessment ? ((await db.select().from(reviews).where(eq(reviews.assessmentId, row.assessment.id)).limit(1))[0] ?? null) : null
  const feedback = review ? await db.select().from(reviewFeedback).where(eq(reviewFeedback.reviewId, review.id)).orderBy(asc(reviewFeedback.createdAt)) : []
  const [membership] = await db
    .select({ classId: classMembers.classId })
    .from(classMembers)
    .innerJoin(classes, eq(classes.id, classMembers.classId))
    .where(and(eq(classMembers.learnerId, row.attempt.learnerId), eq(classes.teacherId, actor.userId)))
    .limit(1)

  const assessment = row.assessment
  return {
    attempt: {
      id: row.attempt.id,
      learner: { id: row.attempt.learnerId, nickname: row.nickname },
      classId: membership?.classId ?? null,
      itemId: row.item.id,
      itemSlug: row.item.slug,
      itemTopic: row.item.topic,
      itemPromptMd: row.item.promptMd,
      itemRevision: row.attempt.itemRevision,
      maxMarks: row.item.maxMarks,
      kind: row.attempt.kind,
      mode: row.attempt.mode,
      status: attemptStatusOf(row.attempt, assessment),
      answerText: row.attempt.answerText,
      hasImage: row.attempt.imageKey !== null,
      createdAt: row.attempt.createdAt.toISOString(),
    },
    steps,
    assessment: assessment
      ? {
          id: assessment.id,
          status: assessment.status,
          total: assessment.total,
          ambiguityReasons: assessment.ambiguityReasons,
          transcriptionConfidence: assessment.transcriptionConfidence === null ? null : assessment.transcriptionConfidence >= 1 ? 'high' : assessment.transcriptionConfidence >= 0.5 ? 'medium' : 'low',
          modelId: assessment.modelId,
          promptVersion: assessment.promptVersion,
          latencyMs: assessment.latencyMs,
          createdAt: assessment.createdAt.toISOString(),
        }
      : null,
    runs: runs.map((run) => ({
      id: run.id,
      attemptNo: run.attemptNo,
      status: run.status,
      checks: Array.isArray(run.checks) ? (run.checks as Array<{ code: string; passed: boolean; detail: string }>) : [],
      modelId: run.modelId,
      promptVersion: run.promptVersion,
      latencyMs: run.latencyMs,
      costUsd: Number(run.costUsd),
      createdAt: run.createdAt.toISOString(),
    })),
    review: review ? reviewView(review) : null,
    feedback: feedback.map(feedbackView),
  }
}

/**
 * `GET /api/attempts/:id/review`: the owner sees the review once released and the feedback
 * meant for learners; the class teacher sees everything; a guardian sees nothing (404).
 * `teacher_only` rows never leave the teacher space (spec 03 §9.1).
 */
export async function attemptReviewForActor(db: Db, actor: Actor, attemptId: string): Promise<AttemptReviewResponse> {
  if (!(await can(db, actor, 'review.read', { type: 'attempt', id: attemptId }))) throw notFound()
  const [row] = await db
    .select({ review: reviews, teacherNickname: profiles.nickname })
    .from(assessments)
    .innerJoin(reviews, eq(reviews.assessmentId, assessments.id))
    .innerJoin(profiles, eq(profiles.userId, reviews.teacherId))
    .where(eq(assessments.attemptId, attemptId))
    .limit(1)
  if (!row) return { review: null, feedback: [] }
  const teacher = actor.role === 'teacher' || actor.role === 'admin'
  if (!teacher && row.review.state !== 'released') return { review: null, feedback: [] }
  const rows = await db.select().from(reviewFeedback).where(eq(reviewFeedback.reviewId, row.review.id)).orderBy(asc(reviewFeedback.createdAt))
  const visible = teacher ? rows : rows.filter((f) => f.audience === 'learner')
  return {
    review: reviewView(row.review),
    feedback: visible.map((f) => ({
      id: f.id,
      kind: f.kind,
      text: f.text,
      audience: f.audience,
      origin: f.origin,
      label: teacher ? TEACHER_ORIGIN_LABEL[f.origin] : publicOriginLabel(f.origin, row.teacherNickname),
      createdAt: f.createdAt.toISOString(),
    })),
  }
}

// ── confirm ────────────────────────────────────────────────────────────────────────────────

/** Pure: the teacher's awards over the guideline, every step exactly once, each within its marks. */
export function buildReviewSteps(
  guideline: Array<{ id: string; stepNo: number; marks: number; skillTag: string }>,
  proposal: StoredStep[],
  awards: Array<{ stepId: string; awarded: number }>,
): { steps: ReviewStoredStep[]; total: number } {
  const byStep = new Map(awards.map((award) => [award.stepId, award.awarded]))
  if (byStep.size !== awards.length) throw new HttpError(400, 'validation', 'Each step appears once.', [{ path: 'steps', message: 'duplicate step' }])
  const proposed = new Map(proposal.map((step) => [step.step_id, step]))
  const steps: ReviewStoredStep[] = []
  for (const step of guideline) {
    const awarded = byStep.get(step.id)
    if (awarded === undefined) throw new HttpError(400, 'validation', 'Award every step.', [{ path: 'steps', message: `step ${step.stepNo} missing` }])
    if (awarded > step.marks) throw new HttpError(400, 'validation', `Step ${step.stepNo} has ${step.marks} mark(s).`, [{ path: 'steps', message: `step ${step.stepNo} over its marks` }])
    const p = proposed.get(step.id)
    steps.push({
      step_id: step.id,
      step_no: step.stepNo,
      skill_tag: step.skillTag,
      awarded,
      available: step.marks,
      confidence: 'high',
      evidence: p?.evidence ?? '',
      feedback: p?.feedback ?? '',
      box: p?.box ?? null,
    })
  }
  const extra = awards.filter((award) => !guideline.some((step) => step.id === award.stepId))
  if (extra.length > 0) throw new HttpError(400, 'validation', 'Unknown step.', [{ path: 'steps', message: 'a step is not in this guideline' }])
  return { steps, total: steps.reduce((acc, step) => acc + step.awarded, 0) }
}

export async function confirmReview(db: Db, actor: Actor, attemptId: string, body: ConfirmReviewBody, requestId?: string): Promise<ReviewView> {
  if (!(await can(db, actor, 'review.write', { type: 'attempt', id: attemptId }))) throw notFound()
  const row = await loadAttempt(db, attemptId)
  const assessment = row.assessment
  if (!assessment) throw notAssessed()
  const guideline = await db.select().from(guidelineSteps).where(eq(guidelineSteps.itemId, row.item.id)).orderBy(asc(guidelineSteps.stepNo))
  const { steps, total } = buildReviewSteps(guideline, asStoredSteps(assessment.steps), body.steps)
  const comment = body.comment ?? null
  const now = new Date()

  return db.transaction(async (tx) => {
    const [existing] = await tx.select().from(reviews).where(eq(reviews.assessmentId, assessment.id)).for('update').limit(1)
    let saved: ReviewRow
    if (existing) {
      if (existing.state === 'released') throw alreadyReleased()
      if (body.version === undefined || body.version !== existing.version) throw staleVersion()
      const [updated] = await tx
        .update(reviews)
        .set({ steps, total, comment, teacherId: actor.userId, version: existing.version + 1, confirmedAt: now })
        .where(and(eq(reviews.id, existing.id), eq(reviews.version, existing.version)))
        .returning()
      if (!updated) throw staleVersion()
      saved = updated
    } else {
      if (body.version !== undefined && body.version !== 0) throw staleVersion()
      const [inserted] = await tx
        .insert(reviews)
        .values({ assessmentId: assessment.id, teacherId: actor.userId, steps, total, comment, state: 'confirmed', version: 1, confirmedAt: now, ...provenanceColumns('teacher_review') })
        .returning()
      if (!inserted) throw new Error('review insert returned no row')
      saved = inserted
    }
    await appendEvent(tx, {
      learnerId: row.attempt.learnerId,
      kind: 'review_confirmed',
      attemptId,
      itemId: row.item.id,
      skillTag: null,
      basis: 'teacher_confirmed',
      payload: reviewEvidencePayload(outcomeSteps(steps), row.attempt.mode, { review_id: saved.id, total, max_marks: row.item.maxMarks, version: saved.version }),
    })
    await recordAudit(tx, { actorId: actor.userId, action: 'review.confirmed', subjectType: 'review', subjectId: saved.id, outcome: 'ok', requestId: requestId ?? null })
    return reviewView(saved)
  })
}

// ── release ────────────────────────────────────────────────────────────────────────────────

export async function releaseReview(db: Db, actor: Actor, target: { reviewId: string } | { attemptId: string }, version: number, requestId?: string): Promise<ReviewView> {
  let reviewId: string
  if ('attemptId' in target) {
    if (!(await can(db, actor, 'review.write', { type: 'attempt', id: target.attemptId }))) throw notFound()
    const [found] = await db
      .select({ id: reviews.id })
      .from(assessments)
      .innerJoin(reviews, eq(reviews.assessmentId, assessments.id))
      .where(eq(assessments.attemptId, target.attemptId))
      .limit(1)
    if (!found) throw notConfirmed() // release before confirm → 409 (spec 03 §4)
    reviewId = found.id
  } else {
    reviewId = target.reviewId
  }
  const [found] = await db
    .select({ attemptId: assessments.attemptId })
    .from(reviews)
    .innerJoin(assessments, eq(assessments.id, reviews.assessmentId))
    .where(eq(reviews.id, reviewId))
    .limit(1)
  if (!found || !(await can(db, actor, 'review.write', { type: 'attempt', id: found.attemptId }))) throw notFound()
  const row = await loadAttempt(db, found.attemptId)
  const now = new Date()

  return db.transaction(async (tx) => {
    const [existing] = await tx.select().from(reviews).where(eq(reviews.id, reviewId)).for('update').limit(1)
    if (!existing) throw notFound()
    if (existing.state === 'released') throw alreadyReleased()
    if (existing.version !== version) throw staleVersion()
    const [updated] = await tx
      .update(reviews)
      .set({ state: 'released', releasedAt: now, version: existing.version + 1 })
      .where(and(eq(reviews.id, reviewId), eq(reviews.version, existing.version)))
      .returning()
    if (!updated) throw staleVersion()
    const steps = asReviewSteps(updated.steps)
    await appendEvent(tx, {
      learnerId: row.attempt.learnerId,
      kind: 'review_released',
      attemptId: row.attempt.id,
      itemId: row.item.id,
      skillTag: null,
      basis: 'teacher_confirmed',
      payload: reviewEvidencePayload(outcomeSteps(steps), row.attempt.mode, { review_id: updated.id, total: updated.total, max_marks: row.item.maxMarks, version: updated.version }),
    })
    await recordAudit(tx, { actorId: actor.userId, action: 'review.released', subjectType: 'review', subjectId: updated.id, outcome: 'ok', requestId: requestId ?? null })
    return reviewView(updated)
  })
}

// ── feedback ───────────────────────────────────────────────────────────────────────────────

export async function addFeedback(db: Db, actor: Actor, reviewId: string, body: FeedbackBody, requestId?: string): Promise<FeedbackView> {
  const [found] = await db
    .select({ attemptId: assessments.attemptId, learnerId: attempts.learnerId, itemId: attempts.itemId })
    .from(reviews)
    .innerJoin(assessments, eq(assessments.id, reviews.assessmentId))
    .innerJoin(attempts, eq(attempts.id, assessments.attemptId))
    .where(eq(reviews.id, reviewId))
    .limit(1)
  if (!found || !(await can(db, actor, 'review.write', { type: 'attempt', id: found.attemptId }))) throw notFound()
  if (body.kind !== 'agree' && !body.text) throw feedbackTextRequired()
  const origin = originForFeedback(body.kind)

  return db.transaction(async (tx) => {
    const [row] = await tx
      .insert(reviewFeedback)
      .values({ reviewId, kind: body.kind, text: body.text ?? null, audience: body.audience, origin, createdBy: actor.userId })
      .returning()
    if (!row) throw new Error('review_feedback insert returned no row')
    await appendEvent(tx, {
      learnerId: found.learnerId,
      kind: 'feedback_teacher_added',
      attemptId: found.attemptId,
      itemId: found.itemId,
      basis: 'none',
      payload: { review_id: reviewId, feedback_id: row.id, kind: body.kind, audience: body.audience, origin },
    })
    await recordAudit(tx, { actorId: actor.userId, action: 'review.feedback_added', subjectType: 'review_feedback', subjectId: row.id, outcome: 'ok', requestId: requestId ?? null })
    return feedbackView(row)
  })
}
