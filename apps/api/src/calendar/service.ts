import { and, asc, count, countDistinct, desc, eq, inArray, isNull, ne, or, sql } from 'drizzle-orm'
import { DEFAULT_TRAINING_PERMISSION, type CalendarDecisionResponse, type CalendarEventView, type NoticeEvent, type NoticeState } from '@guardian-book/shared'
import { can } from '../access/index.js'
import { recordAudit } from '../audit/record.js'
import type { Actor } from '../auth/session.js'
import type { Db } from '../db/client.js'
import { calendarEvents, classMembers, classes, guardianLinks, inputs, modelRuns } from '../db/schema.js'
import { appendEvent } from '../evidence/append.js'
import { PromptSafetyError } from '../gateway/promptSafety.js'
import type { VerifiedRun } from '../gateway/verifiedCall.js'
import type { PracticeDeps } from '../inputs/deps.js'
import { scrubContacts } from '../inputs/text.js'
import { HttpError, notFound } from '../lib/http.js'
import { runModel, sastDay } from '../modelRuns/index.js'
import { extensionFor } from '../storage/images.js'
import { squash } from '../verify/text.js'
import { NOTICE_MAX_TOKENS, NOTICE_PROMPT_VERSION, NOTICE_TIMEOUT_MS, buildNoticeSystem, buildNoticeUser, type NoticeInput } from './noticePrompt.v1.js'

/**
 * Notice to plan (spec 02 P0-06; spec 03 §8.1 `calendar_events`, §8.2, §8.3; brief B04 §4).
 * One `notice` model call per input, verified (DATE_OUT_OF_RANGE, SOURCE_LINE_MISSING),
 * then events: `confirmed` when the model was sure (still editable), `proposed` when not.
 * Provenance follows who brought the notice: the school (a teacher) or the learner.
 * Duplicates (same scope, date and title) are merged. A rejected event never reaches a guardian.
 *
 * B16 §5: an accepted answer with no dated events is `not_a_notice` ("I couldn't find any
 * dates on this"), never `extracted`; `failed` is kept for a real failure (the gateway could
 * not get an answer), and every non-accepted run logs its verifier codes.
 */

export type CalendarScope = { type: 'class'; id: string } | { type: 'learner'; id: string }

export const noticeJobKey = (inputId: string): string => `notice:${inputId}`

const isPdfKey = (key: string | null): boolean => Boolean(key && key.endsWith(`.${extensionFor('application/pdf')}`))

/** The background job: extract events from the input and write them for `scope`. */
export async function extractNotice(deps: PracticeDeps, params: { inputId: string; userId: string; role: 'learner' | 'teacher'; scope: CalendarScope }): Promise<void> {
  const { db, logger } = deps
  const [input] = await db.select().from(inputs).where(eq(inputs.id, params.inputId)).limit(1)
  if (!input) return
  if (isPdfKey(input.objectKey)) return // stored, not read: the view says `unsupported_pdf`

  let prompt: NoticeInput
  if (input.text !== null) {
    prompt = { kind: 'text', text: scrubContacts(input.text) }
  } else {
    const object = input.objectKey && deps.storage ? await deps.storage.getObject(input.objectKey) : null
    const mediaType = object?.contentType
    if (!object || (mediaType !== 'image/jpeg' && mediaType !== 'image/png' && mediaType !== 'image/webp')) {
      logger.warn('notice: image unavailable', { inputId: params.inputId, hasStorage: Boolean(deps.storage) })
      return
    }
    prompt = { kind: 'image', image: { kind: 'base64', mediaType, data: object.body.toString('base64') } }
  }

  const today = sastDay(deps.now())
  let user: ReturnType<typeof buildNoticeUser>
  try {
    user = buildNoticeUser(prompt, today)
  } catch (err) {
    if (err instanceof PromptSafetyError) {
      logger.warn('notice: prompt refused by the safety guard', { inputId: params.inputId, reason: err.reason })
      return
    }
    throw err
  }

  let outcome
  try {
    outcome = await runModel(deps, {
      userId: params.userId,
      purpose: 'notice',
      subjectType: 'input',
      subjectId: params.inputId,
      promptVersion: NOTICE_PROMPT_VERSION,
      system: buildNoticeSystem(),
      user: user.text,
      images: user.images,
      context: { today, sourceText: prompt.kind === 'text' ? prompt.text : null },
      maxTokens: NOTICE_MAX_TOKENS,
      timeoutMs: NOTICE_TIMEOUT_MS,
      signal: AbortSignal.timeout(120_000),
    })
  } catch (err) {
    if (err instanceof HttpError && err.code === 'budget_exhausted') return
    logger.error('notice: run failed', { inputId: params.inputId, err })
    return
  }
  const { result } = outcome
  if (result.status !== 'accepted' || !result.output) {
    logger.warn('notice: not accepted', { inputId: params.inputId, status: result.status, error: result.error?.code ?? null, calls: result.runs.length, failedChecks: failedCheckCodes(result.runs) })
    return
  }
  if (result.output.not_a_notice || result.output.events.length === 0) {
    logger.info('notice: no dated events', { inputId: params.inputId, notANotice: result.output.not_a_notice, calls: result.runs.length })
    return
  }

  // Brief B04 §4: `school_provided` for a teacher's upload, `student_provided` for a learner's;
  // never training-permitted (D35).
  const provenance = {
    provenance: params.role === 'teacher' ? ('school_provided' as const) : ('student_provided' as const),
    provenanceDetail: null,
    trainingPermission: DEFAULT_TRAINING_PERMISSION,
  }
  const events = dedupeEvents(result.output.events)
  const existing = await db
    .select({ onDate: calendarEvents.onDate, title: calendarEvents.title })
    .from(calendarEvents)
    .where(and(eq(calendarEvents.scopeType, params.scope.type), eq(calendarEvents.scopeId, params.scope.id), ne(calendarEvents.status, 'rejected')))
  const known = new Set(existing.map((row) => eventKey(row.onDate, row.title)))
  const fresh = events.filter((event) => !known.has(eventKey(event.on_date, event.title)))
  if (fresh.length === 0) return
  await db.insert(calendarEvents).values(
    fresh.map((event) => ({
      scopeType: params.scope.type,
      scopeId: params.scope.id,
      title: event.title,
      subject: event.subject,
      paper: event.paper,
      onDate: event.on_date,
      sourceInputId: params.inputId,
      sourceLine: event.source_line,
      confidence: event.confidence,
      status: event.confidence === 'high' ? ('confirmed' as const) : ('proposed' as const),
      confirmedBy: null,
      ...provenance,
    })),
  )
}

export const eventKey = (onDate: string, title: string): string => `${onDate}|${squash(title)}`

/** The verifier codes that failed, per call, for the log ("why was this not accepted?"). */
export function failedCheckCodes(runs: ReadonlyArray<Pick<VerifiedRun, 'checks'>>): string[][] {
  return runs.map((run) => run.checks.filter((check) => !check.passed).map((check) => check.code))
}

/** Same date and (normalised) title → one event; the first occurrence wins. */
export function dedupeEvents(events: NoticeEvent[]): NoticeEvent[] {
  const seen = new Set<string>()
  const out: NoticeEvent[] = []
  for (const event of events) {
    const key = eventKey(event.on_date, event.title)
    if (seen.has(key)) continue
    seen.add(key)
    out.push(event)
  }
  return out
}

/** Where a notice input stands, for its view. */
export async function noticeState(deps: PracticeDeps, input: { id: string; kind: string; objectKey: string | null }): Promise<{ state: NoticeState; events: number; proposed: number }> {
  if (input.kind !== 'notice') return { state: 'none', events: 0, proposed: 0 }
  const [counts] = await deps.db
    .select({
      events: count(),
      proposed: sql<number>`count(*) filter (where ${calendarEvents.status} = 'proposed')`.mapWith(Number),
    })
    .from(calendarEvents)
    .where(and(eq(calendarEvents.sourceInputId, input.id), ne(calendarEvents.status, 'rejected')))
  const events = counts?.events ?? 0
  const proposed = counts?.proposed ?? 0
  if (deps.jobs.isRunning(noticeJobKey(input.id))) return { state: 'extracting', events, proposed }
  if (isPdfKey(input.objectKey)) return { state: 'unsupported_pdf', events, proposed }
  const [run] = await deps.db
    .select({ status: modelRuns.status, output: modelRuns.output })
    .from(modelRuns)
    .where(and(eq(modelRuns.subjectType, 'input'), eq(modelRuns.subjectId, input.id), eq(modelRuns.purpose, 'notice')))
    .orderBy(desc(modelRuns.createdAt))
    .limit(1)
  if (!run) return { state: 'none', events, proposed }
  if (run.status === 'accepted') {
    const output = run.output as { not_a_notice?: boolean; events?: unknown[] } | null
    const dated = Array.isArray(output?.events) ? output.events.length : 0
    // No dated events (whether the model said "not a notice" or just found none) reads as
    // "I couldn't find any dates on this", never as "dates found" (B16 §5).
    return { state: output?.not_a_notice || dated === 0 ? 'not_a_notice' : 'extracted', events, proposed }
  }
  if (run.status === 'exhausted' || run.status === 'retried') return { state: 'uncertain', events, proposed }
  return { state: 'failed', events, proposed }
}

// ── reading and deciding ──────────────────────────────────────────────────────────────────

type EventRow = typeof calendarEvents.$inferSelect

function toView(row: EventRow, canDecide: boolean): CalendarEventView {
  return {
    id: row.id,
    scopeType: row.scopeType,
    scopeId: row.scopeId,
    title: row.title,
    subject: row.subject,
    paper: row.paper,
    onDate: row.onDate,
    sourceLine: row.sourceLine,
    confidence: row.confidence,
    status: row.status,
    sourceInputId: row.sourceInputId,
    canDecide,
    createdAt: row.createdAt.toISOString(),
  }
}

/** The calendar as this role sees it (spec 03 §8.2): guardians `confirmed` only; nobody sees `rejected`. */
export async function listCalendar(db: Db, actor: Actor, scope?: CalendarScope): Promise<CalendarEventView[]> {
  const notRejected = ne(calendarEvents.status, 'rejected')
  const confirmed = eq(calendarEvents.status, 'confirmed')
  let where
  let decidable: (row: EventRow) => boolean = () => false

  if (actor.role === 'learner') {
    const memberOf = (await db.select({ classId: classMembers.classId }).from(classMembers).where(eq(classMembers.learnerId, actor.userId))).map((r) => r.classId)
    where = and(
      notRejected,
      or(
        and(eq(calendarEvents.scopeType, 'learner'), eq(calendarEvents.scopeId, actor.userId)),
        memberOf.length > 0 ? and(eq(calendarEvents.scopeType, 'class'), inArray(calendarEvents.scopeId, memberOf), confirmed) : sql`false`,
      ),
    )
    decidable = (row) => row.scopeType === 'learner' && row.scopeId === actor.userId
  } else if (actor.role === 'guardian') {
    const linked = (
      await db.select({ learnerId: guardianLinks.learnerId }).from(guardianLinks).where(and(eq(guardianLinks.guardianId, actor.userId), isNull(guardianLinks.revokedAt)))
    ).map((r) => r.learnerId)
    if (linked.length === 0) return []
    const classIds = (await db.select({ classId: classMembers.classId }).from(classMembers).where(inArray(classMembers.learnerId, linked))).map((r) => r.classId)
    where = and(
      confirmed,
      or(
        and(eq(calendarEvents.scopeType, 'learner'), inArray(calendarEvents.scopeId, linked)),
        classIds.length > 0 ? and(eq(calendarEvents.scopeType, 'class'), inArray(calendarEvents.scopeId, classIds)) : sql`false`,
      ),
    )
  } else if (actor.role === 'teacher') {
    if (!actor.schoolId) return []
    const own = (
      await db.select({ id: classes.id }).from(classes).where(and(eq(classes.teacherId, actor.userId), eq(classes.schoolId, actor.schoolId)))
    ).map((r) => r.id)
    if (own.length === 0) return []
    where = and(notRejected, eq(calendarEvents.scopeType, 'class'), inArray(calendarEvents.scopeId, own))
    decidable = (row) => own.includes(row.scopeId)
  } else {
    where = notRejected // admin, audited by the route
  }

  if (scope) where = and(where, eq(calendarEvents.scopeType, scope.type), eq(calendarEvents.scopeId, scope.id))
  const rows = await db.select().from(calendarEvents).where(where).orderBy(asc(calendarEvents.onDate), asc(calendarEvents.createdAt))
  return rows.map((row) => toView(row, decidable(row)))
}

export async function decideEvent(db: Db, actor: Actor, eventId: string, decision: 'confirmed' | 'rejected', requestId?: string): Promise<CalendarDecisionResponse> {
  if (!(await can(db, actor, 'calendar_event.decide', { type: 'calendar_event', id: eventId }))) throw notFound()
  const updated = await db.transaction(async (tx) => {
    const [row] = await tx
      .update(calendarEvents)
      .set({ status: decision, confirmedBy: actor.userId })
      .where(eq(calendarEvents.id, eventId))
      .returning()
    if (!row) throw notFound()
    if (row.scopeType === 'learner' && decision === 'confirmed') {
      await appendEvent(tx, {
        learnerId: row.scopeId,
        kind: 'notice_confirmed',
        basis: 'none',
        payload: { event_id: row.id, on_date: row.onDate },
      })
    }
    await recordAudit(tx, {
      actorId: actor.userId,
      action: 'calendar.decided',
      subjectType: 'calendar_event',
      subjectId: row.id,
      outcome: 'ok',
      requestId: requestId ?? null,
    })
    return row
  })

  let published: CalendarDecisionResponse['published'] = null
  if (updated.scopeType === 'class' && decision === 'confirmed') {
    const [learners] = await db.select({ n: count() }).from(classMembers).where(eq(classMembers.classId, updated.scopeId))
    const [guardians] = await db
      .select({ n: countDistinct(guardianLinks.guardianId) })
      .from(guardianLinks)
      .innerJoin(classMembers, eq(classMembers.learnerId, guardianLinks.learnerId))
      .where(and(eq(classMembers.classId, updated.scopeId), isNull(guardianLinks.revokedAt)))
    published = { learners: learners?.n ?? 0, guardians: guardians?.n ?? 0 }
  }
  return { event: toView(updated, true), published }
}
