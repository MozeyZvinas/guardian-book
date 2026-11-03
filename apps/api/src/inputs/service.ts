import { and, desc, eq } from 'drizzle-orm'
import {
  DEFAULT_TRAINING_PERMISSION,
  inputClassSchema,
  provenanceColumns,
  uuidv7,
  type AttemptMode,
  type Confidence,
  type CreateInputFields,
  type InputKind,
  type InputView,
  type UploadMediaType,
} from '@guardian-book/shared'
import { can } from '../access/index.js'
import { recordAudit } from '../audit/record.js'
import type { Actor } from '../auth/session.js'
import { approvedItemFor, createAttempt } from '../assessment/service.js'
import { extractNotice, noticeJobKey, noticeState, type CalendarScope } from '../calendar/service.js'
import { inputs, modelRuns } from '../db/schema.js'
import { PromptSafetyError } from '../gateway/promptSafety.js'
import { HttpError, notFound } from '../lib/http.js'
import { runModel } from '../modelRuns/index.js'
import { extensionFor, prepareImage, sniffMediaType, unsupportedFile, assertUploadSize } from '../storage/images.js'
import { storageNotConfigured } from '../storage/index.js'
import { CLASSIFY_MAX_TOKENS, CLASSIFY_PROMPT_VERSION, CLASSIFY_TIMEOUT_MS, buildClassifySystem, buildClassifyUser, type ClassifyInput } from './classifyPrompt.v1.js'
import type { PracticeDeps } from './deps.js'
import { scrubContacts } from './text.js'

/**
 * Bring anything (spec 02 P0-03; spec 03 §8.1 `inputs`, §8.2, §8.3; brief B04 §2).
 *
 * One capture: typed text or one file (JPEG, PNG, WebP, PDF ≤ 8 MB). The server stores
 * it privately (images re-encoded, EXIF stripped), classifies it with one model call
 * unless the person said what it is, and routes it: `work` on an item → an attempt;
 * `notice` → the calendar (in the background); `question` → kept for the plan (B06).
 * A low-confidence classification is not routed: the client asks "Which is it?" and
 * `PATCH /api/inputs/:id/kind` routes without a second upload.
 */

type InputRow = typeof inputs.$inferSelect

export interface NewInput {
  actor: Actor
  fields: CreateInputFields
  file: { bytes: Buffer } | null
  requestId?: string | undefined
}

export const textOrFile = () => new HttpError(400, 'text_or_file', 'Send typed text or one file, not both and not neither.')
export const kindRequired = () => new HttpError(400, 'kind_required', 'Say what this is: homework, a notice or a question.')
export const alreadyRouted = () => new HttpError(409, 'already_routed', 'This has already been checked as homework; bring it again to change what it is.')
export const classRequired = () => new HttpError(400, 'class_required', 'Choose the class this notice is for.')

export function mediaTypeOfKey(key: string | null): UploadMediaType | null {
  if (!key) return null
  if (key.endsWith('.jpg')) return 'image/jpeg'
  if (key.endsWith('.png')) return 'image/png'
  if (key.endsWith('.webp')) return 'image/webp'
  if (key.endsWith('.pdf')) return 'application/pdf'
  return null
}

/** What the classifier said about this input, read back from its `model_runs` row. */
export async function classificationOf(deps: PracticeDeps, inputId: string): Promise<{ confidence: Confidence | null; decided: boolean }> {
  const [run] = await deps.db
    .select({ status: modelRuns.status, output: modelRuns.output })
    .from(modelRuns)
    .where(and(eq(modelRuns.subjectType, 'input'), eq(modelRuns.subjectId, inputId), eq(modelRuns.purpose, 'classify')))
    .orderBy(desc(modelRuns.createdAt))
    .limit(1)
  if (!run) return { confidence: null, decided: false }
  const parsed = inputClassSchema.safeParse(run.output)
  if (run.status === 'accepted' && parsed.success) return { confidence: parsed.data.confidence, decided: true }
  return { confidence: parsed.success ? parsed.data.confidence : null, decided: false }
}

export async function inputView(deps: PracticeDeps, row: InputRow): Promise<InputView> {
  const classification = row.kindOverridden ? { confidence: null, decided: true } : await classificationOf(deps, row.id)
  const notice = await noticeState(deps, row)
  return {
    id: row.id,
    kind: row.kind,
    kindOverridden: row.kindOverridden,
    confidence: classification.confidence,
    needsKind: !classification.decided,
    hasText: row.text !== null,
    mediaType: mediaTypeOfKey(row.objectKey),
    attemptId: row.attemptId,
    notice,
    createdAt: row.createdAt.toISOString(),
  }
}

export async function findInput(deps: PracticeDeps, inputId: string): Promise<InputRow | null> {
  const [row] = await deps.db.select().from(inputs).where(eq(inputs.id, inputId)).limit(1)
  return row ?? null
}

async function classify(deps: PracticeDeps, params: { userId: string; inputId: string; input: ClassifyInput }): Promise<{ kind: InputKind | null; decided: boolean }> {
  let user: ReturnType<typeof buildClassifyUser>
  try {
    user = buildClassifyUser(params.input)
  } catch (err) {
    if (err instanceof PromptSafetyError) return { kind: null, decided: false }
    throw err
  }
  const { result } = await runModel(deps, {
    userId: params.userId,
    purpose: 'classify',
    subjectType: 'input',
    subjectId: params.inputId,
    promptVersion: CLASSIFY_PROMPT_VERSION,
    system: buildClassifySystem(),
    user: user.text,
    images: user.images,
    context: {},
    maxTokens: CLASSIFY_MAX_TOKENS,
    timeoutMs: CLASSIFY_TIMEOUT_MS,
    maxCalls: 1,
  })
  if (result.status === 'accepted' && result.output) return { kind: result.output.kind, decided: true }
  // Low confidence (exhausted) still carries the model's best guess; the person decides.
  const guess = inputClassSchema.safeParse(result.runs[result.runs.length - 1]?.output)
  return { kind: guess.success ? guess.data.kind : null, decided: false }
}

/** Routes an input that has a decided kind. Returns the attempt ID for work on an item. */
async function route(deps: PracticeDeps, row: InputRow, actor: Actor, options: { itemId?: string | undefined; mode?: AttemptMode | undefined; classId?: string | undefined; requestId?: string | undefined }): Promise<string | null> {
  if (row.kind === 'work') {
    if (row.attemptId) return row.attemptId
    if (!options.itemId || actor.role !== 'learner') return null // the client shows the item picker
    const item = await approvedItemFor(deps.db, actor.userId, options.itemId)
    const { attemptId } = await createAttempt(deps.db, {
      learnerId: actor.userId,
      input: { id: row.id, text: row.text, objectKey: row.objectKey },
      item,
      mode: options.mode ?? 'assisted',
      requestId: options.requestId,
    })
    return attemptId
  }
  if (row.kind === 'notice') {
    const scope: CalendarScope | null =
      actor.role === 'teacher' ? (options.classId ? { type: 'class', id: options.classId } : null) : { type: 'learner', id: actor.userId }
    if (!scope) throw classRequired()
    deps.jobs.start(noticeJobKey(row.id), () => extractNotice(deps, { inputId: row.id, userId: actor.userId, role: actor.role === 'teacher' ? 'teacher' : 'learner', scope }))
  }
  return null
}

export async function createInput(deps: PracticeDeps, input: NewInput): Promise<{ input: InputView; replayed: boolean }> {
  const { actor, fields, file } = input
  const hasText = fields.text !== undefined
  if (hasText === (file !== null)) throw textOrFile()

  // Who may bring what (spec 03 §8.2): a learner their own; a teacher a class notice only.
  if (actor.role === 'teacher') {
    if (!fields.classId) throw classRequired()
    if (fields.kind !== undefined && fields.kind !== 'notice') throw new HttpError(400, 'teacher_notice_only', 'Teachers bring class notices here; learners bring their own work.')
    if (!(await can(deps.db, actor, 'input.create', { type: 'class', id: fields.classId }))) throw notFound()
  } else if (actor.role === 'learner') {
    if (!(await can(deps.db, actor, 'input.create', { type: 'learner', id: actor.userId }))) throw notFound()
  } else {
    throw notFound()
  }

  // Replay with the same key: the same input, no second upload, no second model call.
  const [replay] = await deps.db
    .select()
    .from(inputs)
    .where(and(eq(inputs.learnerId, actor.userId), eq(inputs.idempotencyKey, fields.idempotencyKey)))
    .limit(1)
  if (replay) return { input: await inputView(deps, replay), replayed: true }

  // A refused guideline refuses before anything is stored or sent (acceptance: no model call).
  if (fields.itemId && actor.role === 'learner') await approvedItemFor(deps.db, actor.userId, fields.itemId)

  // Store the file privately: images re-encoded without metadata, PDFs as-is.
  let objectKey: string | null = null
  let classifyInput: ClassifyInput | null = null
  let mediaType: UploadMediaType | null = null
  if (file) {
    assertUploadSize(file.bytes)
    mediaType = sniffMediaType(file.bytes)
    if (!mediaType) throw unsupportedFile()
    if (!deps.storage) throw storageNotConfigured()
    let bytes = file.bytes
    if (mediaType !== 'application/pdf') {
      const prepared = await prepareImage(file.bytes, mediaType)
      bytes = prepared.buffer
      classifyInput = { kind: 'image', image: { kind: 'base64', mediaType, data: bytes.toString('base64') } }
    }
    objectKey = `inputs/${actor.userId}/${uuidv7()}.${extensionFor(mediaType)}`
    await deps.storage.putObject(objectKey, bytes, mediaType)
  } else {
    classifyInput = { kind: 'text', text: scrubContacts(fields.text ?? '') }
  }

  const stated: InputKind | undefined = actor.role === 'teacher' ? 'notice' : fields.kind
  const provisional: InputKind = stated ?? (mediaType === 'application/pdf' ? 'notice' : fields.itemId ? 'work' : 'question')
  const inputId = uuidv7()
  const [row] = await deps.db
    .insert(inputs)
    .values({
      id: inputId,
      learnerId: actor.userId, // the uploader: a learner, or a teacher bringing a class notice
      kind: provisional,
      kindOverridden: stated !== undefined,
      text: fields.text ?? null,
      objectKey,
      attemptId: null,
      idempotencyKey: fields.idempotencyKey,
      // A learner's own input is student_provided; a teacher's class notice is school_provided (spec 03 §9.1).
      ...(actor.role === 'teacher'
        ? { provenance: 'school_provided' as const, provenanceDetail: null, trainingPermission: DEFAULT_TRAINING_PERMISSION }
        : provenanceColumns('learner_input')),
    })
    .returning()
  if (!row) throw new Error('input insert returned no row')
  await recordAudit(deps.db, { actorId: actor.userId, action: 'input.created', subjectType: 'input', subjectId: inputId, outcome: 'ok', requestId: input.requestId ?? null })

  let current = row
  let decided = stated !== undefined
  if (!decided && classifyInput && deps.gateway.configured) {
    const classified = await classify(deps, { userId: actor.userId, inputId, input: classifyInput })
    if (classified.kind && classified.kind !== current.kind) {
      const [updated] = await deps.db.update(inputs).set({ kind: classified.kind }).where(eq(inputs.id, inputId)).returning()
      if (updated) current = updated
    }
    decided = classified.decided
  }

  if (decided) {
    const attemptId = await route(deps, current, actor, { itemId: fields.itemId, mode: fields.mode, classId: fields.classId, requestId: input.requestId })
    if (attemptId) current = { ...current, attemptId }
  }
  return { input: await inputView(deps, current), replayed: false }
}

/** The person says what it is (or picks the item); the input is routed without a second upload. */
export async function setInputKind(deps: PracticeDeps, actor: Actor, inputId: string, body: { kind: InputKind; itemId?: string | undefined; mode?: AttemptMode | undefined; classId?: string | undefined }, requestId?: string): Promise<InputView> {
  if (!(await can(deps.db, actor, 'input.update', { type: 'input', id: inputId }))) throw notFound()
  const row = await findInput(deps, inputId)
  if (!row) throw notFound()
  if (row.attemptId && body.kind !== 'work') throw alreadyRouted()
  if (actor.role === 'teacher' && body.kind !== 'notice') throw new HttpError(400, 'teacher_notice_only', 'Teachers bring class notices here.')

  const [updated] = await deps.db
    .update(inputs)
    .set({ kind: body.kind, kindOverridden: true })
    .where(eq(inputs.id, inputId))
    .returning()
  if (!updated) throw notFound()
  await recordAudit(deps.db, { actorId: actor.userId, action: 'input.kind_changed', subjectType: 'input', subjectId: inputId, outcome: 'ok', requestId: requestId ?? null })

  let current = updated
  const attemptId = await route(deps, current, actor, { itemId: body.itemId, mode: body.mode, classId: body.classId, requestId })
  if (attemptId) current = { ...current, attemptId }
  return inputView(deps, current)
}

export async function listInputs(deps: PracticeDeps, actor: Actor, limit = 20): Promise<InputView[]> {
  const rows = await deps.db.select().from(inputs).where(eq(inputs.learnerId, actor.userId)).orderBy(desc(inputs.createdAt)).limit(limit)
  const views: InputView[] = []
  for (const row of rows) views.push(await inputView(deps, row))
  return views
}
