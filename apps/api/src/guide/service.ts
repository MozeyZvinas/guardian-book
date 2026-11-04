import { and, asc, eq } from 'drizzle-orm'
import {
  GUIDE_FAILED,
  GUIDE_UNSURE,
  guideOutputSchema,
  provenanceColumns,
  type Confidence,
  type CreateGuideFields,
  type GuideAgreement,
  type GuideOutput,
  type GuideStatus,
  type GuideStep,
  type GuideStepView,
  type GuideView,
} from '@guardian-book/shared'
import { can } from '../access/index.js'
import { modelNotConfigured } from '../assessment/service.js'
import { recordAudit } from '../audit/record.js'
import type { Actor } from '../auth/session.js'
import { guides, inputs, items } from '../db/schema.js'
import { PromptSafetyError } from '../gateway/promptSafety.js'
import type { ImageInput } from '../gateway/transport.js'
import type { PracticeDeps } from '../inputs/deps.js'
import { createInput, findInput } from '../inputs/service.js'
import { scrubContacts } from '../inputs/text.js'
import { HttpError, notFound } from '../lib/http.js'
import { budgetExhausted, checkCaps, runModel } from '../modelRuns/index.js'
import { extensionFor, sniffMediaType } from '../storage/images.js'
import { storageNotConfigured } from '../storage/index.js'
import { answersDisagree } from '../verify/checks/guide.js'
import type { CheckResult } from '../verify/index.js'
import { runChecks } from '../verify/index.js'
import { matchBankItem } from './match.js'
import {
  GUIDE_CHECK_PROMPT_VERSION,
  GUIDE_DEADLINE_MS,
  GUIDE_MAX_TOKENS,
  GUIDE_PROMPT_VERSION,
  GUIDE_TIMEOUT_MS,
  buildGuideSystem,
  buildGuideUser,
  prepareGuideText,
  type GuideInput,
} from './prompt.v1.js'

/**
 * Help me with a question (brief B15 §2, §3, §5): `POST /api/guide` stores the question as
 * an input (kind `question`, `student_provided`), writes a `guides` row and answers 202 at
 * once; two independent reads then run in the background (purpose `guide`, one
 * `model_runs` row per call) and the learner polls `GET /api/guide/:id`.
 *
 * Fail closed, in this order: a read that fails the verifier three times is nothing; with
 * two verified reads the final answers must agree (ANSWERS_DISAGREE) and the better read's
 * confidence must not be low, or only the read-back and the first hint are shown; with
 * one verified read, the same; with none, "I couldn't read this one". Nothing is marked,
 * no learning event is written, and the Brain does not move.
 */

export const GUIDE_STUCK_MS = 4 * 60 * 1000
export const guideJobKey = (guideId: string): string => `guide:${guideId}`

export const guideSourceRequired = () => new HttpError(400, 'guide_source_required', 'Type the question, snap it, or choose something you brought: one of them.')
export const editTextRequired = () => new HttpError(400, 'edit_text_required', 'Correct the question text to read it again.')
export const alreadyEdited = () => new HttpError(409, 'guide_already_edited', 'This question has been corrected once already. Bring it again to start over.')
export const alreadyChecked = () => new HttpError(409, 'already_routed', 'This has already been checked as homework; bring the question again.')
export const pdfNotReadable = () => new HttpError(400, 'pdf_not_readable', 'A PDF cannot be read here yet. Snap a photo of the question instead.')

type GuideRow = typeof guides.$inferSelect
type InputRow = typeof inputs.$inferSelect

const CONFIDENCE_RANK: Record<Confidence, number> = { high: 3, medium: 2, low: 1 }
const asSteps = (value: unknown): GuideStep[] => (Array.isArray(value) ? (value as GuideStep[]) : [])
const isPdfKey = (key: string | null): boolean => Boolean(key && key.endsWith(`.${extensionFor('application/pdf')}`))

export interface NewGuide {
  actor: Actor
  fields: CreateGuideFields
  file: { bytes: Buffer } | null
  requestId?: string | undefined
}

export async function findGuide(deps: PracticeDeps, guideId: string): Promise<GuideRow | null> {
  const [row] = await deps.db.select().from(guides).where(eq(guides.id, guideId)).limit(1)
  return row ?? null
}

/** The learner's view of one guide; a `reading` row whose job died is marked `failed` here. */
export async function guideView(deps: PracticeDeps, row: GuideRow): Promise<GuideView> {
  let current = row
  if (current.status === 'reading' && !deps.jobs.isRunning(guideJobKey(current.id))) {
    const started = current.readingStartedAt?.getTime() ?? current.createdAt.getTime()
    if (deps.now().getTime() - started > GUIDE_STUCK_MS) {
      const [updated] = await deps.db.update(guides).set({ status: 'failed', readingStartedAt: null }).where(and(eq(guides.id, current.id), eq(guides.status, 'reading'))).returning()
      if (updated) current = updated
    }
  }
  const input = await findInput(deps, current.inputId)
  const stored = asSteps(current.steps)
  let steps: GuideStepView[] = []
  if (current.status === 'ready') steps = stored.map((step, index) => ({ stepNo: index + 1, goal: step.goal, hint: step.hint, worked: step.worked }))
  else if (current.status === 'unsure' && stored[0]) steps = [{ stepNo: 1, goal: stored[0].goal, hint: stored[0].hint, worked: null }]
  const question = current.questionMd !== null && current.status !== 'failed' ? { questionMd: current.questionMd, subject: current.subject ?? '', topic: current.topic ?? '' } : null
  return {
    id: current.id,
    status: current.status,
    inputId: current.inputId,
    hasImage: Boolean(input?.objectKey),
    sourceText: input?.text ? prepareGuideText(input.text) : null,
    question,
    steps,
    finalAnswer: current.status === 'ready' ? current.finalAnswer : null,
    confidence: current.status === 'ready' || current.status === 'unsure' ? ((current.confidence as Confidence | null) ?? null) : null,
    agreement: current.agreement,
    message: current.status === 'unsure' ? GUIDE_UNSURE : current.status === 'failed' ? GUIDE_FAILED : null,
    matchedItemId: current.matchedItemId,
    // One correction, and only of a read-back that exists.
    canEdit: current.editedFromId === null && (current.status === 'ready' || current.status === 'unsure'),
    editedFromId: current.editedFromId,
    createdAt: current.createdAt.toISOString(),
  }
}

export async function readGuideView(deps: PracticeDeps, actor: Actor, guideId: string): Promise<GuideView> {
  if (!(await can(deps.db, actor, 'guide.read', { type: 'guide', id: guideId }))) throw notFound()
  const row = await findGuide(deps, guideId)
  if (!row) throw notFound()
  return guideView(deps, row)
}

/** An input the learner already brought: theirs (else 404), not yet checked as homework, not a PDF. */
async function existingInput(deps: PracticeDeps, actor: Actor, inputId: string): Promise<InputRow> {
  if (!(await can(deps.db, actor, 'input.update', { type: 'input', id: inputId }))) throw notFound()
  const row = await findInput(deps, inputId)
  if (!row) throw notFound()
  if (row.attemptId) throw alreadyChecked()
  if (isPdfKey(row.objectKey)) throw pdfNotReadable()
  return row
}

/** Resolves the input the guide reads: the existing one (now a question), or a new one from the text or file. */
async function inputFor(deps: PracticeDeps, input: NewGuide, parent: GuideRow | null, existing: InputRow | null): Promise<InputRow> {
  const { actor, fields, file } = input
  if (existing) {
    if (existing.kind === 'question') return existing
    // The learner has said what it is: a question, not homework or a notice.
    const [updated] = await deps.db.update(inputs).set({ kind: 'question', kindOverridden: true }).where(eq(inputs.id, existing.id)).returning()
    await recordAudit(deps.db, { actorId: actor.userId, action: 'input.kind_changed', subjectType: 'input', subjectId: existing.id, outcome: 'ok', requestId: input.requestId ?? null })
    return updated ?? existing
  }
  if (file) {
    if (sniffMediaType(file.bytes) === 'application/pdf') throw pdfNotReadable()
    if (!deps.storage) throw storageNotConfigured()
  }
  const created = await createInput(deps, {
    actor,
    fields: {
      kind: 'question',
      ...(fields.text !== undefined ? { text: fields.text } : {}),
      // Its own key space: a guide's input never collides with the learner's other inputs.
      idempotencyKey: `${parent ? 'guide-edit' : 'guide'}:${fields.idempotencyKey}`,
    },
    file,
    requestId: input.requestId,
  })
  const row = await findInput(deps, created.input.id)
  if (!row) throw notFound()
  return row
}

export async function createGuide(deps: PracticeDeps, input: NewGuide): Promise<{ guide: GuideView; replayed: boolean }> {
  const { actor, fields, file } = input
  if (!(await can(deps.db, actor, 'guide.create', { type: 'learner', id: actor.userId }))) throw notFound()

  const sources = [file !== null, fields.text !== undefined, fields.inputId !== undefined].filter(Boolean).length
  if (fields.editOf !== undefined && (fields.text === undefined || file !== null || fields.inputId !== undefined)) throw editTextRequired()
  if (sources !== 1) throw guideSourceRequired()

  // Replay with the same key: the same guide, no second upload, no second read.
  const [replay] = await deps.db
    .select()
    .from(guides)
    .where(and(eq(guides.learnerId, actor.userId), eq(guides.idempotencyKey, fields.idempotencyKey)))
    .limit(1)
  if (replay) return { guide: await guideView(deps, replay), replayed: true }

  // The object checks come first (spec 03 §4: an ID is never confirmed by a later error).
  let parent: GuideRow | null = null
  if (fields.editOf !== undefined) {
    if (!(await can(deps.db, actor, 'guide.read', { type: 'guide', id: fields.editOf }))) throw notFound()
    parent = await findGuide(deps, fields.editOf)
    if (!parent) throw notFound()
    // Re-reads once (brief B15 §4): a corrected read-back is not corrected again.
    if (parent.editedFromId !== null) throw alreadyEdited()
  }
  const existing = fields.inputId !== undefined ? await existingInput(deps, actor, fields.inputId) : null

  // Nothing is stored for a read that cannot start: the model is off, or today's calls are used up.
  if (!deps.gateway.configured) throw modelNotConfigured()
  const cap = await checkCaps(deps.db, actor.userId, deps.limits, deps.now())
  if (!cap.ok) {
    await recordAudit(deps.db, { actorId: actor.userId, action: 'guide.create_refused', subjectType: 'learner', subjectId: actor.userId, outcome: 'refused', requestId: input.requestId ?? null })
    throw budgetExhausted(cap.reason)
  }

  const source = await inputFor(deps, input, parent, existing)
  const [row] = await deps.db
    .insert(guides)
    .values({
      learnerId: actor.userId,
      inputId: source.id,
      editedFromId: parent?.id ?? null,
      idempotencyKey: fields.idempotencyKey,
      status: 'reading',
      readingStartedAt: deps.now(),
      // The row holds the learner's question until a read lands (then `model_generated`, with the run).
      ...provenanceColumns('learner_input'),
    })
    .returning()
  if (!row) throw new Error('guide insert returned no row')
  await recordAudit(deps.db, { actorId: actor.userId, action: 'guide.created', subjectType: 'guide', subjectId: row.id, outcome: 'ok', requestId: input.requestId ?? null })

  deps.jobs.start(guideJobKey(row.id), () => readGuide(deps, { guideId: row.id, userId: actor.userId }))
  return { guide: await guideView(deps, row), replayed: false }
}

// ── the background job: two independent reads, compared ──────────────────────────────────

interface ReadOutcome {
  status: 'accepted' | 'exhausted' | 'failed'
  output: GuideOutput | null
  runIds: string[]
  lastRunId: string | null
  model: string | null
  version: string
  error: string | null
}

async function oneRead(deps: PracticeDeps, params: { guideId: string; userId: string; version: string; user: { text: string; images: ImageInput[] }; signal: AbortSignal }): Promise<ReadOutcome> {
  try {
    const { result, runIds, lastRunId } = await runModel(deps, {
      userId: params.userId,
      purpose: 'guide',
      subjectType: 'guide',
      subjectId: params.guideId,
      promptVersion: params.version,
      system: buildGuideSystem(),
      user: params.user.text,
      images: params.user.images,
      context: { otherFinalAnswer: null },
      maxTokens: GUIDE_MAX_TOKENS,
      timeoutMs: GUIDE_TIMEOUT_MS,
      signal: params.signal,
    })
    return {
      status: result.status,
      output: result.status === 'accepted' ? result.output : null,
      runIds: runIds.filter((id) => id !== ''),
      lastRunId,
      model: result.runs.map((run) => run.model).find((model): model is string => Boolean(model)) ?? null,
      version: params.version,
      error: result.error?.code ?? null,
    }
  } catch (err) {
    // A cap reached between the two reads, or a database error: this read is simply absent.
    const code = err instanceof HttpError ? err.code : err instanceof Error ? err.name : 'error'
    deps.logger.warn('guide: read did not run', { guideId: params.guideId, version: params.version, code })
    return { status: 'failed', output: null, runIds: [], lastRunId: null, model: null, version: params.version, error: code }
  }
}

/** Which of two accepted reads to show: the more confident one; the first on a tie. */
export function chooseRead<T extends { output: GuideOutput | null }>(reads: T[]): T | null {
  const accepted = reads.filter((read) => read.output !== null)
  if (accepted.length === 0) return null
  return accepted.reduce((best, read) => (CONFIDENCE_RANK[read.output!.confidence] > CONFIDENCE_RANK[best.output!.confidence] ? read : best))
}

/** Pure: the status and agreement for a set of read outcomes (brief B15 §3). */
export function decideGuide(outputs: Array<GuideOutput | null>, chosen: GuideOutput | null): { status: GuideStatus; agreement: GuideAgreement | null; checks: CheckResult[] } {
  const accepted = outputs.filter((output): output is GuideOutput => output !== null)
  if (!chosen || accepted.length === 0) return { status: 'failed', agreement: null, checks: [] }
  if (accepted.length < 2) return { status: 'unsure', agreement: 'skipped', checks: [] }
  const other = accepted.find((output) => output !== chosen) ?? accepted[1]!
  const compared = runChecks('guide', chosen, { otherFinalAnswer: other.final_answer })
  const agreement: GuideAgreement = answersDisagree(chosen, { otherFinalAnswer: other.final_answer }).passed ? 'agree' : 'disagree'
  const status: GuideStatus = agreement === 'agree' && chosen.confidence !== 'low' ? 'ready' : 'unsure'
  return { status, agreement, checks: compared.checks }
}

export async function readGuide(deps: PracticeDeps, params: { guideId: string; userId: string }): Promise<void> {
  const { db, logger } = deps
  const guide = await findGuide(deps, params.guideId)
  if (!guide || guide.status !== 'reading') return
  const input = await findInput(deps, guide.inputId)
  const fail = async (reason: string): Promise<void> => {
    logger.warn('guide: nothing to read', { guideId: params.guideId, reason })
    await db.update(guides).set({ status: 'failed', readingStartedAt: null }).where(eq(guides.id, params.guideId))
    await recordAudit(db, { actorId: params.userId, action: 'guide.read', subjectType: 'guide', subjectId: params.guideId, outcome: 'error', requestId: null })
  }
  if (!input) return fail('input missing')

  let prompt: GuideInput
  if (input.text !== null) {
    prompt = { kind: 'text', text: scrubContacts(input.text) }
  } else {
    const object = input.objectKey && deps.storage ? await deps.storage.getObject(input.objectKey) : null
    const mediaType = object?.contentType
    if (!object || (mediaType !== 'image/jpeg' && mediaType !== 'image/png' && mediaType !== 'image/webp')) return fail('image unavailable')
    prompt = { kind: 'image', image: { kind: 'base64', mediaType, data: object.body.toString('base64') } }
  }

  let first: ReturnType<typeof buildGuideUser>
  let check: ReturnType<typeof buildGuideUser>
  try {
    first = buildGuideUser(prompt, 'first')
    check = buildGuideUser(prompt, 'check')
  } catch (err) {
    if (err instanceof PromptSafetyError) return fail(`prompt refused: ${err.reason}`)
    throw err
  }

  const signal = AbortSignal.timeout(GUIDE_DEADLINE_MS)
  const reads = await Promise.all([
    oneRead(deps, { guideId: params.guideId, userId: params.userId, version: GUIDE_PROMPT_VERSION, user: first, signal }),
    oneRead(deps, { guideId: params.guideId, userId: params.userId, version: GUIDE_CHECK_PROMPT_VERSION, user: check, signal }),
  ])
  const chosen = chooseRead(reads)
  const decision = decideGuide(
    reads.map((read) => read.output),
    chosen?.output ?? null,
  )
  const runIds = reads.flatMap((read) => read.runIds)
  logger.info('guide: read', {
    guideId: params.guideId,
    status: decision.status,
    agreement: decision.agreement,
    reads: reads.map((read) => ({ version: read.version, status: read.status, calls: read.runIds.length, confidence: read.output?.confidence ?? null, error: read.error })),
    failedChecks: decision.checks.filter((c) => !c.passed).map((c) => c.code),
  })

  if (!chosen || !chosen.output || !chosen.lastRunId) {
    await db.update(guides).set({ status: 'failed', modelRunIds: runIds, readingStartedAt: null }).where(eq(guides.id, params.guideId))
    await recordAudit(db, { actorId: params.userId, action: 'guide.read', subjectType: 'guide', subjectId: params.guideId, outcome: 'error', requestId: null })
    return
  }

  const output = guideOutputSchema.parse(chosen.output)
  const bank = await db.select({ id: items.id, promptMd: items.promptMd }).from(items).where(eq(items.status, 'approved')).orderBy(asc(items.slug))
  const matched = matchBankItem(output.question_md, bank)
  await db
    .update(guides)
    .set({
      status: decision.status,
      questionMd: output.question_md,
      subject: output.subject,
      topic: output.topic,
      steps: output.steps,
      finalAnswer: output.final_answer,
      confidence: output.confidence,
      agreement: decision.agreement,
      matchedItemId: matched?.id ?? null,
      modelRunIds: runIds,
      checks: decision.checks,
      readingStartedAt: null,
      ...provenanceColumns('model_output', { provider: 'meta', model: chosen.model ?? deps.gateway.model, version: chosen.version, model_run_id: chosen.lastRunId }),
    })
    .where(eq(guides.id, params.guideId))
  await recordAudit(db, { actorId: params.userId, action: 'guide.read', subjectType: 'guide', subjectId: params.guideId, outcome: 'ok', requestId: null })
}
