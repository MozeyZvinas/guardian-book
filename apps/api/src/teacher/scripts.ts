import type { Request } from 'express'
import { and, asc, eq } from 'drizzle-orm'
import { z } from 'zod'
import { DEFAULT_TRAINING_PERMISSION, MAX_UPLOAD_BYTES, uuidv7, workCheckOutputSchema, type Confidence, type CreateAttemptResponse, type WorkCheckOutput } from '@guardian-book/shared'
import { can, classMember, sameSchool } from '../access/index.js'
import { ASSESSMENT_DEADLINE_MS, approvedItemFor, guidelineNotApproved, modelNotConfigured, writeAssessment, type StoredStep } from '../assessment/service.js'
import { recordAudit } from '../audit/record.js'
import type { Actor } from '../auth/session.js'
import { assessments, attempts, guidelineApprovals, guidelineSteps, inputs, items } from '../db/schema.js'
import { appendEvent } from '../evidence/append.js'
import { PromptSafetyError } from '../gateway/promptSafety.js'
import {
  WORK_CHECK_MAX_TOKENS,
  WORK_CHECK_PROMPT_VERSION,
  WORK_CHECK_TIMEOUT_MS,
  buildWorkCheckSystem,
  buildWorkCheckUser,
  workCheckContext,
  type WorkCheckGuidelineStep,
  type WorkCheckPromptInput,
} from '../gateway/prompts/workCheck.v1.js'
import type { VerifiedRun } from '../gateway/verifiedCall.js'
import type { PracticeDeps } from '../inputs/deps.js'
import { HttpError, notFound, parse } from '../lib/http.js'
import { budgetExhausted, checkCaps, runModel } from '../modelRuns/index.js'
import { extensionFor, prepareImage, sniffMediaType } from '../storage/images.js'
import { storageNotConfigured } from '../storage/index.js'
import { clampBoxes } from '../verify/checks/work.js'

/**
 * B11 · A teacher uploads one learner's script (spec 02 P1-g; D35, D37, D38): the school
 * workflow on the existing path. `POST /api/teacher/classes/:classId/scripts` (multipart:
 * `learnerId`, `itemId`, `idempotencyKey`, `image`) creates the input and an attempt FOR
 * THE LEARNER (mode `independent`: it was written in a test, alone), both `school_provided`,
 * then reads it in the background exactly as B04's check does (the same prompt, `runModel`,
 * the verifier, `writeAssessment`: one assessment row, written once) and answers 202; the
 * teacher polls her review. The result lands in her queue like any other attempt.
 *
 * Who uploaded it: the input row carries the teacher in `inputs.learner_id` (D37's
 * precedent for a teacher's class notice, until an uploader column exists) and the audit
 * rows name her as the actor.
 *
 * Nothing reaches the learner or the guardian until she releases the review:
 * - `access` refuses the owner's reads of a `school_provided` attempt (and its image,
 *   review and fix) while no released review exists;
 * - the job does NOT run B06's `afterProposed` (which would write an
 *   `independent_check_completed` event and issue a same-day Help Plan to the learner and
 *   the guardian from a result nobody has released). The loop's independent evidence for a
 *   script comes from the release event instead (`review_released`, teacher-confirmed).
 */

export type ScriptDeps = Pick<PracticeDeps, 'db' | 'gateway' | 'storage' | 'logger' | 'limits' | 'jobs' | 'now'>

export const uploadScriptFieldsSchema = z
  .object({
    learnerId: z.string().uuid(),
    itemId: z.string().uuid(),
    idempotencyKey: z.string().trim().min(1).max(100),
  })
  .strict()
export type UploadScriptFields = z.infer<typeof uploadScriptFieldsSchema>

export const photoRequired = () => new HttpError(400, 'photo_required', 'Upload a photo of the script (JPEG, PNG or WebP, up to 8 MB).')
export const scriptTooLarge = () => new HttpError(413, 'file_too_large', 'That photo is over 8 MB. Take it again at a lower size.')
export const badScriptUpload = () => new HttpError(400, 'bad_request', 'The upload could not be read.')

/** The teacher's key, in her own namespace on `inputs` (the input row is hers, the attempt is the learner's). */
export const scriptIdempotencyKey = (key: string): string => `script:${key}`

/** Where a script lives in private storage: by class, never by the learner's name. */
export const scriptObjectKey = (classId: string, extension: string): string => `scripts/${classId}/${uuidv7()}.${extension}`

/** The same job key as B04's check, so one attempt is never read twice at once. */
export const scriptJobKey = (attemptId: string): string => `assess:${attemptId}`

// ── multipart ───────────────────────────────────────────────────────────────────────────

export interface ScriptUpload {
  fields: Record<string, string>
  file: Buffer | null
}

/** Headroom for field text and part boundaries above the file size cap. */
const OVERHEAD_BYTES = 256 * 1024

export function isMultipart(req: Request): boolean {
  return (req.headers['content-type'] ?? '').toLowerCase().startsWith('multipart/form-data')
}

async function readCapped(req: Request, cap: number): Promise<Buffer> {
  const declared = Number(req.headers['content-length'] ?? 0)
  if (Number.isFinite(declared) && declared > cap) throw scriptTooLarge()
  const chunks: Buffer[] = []
  let total = 0
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as string)
    total += buffer.length
    if (total > cap) throw scriptTooLarge()
    chunks.push(buffer)
  }
  return Buffer.concat(chunks)
}

/**
 * Reads the multipart body without a dependency (the platform `Response.formData()` parser
 * Node 24 ships, as B04's inputs do): text fields plus one file part named `image` (`file`
 * is accepted too, so the same client helper serves both routes).
 */
export async function readScriptUpload(req: Request, maxFileBytes = MAX_UPLOAD_BYTES): Promise<ScriptUpload> {
  const contentType = req.headers['content-type']
  if (!contentType) throw badScriptUpload()
  const raw = await readCapped(req, maxFileBytes + OVERHEAD_BYTES)
  let form: FormData
  try {
    form = await new Response(raw, { headers: { 'content-type': contentType } }).formData()
  } catch {
    throw badScriptUpload()
  }
  const fields: Record<string, string> = {}
  let file: Buffer | null = null
  for (const [name, value] of form.entries()) {
    if (typeof value === 'string') {
      fields[name] = value
      continue
    }
    if (name !== 'image' && name !== 'file') continue
    const bytes = Buffer.from(await value.arrayBuffer())
    if (bytes.length > maxFileBytes) throw scriptTooLarge()
    file = bytes
  }
  return { fields, file }
}

// ── the background read ─────────────────────────────────────────────────────────────────

type StepRow = typeof guidelineSteps.$inferSelect
const stepKey = (stepNo: number): string => `S${stepNo}`

/** Maps the model's `S<n>` step IDs back to guideline rows (as B04 does); null when any ID is unknown. */
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

/**
 * The job: B04's read of a photographed answer, minus the loop's after-effects. Never throws
 * past the registry: every path ends in an assessment row (proposed or uncertain, never an
 * invented mark) or a cleared in-progress flag.
 */
export async function runScriptAssessment(deps: ScriptDeps, attemptId: string): Promise<void> {
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
  const attempt = row.attempt
  const steps = await db.select().from(guidelineSteps).where(eq(guidelineSteps.itemId, row.item.id)).orderBy(asc(guidelineSteps.stepNo))

  const uncertain = (reasons: string[], extra: Partial<Parameters<typeof writeAssessment>[1]> = {}): Promise<string> =>
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
    logger.warn('script assessment refused: guideline not approved at run time', { attemptId })
    await uncertain([err instanceof HttpError ? err.code : 'not_approved'])
    return
  }

  const object = attempt.imageKey && deps.storage ? await deps.storage.getObject(attempt.imageKey) : null
  const mediaType = object?.contentType
  if (!object || (mediaType !== 'image/jpeg' && mediaType !== 'image/png' && mediaType !== 'image/webp')) {
    logger.warn('script assessment: image unavailable', { attemptId, hasStorage: Boolean(deps.storage) })
    await uncertain(['image_unavailable'])
    return
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
    answer: { kind: 'photo', image: { kind: 'base64', mediaType, data: object.body.toString('base64') } },
    mode: attempt.mode,
    final_answer: null,
  }
  // Accuracy criteria state values: the hint must not repeat them (the same rule as B04).
  const memoValues = steps.filter((step) => step.stepType !== 'M').map((step) => step.criterion)

  let user: ReturnType<typeof buildWorkCheckUser>
  try {
    user = buildWorkCheckUser(promptInput)
  } catch (err) {
    if (err instanceof PromptSafetyError) {
      logger.warn('script assessment: prompt refused by the safety guard', { attemptId, reason: err.reason })
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
      // Nothing was sent: leave the attempt unread so a replay can start it tomorrow.
      await db.update(attempts).set({ assessingStartedAt: null }).where(eq(attempts.id, attemptId))
      return
    }
    logger.error('script assessment: run failed', { attemptId, err })
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
      // No `afterProposed` here (see the module note): the teacher releases before the loop moves.
      return
    }
  }

  const usable = lastUsableOutput(result.runs, steps)
  const failedCodes = [...new Set(result.runs.flatMap((run) => run.checks.filter((check) => !check.passed).map((check) => check.code)))]
  await uncertain([result.status, ...(result.error ? [result.error.code] : []), ...failedCodes], {
    steps: usable?.steps ?? [],
    transcriptionConfidence: usable?.transcriptionConfidence ?? null,
    ...common,
  })
}

/** Starts the read unless one is running or done (the same idempotent dance as B04's `startAssessment`). */
async function startScriptAssessment(deps: ScriptDeps, actor: Actor, learnerId: string, attemptId: string, requestId: string | undefined): Promise<void> {
  const [done] = await deps.db.select({ id: assessments.id }).from(assessments).where(eq(assessments.attemptId, attemptId)).limit(1)
  if (done) return
  if (!deps.gateway.configured) throw modelNotConfigured()
  // The read counts against the learner's daily cap (`runModel` records it against the learner too).
  const cap = await checkCaps(deps.db, learnerId, deps.limits, deps.now())
  if (!cap.ok) {
    await recordAudit(deps.db, { actorId: actor.userId, action: 'attempt.assess_refused', subjectType: 'attempt', subjectId: attemptId, outcome: 'refused', requestId: requestId ?? null })
    throw budgetExhausted(cap.reason)
  }
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
    if (row.assessingStartedAt && deps.jobs.isRunning(scriptJobKey(attemptId))) return 'assessing' as const
    await tx.update(attempts).set({ assessingStartedAt: now }).where(eq(attempts.id, attemptId))
    return 'started' as const
  })
  if (decision === 'started') {
    deps.jobs.start(scriptJobKey(attemptId), () => runScriptAssessment(deps, attemptId))
    await recordAudit(deps.db, { actorId: actor.userId, action: 'attempt.assess_started', subjectType: 'attempt', subjectId: attemptId, outcome: 'ok', requestId: requestId ?? null })
  }
}

// ── the upload ──────────────────────────────────────────────────────────────────────────

export interface UploadScriptInput {
  fields: unknown
  file: Buffer | null
  requestId?: string | undefined
}

export async function uploadScript(deps: ScriptDeps, actor: Actor, classId: string, input: UploadScriptInput): Promise<CreateAttemptResponse> {
  const { db } = deps
  if (!(await can(db, actor, 'script.upload', { type: 'class', id: classId }))) throw notFound()
  const fields = parse(uploadScriptFieldsSchema, input.fields)

  // The learner must be in this class, in the teacher's school: anything else is a 404.
  const inClass = await classMember(db, fields.learnerId, classId)
  if (!inClass || !(await sameSchool(db, actor, { type: 'learner', id: fields.learnerId }))) throw notFound()

  // The item must be approved, and its current guideline approved FOR THIS CLASS (409).
  const [item] = await db
    .select()
    .from(items)
    .where(and(eq(items.id, fields.itemId), eq(items.status, 'approved')))
    .limit(1)
  if (!item) throw notFound()
  const [approval] = await db
    .select({ classId: guidelineApprovals.classId })
    .from(guidelineApprovals)
    .where(and(eq(guidelineApprovals.classId, classId), eq(guidelineApprovals.itemId, item.id), eq(guidelineApprovals.itemRevision, item.revision)))
    .limit(1)
  if (!approval) {
    await recordAudit(db, { actorId: actor.userId, action: 'script.upload_refused', subjectType: 'class', subjectId: classId, outcome: 'refused', requestId: input.requestId ?? null })
    throw guidelineNotApproved()
  }

  // Replay with the same key: the same attempt, no second upload; a read that never started is started now.
  const key = scriptIdempotencyKey(fields.idempotencyKey)
  const [replay] = await db
    .select({ id: inputs.id, attemptId: inputs.attemptId })
    .from(inputs)
    .where(and(eq(inputs.learnerId, actor.userId), eq(inputs.idempotencyKey, key)))
    .limit(1)
  if (replay?.attemptId) {
    await startScriptAssessment(deps, actor, fields.learnerId, replay.attemptId, input.requestId)
    return { attemptId: replay.attemptId, inputId: replay.id, replayed: true }
  }

  // A photo of the script: re-encoded upright with no metadata, stored privately.
  if (!input.file) throw photoRequired()
  if (input.file.length > MAX_UPLOAD_BYTES) throw scriptTooLarge()
  const mediaType = sniffMediaType(input.file)
  if (!mediaType || mediaType === 'application/pdf') throw photoRequired()
  if (!deps.storage) throw storageNotConfigured()
  const prepared = await prepareImage(input.file, mediaType)
  const objectKey = scriptObjectKey(classId, extensionFor(mediaType))
  await deps.storage.putObject(objectKey, prepared.buffer, mediaType)

  const created = await db.transaction(async (tx) => {
    const inputId = uuidv7()
    await tx.insert(inputs).values({
      id: inputId,
      learnerId: actor.userId, // the uploader (D37 precedent): the learner's Today never lists it
      kind: 'work',
      kindOverridden: true,
      text: null,
      objectKey,
      attemptId: null,
      idempotencyKey: key,
      provenance: 'school_provided',
      provenanceDetail: null,
      trainingPermission: DEFAULT_TRAINING_PERMISSION,
    })
    const [attempt] = await tx
      .insert(attempts)
      .values({
        learnerId: fields.learnerId,
        itemId: item.id,
        itemRevision: item.revision,
        kind: 'photo',
        mode: 'independent',
        answerText: null,
        imageKey: objectKey,
        idempotencyKey: `input:${inputId}`,
        provenance: 'school_provided',
        provenanceDetail: null,
        trainingPermission: DEFAULT_TRAINING_PERMISSION,
      })
      .returning({ id: attempts.id })
    if (!attempt) throw new Error('attempt insert returned no row')
    await tx.update(inputs).set({ attemptId: attempt.id }).where(eq(inputs.id, inputId))
    await appendEvent(tx, {
      learnerId: fields.learnerId,
      kind: 'attempt_submitted',
      attemptId: attempt.id,
      itemId: item.id,
      skillTag: null,
      basis: 'none',
      payload: { mode: 'independent', kind: 'photo', item_revision: item.revision, source: 'teacher_upload' },
    })
    await recordAudit(tx, { actorId: actor.userId, action: 'input.created', subjectType: 'input', subjectId: inputId, outcome: 'ok', requestId: input.requestId ?? null })
    await recordAudit(tx, { actorId: actor.userId, action: 'script.uploaded', subjectType: 'attempt', subjectId: attempt.id, outcome: 'ok', requestId: input.requestId ?? null })
    return { attemptId: attempt.id, inputId }
  })

  await startScriptAssessment(deps, actor, fields.learnerId, created.attemptId, input.requestId)
  return { attemptId: created.attemptId, inputId: created.inputId, replayed: false }
}
