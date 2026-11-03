import { and, asc, desc, eq, isNull, lt } from 'drizzle-orm'
import {
  evidencePayload,
  provenanceColumns,
  workCheckOutputSchema,
  type AssessedStep,
  type AttemptMode,
  type AttemptResponse,
  type AttemptStatus,
  type Confidence,
  type WorkCheckOutput,
} from '@guardian-book/shared'
import { can } from '../access/index.js'
import { recordAudit } from '../audit/record.js'
import type { Actor } from '../auth/session.js'
import type { Db, DbOrTx } from '../db/client.js'
import { assessments, attempts, classMembers, guidelineApprovals, guidelineSteps, inputs, items } from '../db/schema.js'
import { appendEvent } from '../evidence/append.js'
import { PromptSafetyError } from '../gateway/promptSafety.js'
import {
  WORK_CHECK_MAX_TOKENS,
  WORK_CHECK_PROMPT_VERSION,
  WORK_CHECK_TIMEOUT_MS,
  buildWorkCheckSystem,
  buildWorkCheckUser,
  workCheckContext,
  type WorkCheckAnswer,
  type WorkCheckGuidelineStep,
  type WorkCheckPromptInput,
} from '../gateway/prompts/workCheck.v1.js'
import type { VerifiedRun } from '../gateway/verifiedCall.js'
import { scrubContacts } from '../inputs/text.js'
import type { PracticeDeps } from '../inputs/deps.js'
import { HttpError, notFound } from '../lib/http.js'
import type { Logger } from '../logger.js'
import { runModel } from '../modelRuns/index.js'
import { extensionFor } from '../storage/images.js'
import { clampBoxes } from '../verify/checks/work.js'

/**
 * The homework check (spec 02 P0-04; spec 03 §2, §3, §6, §9.1; brief B04 §3).
 *
 * An input of kind `work` on an approved item whose guideline the learner's class teacher
 * has approved becomes an `attempt`. Assessment runs in the background: the route answers
 * 202 at once, the learner polls. Every model call is a `model_runs` row; the assessment
 * row is written once (`proposed` when the verifier accepted the output, `uncertain`
 * otherwise, never an invented mark); the Brain gets `attempt_submitted` and `assessed`.
 */

export const ASSESSING_STUCK_MS = 5 * 60 * 1000
/** The whole run (up to three model calls) gives up here and the attempt becomes `uncertain`. */
export const ASSESSMENT_DEADLINE_MS = 120_000

export const guidelineNotApproved = () =>
  new HttpError(409, 'guideline_not_approved', 'Your teacher has not approved the marking guideline for this question yet. Ask them, then try again.')
export const modelNotConfigured = () => new HttpError(503, 'model_not_configured', 'Model not configured; marking is paused. Your work is saved.')
export const pdfNotMarkable = () => new HttpError(400, 'pdf_not_markable', 'A PDF cannot be marked yet. Snap a photo of the working instead.')

type ItemRow = typeof items.$inferSelect
type AttemptRow = typeof attempts.$inferSelect
type StepRow = typeof guidelineSteps.$inferSelect

/** The shape stored in `assessments.steps` (spec 03 §2 plus the v2 fields), snake_case. */
export interface StoredStep {
  step_id: string
  step_no: number
  skill_tag: string
  awarded: number
  available: number
  confidence: Confidence
  evidence: string
  feedback: string
  misconception_tag: string | null
  hint: string | null
  box: number[] | null
}

const stepKey = (stepNo: number): string => `S${stepNo}`

/** The approved item, or 404; then 409 unless a class the learner is in has this revision approved (spec 03 §9.1). */
export async function approvedItemFor(db: DbOrTx, learnerId: string, itemId: string): Promise<ItemRow> {
  const [item] = await db
    .select()
    .from(items)
    .where(and(eq(items.id, itemId), eq(items.status, 'approved')))
    .limit(1)
  if (!item) throw notFound()
  const [approval] = await db
    .select({ classId: guidelineApprovals.classId })
    .from(guidelineApprovals)
    .innerJoin(classMembers, and(eq(classMembers.classId, guidelineApprovals.classId), eq(classMembers.learnerId, learnerId)))
    .where(and(eq(guidelineApprovals.itemId, itemId), eq(guidelineApprovals.itemRevision, item.revision)))
    .limit(1)
  if (!approval) throw guidelineNotApproved()
  return item
}

export interface CreateAttemptInput {
  learnerId: string
  input: { id: string; text: string | null; objectKey: string | null }
  item: ItemRow
  mode: AttemptMode
  requestId?: string | undefined
}

/** One attempt per input, keyed on the input ID: a replay returns the existing attempt. */
export async function createAttempt(db: Db, input: CreateAttemptInput): Promise<{ attemptId: string; replayed: boolean }> {
  const idempotencyKey = `input:${input.input.id}`
  const [existing] = await db
    .select({ id: attempts.id })
    .from(attempts)
    .where(and(eq(attempts.learnerId, input.learnerId), eq(attempts.idempotencyKey, idempotencyKey)))
    .limit(1)
  if (existing) return { attemptId: existing.id, replayed: true }
  if (input.input.objectKey && input.input.objectKey.endsWith(`.${extensionFor('application/pdf')}`)) throw pdfNotMarkable()

  return db.transaction(async (tx) => {
    const [row] = await tx
      .insert(attempts)
      .values({
        learnerId: input.learnerId,
        itemId: input.item.id,
        itemRevision: input.item.revision,
        kind: input.input.objectKey ? 'photo' : 'typed',
        mode: input.mode,
        answerText: input.input.objectKey ? null : input.input.text,
        imageKey: input.input.objectKey,
        idempotencyKey,
        ...provenanceColumns('learner_work'),
      })
      .returning({ id: attempts.id })
    if (!row) throw new Error('attempt insert returned no row')
    await tx.update(inputs).set({ attemptId: row.id }).where(eq(inputs.id, input.input.id))
    await appendEvent(tx, {
      learnerId: input.learnerId,
      kind: 'attempt_submitted',
      attemptId: row.id,
      itemId: input.item.id,
      skillTag: null,
      basis: 'none',
      payload: { mode: input.mode, kind: input.input.objectKey ? 'photo' : 'typed', item_revision: input.item.revision },
    })
    await recordAudit(tx, {
      actorId: input.learnerId,
      action: 'attempt.created',
      subjectType: 'attempt',
      subjectId: row.id,
      outcome: 'ok',
      requestId: input.requestId ?? null,
    })
    return { attemptId: row.id, replayed: false }
  })
}

const jobKey = (attemptId: string): string => `assess:${attemptId}`

/**
 * Starts the background assessment unless one is running or done. Idempotent: a second
 * call while running answers `assessing` again; after a restart the flag may be set with
 * no job behind it, in which case the run starts again (the assessment row is still the
 * only "done" signal).
 */
export async function startAssessment(deps: PracticeDeps, attemptId: string): Promise<'started' | 'assessing' | 'done'> {
  const now = deps.now()
  const decision = await deps.db.transaction(async (tx) => {
    const [row] = await tx
      .select({ id: attempts.id, assessingStartedAt: attempts.assessingStartedAt, assessmentId: assessments.id })
      .from(attempts)
      .leftJoin(assessments, eq(assessments.attemptId, attempts.id))
      .where(eq(attempts.id, attemptId))
      .for('update', { of: attempts })
      .limit(1)
    if (!row) throw notFound()
    if (row.assessmentId) return 'done' as const
    if (row.assessingStartedAt && deps.jobs.isRunning(jobKey(attemptId))) return 'assessing' as const
    await tx.update(attempts).set({ assessingStartedAt: now }).where(eq(attempts.id, attemptId))
    return 'started' as const
  })
  if (decision === 'started') {
    deps.jobs.start(jobKey(attemptId), () => runAssessment(deps, attemptId))
  }
  return decision
}

export function isAssessing(deps: PracticeDeps, attemptId: string): boolean {
  return deps.jobs.isRunning(jobKey(attemptId))
}

interface WriteAssessmentInput {
  attempt: Pick<AttemptRow, 'id' | 'learnerId' | 'itemId' | 'mode'>
  status: 'proposed' | 'uncertain'
  total: number | null
  steps: StoredStep[]
  reasons: string[]
  transcriptionConfidence: Confidence | null
  modelId: string
  latencyMs: number
  costUsd: number
  requestId: string
  /** The `model_runs` row the output came from, or null when no call produced it. */
  modelRunId: string | null
  provenanceModel: { provider: string; model: string } | null
}

const confidenceToReal = (confidence: Confidence | null): number | null =>
  confidence === null ? null : confidence === 'high' ? 1 : confidence === 'medium' ? 0.5 : 0

/**
 * What the `assessed` event tells the Brain (B05's `evidencePayload`, the one shape that
 * moves skill state, D37): the tags of fully earned steps and the tags of steps that lost
 * marks, each de-duplicated and in step order. A tag in both lists counts as lost.
 */
export function assessedSkills(steps: readonly Pick<StoredStep, 'skill_tag' | 'awarded' | 'available'>[]): { skillsCorrect: string[]; skillsLost: string[] } {
  const skillsCorrect = [...new Set(steps.filter((step) => step.awarded >= step.available).map((step) => step.skill_tag))]
  const skillsLost = [...new Set(steps.filter((step) => step.awarded < step.available).map((step) => step.skill_tag))]
  return { skillsCorrect, skillsLost }
}

/** Writes the assessment row once, the `assessed` event, and clears the in-progress flag, in one transaction. */
export async function writeAssessment(db: Db, input: WriteAssessmentInput): Promise<string> {
  const allHigh = input.steps.length > 0 && input.steps.every((step) => step.confidence === 'high')
  const basis = input.status === 'proposed' && allHigh ? 'model_high' : 'none'
  const lost = input.steps.filter((step) => step.awarded < step.available)
  const { skillsCorrect, skillsLost } = assessedSkills(input.steps)
  const provenance =
    input.modelRunId && input.provenanceModel
      ? provenanceColumns('model_output', {
          provider: input.provenanceModel.provider,
          model: input.provenanceModel.model,
          version: WORK_CHECK_PROMPT_VERSION,
          model_run_id: input.modelRunId,
        })
      : // No model output stands behind this row (a stuck run, a refused call): the system wrote a placeholder.
        provenanceColumns('seed_person')

  return db.transaction(async (tx) => {
    const [row] = await tx
      .insert(assessments)
      .values({
        attemptId: input.attempt.id,
        status: input.status,
        total: input.total,
        steps: input.steps,
        ambiguityReasons: input.reasons,
        transcriptionConfidence: confidenceToReal(input.transcriptionConfidence),
        modelId: input.modelId,
        promptVersion: WORK_CHECK_PROMPT_VERSION,
        consistencyCheck: 'skipped',
        latencyMs: Math.max(0, Math.round(input.latencyMs)),
        costUsd: input.costUsd.toFixed(6),
        requestId: input.requestId,
        ...provenance,
      })
      .returning({ id: assessments.id })
    if (!row) throw new Error('assessment insert returned no row')
    await appendEvent(tx, {
      learnerId: input.attempt.learnerId,
      kind: 'assessed',
      attemptId: input.attempt.id,
      itemId: input.attempt.itemId,
      skillTag: lost[0]?.skill_tag ?? null,
      basis,
      payload: evidencePayload(
        { skills_correct: skillsCorrect, skills_lost: skillsLost, mode: input.attempt.mode },
        {
          status: input.status,
          total: input.total,
          max_marks: input.steps.reduce((acc, step) => acc + step.available, 0),
          lost_skills: skillsLost,
          all_high: allHigh,
        },
      ),
    })
    await tx.update(attempts).set({ assessingStartedAt: null }).where(eq(attempts.id, input.attempt.id))
    await recordAudit(tx, {
      actorId: input.attempt.learnerId,
      action: 'attempt.assessed',
      subjectType: 'assessment',
      subjectId: row.id,
      outcome: 'ok',
    })
    return row.id
  })
}

/** Maps the model's `S<n>` step IDs back to guideline rows; null when any ID is unknown. */
function toStoredSteps(output: WorkCheckOutput, steps: StepRow[]): StoredStep[] | null {
  const byKey = new Map(steps.map((step) => [stepKey(step.stepNo), step]))
  const stored: StoredStep[] = []
  for (const step of clampBoxes(output).steps) {
    const guideline = byKey.get(step.step_id)
    if (!guideline) return null
    stored.push({
      step_id: guideline.id,
      step_no: guideline.stepNo,
      skill_tag: guideline.skillTag,
      awarded: step.awarded,
      available: step.available,
      confidence: step.confidence,
      evidence: step.evidence,
      feedback: step.feedback,
      misconception_tag: step.misconception_tag,
      hint: step.hint,
      box: step.box,
    })
  }
  return stored.sort((a, b) => a.step_no - b.step_no)
}

/** The last run's output when it at least matches the schema: the teacher sees what the model proposed. */
function lastUsableOutput(runs: VerifiedRun[], steps: StepRow[]): { steps: StoredStep[]; transcriptionConfidence: Confidence } | null {
  for (const run of [...runs].reverse()) {
    const parsed = workCheckOutputSchema.safeParse(run.output)
    if (!parsed.success) continue
    const stored = toStoredSteps(parsed.data, steps)
    if (stored) return { steps: stored, transcriptionConfidence: parsed.data.transcription_confidence }
  }
  return null
}

/** The background job. Never throws past the registry: every path ends in a row or a cleared flag. */
export async function runAssessment(deps: PracticeDeps, attemptId: string): Promise<void> {
  const { db, logger } = deps
  const [row] = await db
    .select({ attempt: attempts, item: items })
    .from(attempts)
    .innerJoin(items, eq(items.id, attempts.itemId))
    .where(eq(attempts.id, attemptId))
    .limit(1)
  if (!row) return
  const [existing] = await db.select({ id: assessments.id }).from(assessments).where(eq(assessments.attemptId, attemptId)).limit(1)
  if (existing) {
    await db.update(attempts).set({ assessingStartedAt: null }).where(eq(attempts.id, attemptId))
    return
  }
  const steps = await db.select().from(guidelineSteps).where(eq(guidelineSteps.itemId, row.item.id)).orderBy(asc(guidelineSteps.stepNo))
  const attempt = row.attempt

  const uncertain = (reasons: string[], extra: Partial<WriteAssessmentInput> = {}): Promise<string> =>
    writeAssessment(db, {
      attempt,
      status: 'uncertain',
      total: null,
      steps: [],
      reasons,
      transcriptionConfidence: null,
      modelId: deps.gateway.model,
      latencyMs: 0,
      costUsd: 0,
      requestId: 'none',
      modelRunId: null,
      provenanceModel: null,
      ...extra,
    })

  try {
    await approvedItemFor(db, attempt.learnerId, row.item.id)
  } catch (err) {
    logger.warn('assessment refused: guideline not approved at run time', { attemptId })
    await uncertain([err instanceof HttpError ? err.code : 'not_approved'])
    return
  }

  let answer: WorkCheckAnswer
  if (attempt.kind === 'typed') {
    answer = { kind: 'typed', text: scrubContacts(attempt.answerText ?? '') }
  } else {
    const object = attempt.imageKey && deps.storage ? await deps.storage.getObject(attempt.imageKey) : null
    const mediaType = object?.contentType
    if (!object || (mediaType !== 'image/jpeg' && mediaType !== 'image/png' && mediaType !== 'image/webp')) {
      logger.warn('assessment: image unavailable', { attemptId, hasStorage: Boolean(deps.storage) })
      await uncertain(['image_unavailable'])
      return
    }
    answer = { kind: 'photo', image: { kind: 'base64', mediaType, data: object.body.toString('base64') } }
  }

  const guideline: WorkCheckGuidelineStep[] = steps.map((step) => ({
    step_id: stepKey(step.stepNo),
    step_no: step.stepNo,
    kind: step.stepType,
    criterion: step.criterion,
    marks: step.marks,
    notes: step.notes,
    expected: null,
  }))
  const promptInput: WorkCheckPromptInput = {
    item: { slug: row.item.slug, prompt_md: row.item.promptMd, max_marks: row.item.maxMarks },
    guideline,
    answer,
    mode: attempt.mode,
    final_answer: null,
  }
  // Accuracy criteria state values ("x = 2 and x = 3"): the hint must not repeat them.
  const memoValues = steps.filter((step) => step.stepType !== 'M').map((step) => step.criterion)

  let user: ReturnType<typeof buildWorkCheckUser>
  try {
    user = buildWorkCheckUser(promptInput)
  } catch (err) {
    if (err instanceof PromptSafetyError) {
      logger.warn('assessment: prompt refused by the safety guard', { attemptId, reason: err.reason })
      await uncertain(['prompt_unsafe'])
      return
    }
    throw err
  }

  let outcome
  try {
    outcome = await runModel(deps, {
      userId: attempt.learnerId,
      purpose: 'assess',
      subjectType: 'attempt',
      subjectId: attemptId,
      promptVersion: WORK_CHECK_PROMPT_VERSION,
      system: buildWorkCheckSystem(),
      user: user.text,
      images: user.images,
      context: workCheckContext(promptInput, memoValues),
      maxTokens: WORK_CHECK_MAX_TOKENS,
      timeoutMs: WORK_CHECK_TIMEOUT_MS,
      signal: AbortSignal.timeout(ASSESSMENT_DEADLINE_MS),
    })
  } catch (err) {
    if (err instanceof HttpError && err.code === 'budget_exhausted') {
      // Nothing was sent: leave the attempt unassessed so it can run tomorrow.
      await db.update(attempts).set({ assessingStartedAt: null }).where(eq(attempts.id, attemptId))
      return
    }
    logger.error('assessment: run failed', { attemptId, err })
    await uncertain(['run_error'])
    return
  }

  const { result, lastRunId } = outcome
  const lastRun = [...result.runs].reverse().find((run) => run.requestId) ?? result.runs[result.runs.length - 1]
  const common = {
    modelId: lastRun?.model ?? deps.gateway.model,
    latencyMs: result.totalLatencyMs,
    costUsd: result.totalCostUsd,
    requestId: lastRun?.requestId ?? 'none',
    modelRunId: lastRunId,
    provenanceModel: lastRunId ? { provider: result.provenance?.provider ?? 'meta', model: lastRun?.model ?? deps.gateway.model } : null,
  }

  if (result.status === 'accepted' && result.output) {
    const stored = toStoredSteps(result.output, steps)
    if (stored) {
      await writeAssessment(db, {
        attempt,
        status: 'proposed',
        total: result.output.total,
        steps: stored,
        reasons: result.output.uncertainty_codes,
        transcriptionConfidence: result.output.transcription_confidence,
        ...common,
      })
      return
    }
  }

  // Exhausted, failed (timeout, provider) or unmappable: uncertain, no marks shown. The
  // last schema-valid proposal is kept for the teacher's review.
  const usable = lastUsableOutput(result.runs, steps)
  const failedCodes = [...new Set(result.runs.flatMap((run) => run.checks.filter((check) => !check.passed).map((check) => check.code)))]
  const reasons = [result.status, ...(result.error ? [result.error.code] : []), ...failedCodes]
  await uncertain(reasons, {
    steps: usable?.steps ?? [],
    transcriptionConfidence: usable?.transcriptionConfidence ?? null,
    ...common,
  })
}

/** At boot: any attempt stuck in `assessing` for more than 5 minutes becomes `uncertain` (no marks shown). */
export async function sweepStuckAttempts(db: Db, logger: Logger, now = new Date()): Promise<number> {
  const cutoff = new Date(now.getTime() - ASSESSING_STUCK_MS)
  const stuck = await db
    .select({ id: attempts.id, learnerId: attempts.learnerId, itemId: attempts.itemId, mode: attempts.mode })
    .from(attempts)
    .leftJoin(assessments, eq(assessments.attemptId, attempts.id))
    .where(and(lt(attempts.assessingStartedAt, cutoff), isNull(assessments.id)))
  for (const attempt of stuck) {
    await writeAssessment(db, {
      attempt,
      status: 'uncertain',
      total: null,
      steps: [],
      reasons: ['stuck_after_restart'],
      transcriptionConfidence: null,
      modelId: 'none',
      latencyMs: 0,
      costUsd: 0,
      requestId: 'stuck',
      modelRunId: null,
      provenanceModel: null,
    })
  }
  if (stuck.length > 0) logger.warn('stuck assessments marked uncertain', { count: stuck.length })
  return stuck.length
}

// ── reading ───────────────────────────────────────────────────────────────────────────────

/** Hints are served for assisted attempts, and for independent or retention ones only once assessed. */
export function hintsVisible(mode: AttemptMode, assessed: boolean): boolean {
  return mode === 'assisted' || assessed
}

export function redactHints(steps: AssessedStep[], visible: boolean): AssessedStep[] {
  return visible ? steps : steps.map((step) => ({ ...step, hint: null }))
}

export function attemptStatusOf(attempt: { assessingStartedAt: Date | null }, assessment: { status: 'proposed' | 'uncertain' | 'failed' } | null): AttemptStatus {
  if (assessment) return assessment.status
  return attempt.assessingStartedAt ? 'assessing' : 'submitted'
}

const asStoredSteps = (value: unknown): StoredStep[] => (Array.isArray(value) ? (value as StoredStep[]) : [])

export async function attemptResponse(deps: PracticeDeps, actor: Actor, attemptId: string): Promise<AttemptResponse> {
  const { db } = deps
  if (!(await can(db, actor, 'attempt.read', { type: 'attempt', id: attemptId }))) throw notFound()
  const [row] = await db
    .select({ attempt: attempts, item: items, assessment: assessments })
    .from(attempts)
    .innerJoin(items, eq(items.id, attempts.itemId))
    .leftJoin(assessments, eq(assessments.attemptId, attempts.id))
    .where(eq(attempts.id, attemptId))
    .limit(1)
  if (!row) throw notFound()
  const steps = await db
    .select({ id: guidelineSteps.id, stepNo: guidelineSteps.stepNo, stepType: guidelineSteps.stepType, marks: guidelineSteps.marks, skillTag: guidelineSteps.skillTag, criterion: guidelineSteps.criterion })
    .from(guidelineSteps)
    .where(eq(guidelineSteps.itemId, row.item.id))
    .orderBy(asc(guidelineSteps.stepNo))

  const assessment = row.assessment
  const status = attemptStatusOf(row.attempt, assessment)
  const visible = hintsVisible(row.attempt.mode, assessment !== null)
  const served: AssessedStep[] =
    assessment && assessment.status === 'proposed'
      ? asStoredSteps(assessment.steps).map((step) => ({
          stepId: step.step_id,
          stepNo: step.step_no,
          skillTag: step.skill_tag,
          awarded: step.awarded,
          available: step.available,
          confidence: step.confidence,
          evidence: step.evidence,
          feedback: step.feedback,
          misconceptionTag: step.misconception_tag,
          hint: step.hint,
          box: step.box,
        }))
      : [] // uncertain or failed: no marks shown (spec 05 §4.2 L3)

  return {
    attempt: {
      id: row.attempt.id,
      learnerId: row.attempt.learnerId,
      itemId: row.item.id,
      itemSlug: row.item.slug,
      itemTopic: row.item.topic,
      itemPromptMd: row.item.promptMd,
      itemRevision: row.attempt.itemRevision,
      maxMarks: row.item.maxMarks,
      kind: row.attempt.kind,
      mode: row.attempt.mode,
      status,
      answerText: row.attempt.answerText,
      hasImage: row.attempt.imageKey !== null,
      provenance: row.attempt.provenance,
      createdAt: row.attempt.createdAt.toISOString(),
    },
    assessment: assessment
      ? {
          id: assessment.id,
          status: assessment.status,
          total: assessment.status === 'proposed' ? assessment.total : null,
          steps: redactHints(served, visible),
          ambiguityReasons: assessment.ambiguityReasons,
          transcriptionConfidence:
            assessment.transcriptionConfidence === null ? null : assessment.transcriptionConfidence >= 1 ? 'high' : assessment.transcriptionConfidence >= 0.5 ? 'medium' : 'low',
          modelId: assessment.modelId,
          promptVersion: assessment.promptVersion,
          latencyMs: assessment.latencyMs,
          createdAt: assessment.createdAt.toISOString(),
        }
      : null,
    guideline: steps,
    hintsVisible: visible,
  }
}

/** The learner's attempts, newest first (used by the inputs list and later by Today). */
export async function latestAttemptIds(db: Db, learnerId: string, limit = 20): Promise<string[]> {
  const rows = await db.select({ id: attempts.id }).from(attempts).where(eq(attempts.learnerId, learnerId)).orderBy(desc(attempts.createdAt)).limit(limit)
  return rows.map((row) => row.id)
}
