import { and, asc, desc, eq, gte, inArray, isNull } from 'drizzle-orm'
import {
  skillLabel,
  TEACHER_ORIGIN_LABEL,
  originAfterApproval,
  provenanceColumns,
  publicOriginLabel,
  type ApproveNoteBody,
  type CreateNoteBody,
  type DraftNotesResponse,
  type DraftSkipReason,
  type GuardianNoteView,
  type Language,
  type NoteView,
  type NotesResponse,
} from '@guardian-book/shared'
import { can } from '../access/index.js'
import { recordAudit } from '../audit/record.js'
import type { Actor } from '../auth/session.js'
import type { Db, DbOrTx } from '../db/client.js'
import { classMembers, classes, guardianLinks, learningEvents, notes, profiles } from '../db/schema.js'
import { appendEvent } from '../evidence/append.js'
import { PromptSafetyError } from '../gateway/promptSafety.js'
import { HttpError, notFound } from '../lib/http.js'
import { runModel } from '../modelRuns/index.js'
import type { TeacherDeps } from '../teacher/deps.js'
import { skillOutcomes, trustedOutcomes, type AttemptOutcome } from '../teacher/outcomes.js'
import { weekStartSast } from '../teacher/week.js'
import { preferredLanguage, translationFor, type TranslateDeps } from '../translate/service.js'
import { NOTE_MAX_TOKENS, NOTE_PROMPT_VERSION, NOTE_TIMEOUT_MS, buildNoteSystem, buildNoteUser, evidenceAlias, type NoteWeekSummary } from './notePrompt.v1.js'

/**
 * T4 · Notes home (spec 03 §8.1 `notes`, §8.2, §8.3, §9.1; spec 05 §4.4 T4; brief B07 §4).
 * One `note` model call per guardian of a learner with a lost step this week (aggregates of
 * that learner only), stored as a draft with origin `ai_suggested`; the teacher edits and
 * approves (origin `teacher_approved`, or `teacher_revised` when edited) and sends. A
 * guardian sees a note only once `sent`, labelled "Teacher-reviewed" (or with the teacher's
 * name for her own words). The teacher can also write a note herself (`teacher_added`).
 */

export const noGuardian = () => new HttpError(400, 'no_guardian', 'This learner has no linked parent or guardian yet.')
export const notApproved = () => new HttpError(409, 'not_approved', 'Approve the note before sending it.')
export const alreadySent = () => new HttpError(409, 'already_sent', 'This note has been sent; it cannot change.')

type NoteRow = typeof notes.$inferSelect

async function nicknames(db: DbOrTx, ids: string[]): Promise<Map<string, string>> {
  if (ids.length === 0) return new Map()
  const rows = await db.select({ id: profiles.userId, nickname: profiles.nickname }).from(profiles).where(inArray(profiles.userId, [...new Set(ids)]))
  return new Map(rows.map((row) => [row.id, row.nickname]))
}

function noteView(row: NoteRow, people: Map<string, string>): NoteView {
  return {
    id: row.id,
    learner: { id: row.learnerId, nickname: people.get(row.learnerId) ?? 'Learner' },
    guardian: { id: row.guardianId, nickname: people.get(row.guardianId) ?? 'Guardian' },
    status: row.status,
    origin: row.origin,
    originLabel: TEACHER_ORIGIN_LABEL[row.origin],
    audience: row.audience,
    draftText: row.draftText,
    finalText: row.finalText,
    modelRunId: row.modelRunId,
    approvedAt: row.approvedAt?.toISOString() ?? null,
    sentAt: row.sentAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  }
}

async function views(db: DbOrTx, rows: NoteRow[]): Promise<NoteView[]> {
  const people = await nicknames(db, rows.flatMap((row) => [row.learnerId, row.guardianId]))
  return rows.map((row) => noteView(row, people))
}

async function classMembersOf(db: DbOrTx, classId: string): Promise<Array<{ id: string; nickname: string }>> {
  return db
    .select({ id: classMembers.learnerId, nickname: profiles.nickname })
    .from(classMembers)
    .innerJoin(profiles, eq(profiles.userId, classMembers.learnerId))
    .where(eq(classMembers.classId, classId))
    .orderBy(profiles.nickname)
}

async function activeGuardians(db: DbOrTx, learnerId: string): Promise<string[]> {
  const rows = await db
    .select({ guardianId: guardianLinks.guardianId })
    .from(guardianLinks)
    .where(and(eq(guardianLinks.learnerId, learnerId), isNull(guardianLinks.revokedAt)))
  return rows.map((row) => row.guardianId)
}

// ── reading ────────────────────────────────────────────────────────────────────────────────

export async function listNotes(db: Db, actor: Actor, classId: string): Promise<NotesResponse> {
  if (!(await can(db, actor, 'class.read', { type: 'class', id: classId }))) throw notFound()
  const [cls] = await db.select({ id: classes.id, name: classes.name }).from(classes).where(eq(classes.id, classId)).limit(1)
  if (!cls) throw notFound()
  const members = await classMembersOf(db, classId)
  if (members.length === 0) return { class: cls, notes: [] }
  const rows = await db
    .select()
    .from(notes)
    .where(and(eq(notes.teacherId, actor.userId), inArray(notes.learnerId, members.map((m) => m.id))))
    .orderBy(desc(notes.createdAt))
  return { class: cls, notes: await views(db, rows) }
}

// ── drafting ───────────────────────────────────────────────────────────────────────────────

/** Pure: one learner's week as the prompt sees it. Never names, never another learner. */
export function weekSummary(outcomes: readonly AttemptOutcome[], evidence: Array<{ id: string; kind: string; attemptId: string | null }>, weekStart: string): NoteWeekSummary {
  const lostSteps = new Map<string, { skill: string; step: string; topic: string; times: number }>()
  const found = new Set<string>()
  let stepsFound = 0
  let stepsLost = 0
  const topics = new Set<string>()
  const lostByAttempt = new Map<string, boolean>()
  for (const outcome of outcomes) {
    topics.add(outcome.itemTopic)
    let anyLost = false
    for (const step of outcome.steps) {
      if (step.awarded < step.available) {
        stepsLost += 1
        anyLost = true
        const key = `${outcome.itemSlug}#${step.stepNo}`
        const entry = lostSteps.get(key)
        if (entry) entry.times += 1
        else lostSteps.set(key, { skill: skillLabel(step.skillTag, 'guardian'), step: step.criterion, topic: outcome.itemTopic, times: 1 })
      } else {
        stepsFound += 1
      }
    }
    lostByAttempt.set(outcome.attemptId, anyLost)
    for (const tag of skillOutcomes(outcome.steps).correct) found.add(skillLabel(tag, 'guardian'))
  }
  return {
    week_start: weekStart,
    attempts: outcomes.length,
    steps_found: stepsFound,
    steps_lost: stepsLost,
    topics: [...topics],
    lost_steps: [...lostSteps.values()],
    found_skills: [...found],
    evidence: evidence.map((event, index) => ({
      id: evidenceAlias(index),
      kind: event.kind,
      result: event.attemptId === null ? 'mixed' : lostByAttempt.get(event.attemptId) ? 'lost' : 'found',
    })),
  }
}

/** The event IDs behind the aliases the model cited (unknown aliases are dropped; the verifier already refused them). */
export function citedEventIds(aliases: readonly string[], evidence: ReadonlyArray<{ id: string }>): string[] {
  const byAlias = new Map(evidence.map((event, index) => [evidenceAlias(index), event.id]))
  return [...new Set(aliases.map((alias) => byAlias.get(alias)).filter((id): id is string => typeof id === 'string'))]
}

export async function draftNotes(deps: TeacherDeps, actor: Actor, classId: string, requestId?: string): Promise<DraftNotesResponse> {
  const { db } = deps
  if (!(await can(db, actor, 'class.read', { type: 'class', id: classId }))) throw notFound()
  const now = deps.now()
  const weekStart = weekStartSast(now)
  const weekStartDay = weekStart.toISOString().slice(0, 10)
  const members = await classMembersOf(db, classId)
  const drafted: NoteRow[] = []
  const skipped: DraftNotesResponse['skipped'] = []
  let budgetGone = false

  for (const learner of members) {
    const skip = (reason: DraftSkipReason) => skipped.push({ learner, reason })
    const guardians = await activeGuardians(db, learner.id)
    if (guardians.length === 0) {
      skip('no_guardian')
      continue
    }
    const outcomes = await trustedOutcomes(db, [learner.id], { since: weekStart })
    const lostAny = outcomes.some((outcome) => outcome.steps.some((step) => step.awarded < step.available))
    if (!lostAny) {
      skip('no_lost_step')
      continue
    }
    const attemptIds = outcomes.map((outcome) => outcome.attemptId)
    const evidence = await db
      .select({ id: learningEvents.id, kind: learningEvents.kind, attemptId: learningEvents.attemptId })
      .from(learningEvents)
      .where(and(eq(learningEvents.learnerId, learner.id), inArray(learningEvents.attemptId, attemptIds), inArray(learningEvents.kind, ['assessed', 'review_confirmed', 'review_released'])))
      .orderBy(asc(learningEvents.occurredAt))
    if (evidence.length === 0) {
      skip('uncertain')
      continue
    }
    for (const guardianId of guardians) {
      const [existing] = await db
        .select({ id: notes.id })
        .from(notes)
        .where(and(eq(notes.teacherId, actor.userId), eq(notes.learnerId, learner.id), eq(notes.guardianId, guardianId), gte(notes.createdAt, weekStart)))
        .limit(1)
      if (existing) {
        skip('already_drafted')
        continue
      }
      if (!deps.gateway.configured) {
        skip('model_not_configured')
        continue
      }
      if (budgetGone) {
        skip('budget_exhausted')
        continue
      }
      let user: string
      try {
        user = buildNoteUser(weekSummary(outcomes, evidence, weekStartDay))
      } catch (err) {
        if (err instanceof PromptSafetyError) {
          deps.logger.warn('note: prompt refused by the safety guard', { learnerId: learner.id, reason: err.reason })
          skip('uncertain')
          continue
        }
        throw err
      }
      let outcome
      try {
        outcome = await runModel(deps, {
          userId: actor.userId,
          purpose: 'note',
          subjectType: 'learner',
          subjectId: learner.id,
          promptVersion: NOTE_PROMPT_VERSION,
          system: buildNoteSystem(),
          user,
          context: { knownEvidenceIds: evidence.map((_event, index) => evidenceAlias(index)) },
          maxTokens: NOTE_MAX_TOKENS,
          timeoutMs: NOTE_TIMEOUT_MS,
        })
      } catch (err) {
        if (err instanceof HttpError && err.code === 'budget_exhausted') {
          budgetGone = true
          skip('budget_exhausted')
          continue
        }
        deps.logger.error('note: run failed', { learnerId: learner.id, err })
        skip('uncertain')
        continue
      }
      const { result, lastRunId } = outcome
      if (result.status !== 'accepted' || !result.output || !lastRunId) {
        // Fail closed: no draft, the teacher writes her own (spec 02 §6 cut 4).
        await recordAudit(db, { actorId: actor.userId, action: 'note.draft_refused', subjectType: 'learner', subjectId: learner.id, outcome: 'refused', requestId: requestId ?? null })
        skip('uncertain')
        continue
      }
      const lastRun = [...result.runs].reverse().find((run) => run.requestId) ?? result.runs[result.runs.length - 1]
      const cited = citedEventIds(result.output.evidence_event_ids, evidence)
      deps.logger.info('note drafted', { learnerId: learner.id, cited: cited.length, runId: lastRunId })
      const [row] = await db
        .insert(notes)
        .values({
          teacherId: actor.userId,
          learnerId: learner.id,
          guardianId,
          draftText: result.output.text,
          finalText: null,
          modelRunId: lastRunId,
          status: 'draft',
          origin: 'ai_suggested',
          audience: 'guardian',
          ...provenanceColumns('model_output', {
            provider: result.provenance?.provider ?? 'meta',
            model: lastRun?.model ?? deps.gateway.model,
            version: NOTE_PROMPT_VERSION,
            model_run_id: lastRunId,
          }),
        })
        .returning()
      if (!row) throw new Error('note insert returned no row')
      await recordAudit(db, { actorId: actor.userId, action: 'note.drafted', subjectType: 'note', subjectId: row.id, outcome: 'ok', requestId: requestId ?? null })
      drafted.push(row)
    }
  }
  return { weekStart: weekStartDay, notes: await views(db, drafted), skipped }
}

// ── the teacher's own note, approve, send ──────────────────────────────────────────────────

export async function createNote(db: Db, actor: Actor, body: CreateNoteBody, requestId?: string): Promise<NoteView[]> {
  if (!(await can(db, actor, 'note.create', { type: 'learner', id: body.learnerId }))) throw notFound()
  const guardians = await activeGuardians(db, body.learnerId)
  if (guardians.length === 0) throw noGuardian()
  return db.transaction(async (tx) => {
    const rows: NoteRow[] = []
    for (const guardianId of guardians) {
      const [row] = await tx
        .insert(notes)
        .values({ teacherId: actor.userId, learnerId: body.learnerId, guardianId, draftText: body.text, status: 'draft', origin: 'teacher_added', audience: 'guardian', ...provenanceColumns('teacher_note') })
        .returning()
      if (!row) throw new Error('note insert returned no row')
      await recordAudit(tx, { actorId: actor.userId, action: 'note.created', subjectType: 'note', subjectId: row.id, outcome: 'ok', requestId: requestId ?? null })
      rows.push(row)
    }
    return views(tx, rows)
  })
}

export async function approveNote(db: Db, actor: Actor, noteId: string, body: ApproveNoteBody, requestId?: string): Promise<NoteView> {
  if (!(await can(db, actor, 'note.update', { type: 'note', id: noteId }))) throw notFound()
  return db.transaction(async (tx) => {
    const [existing] = await tx.select().from(notes).where(eq(notes.id, noteId)).for('update').limit(1)
    if (!existing) throw notFound()
    if (existing.status === 'sent') throw alreadySent()
    const origin = originAfterApproval(existing.origin, existing.draftText, body.finalText)
    const [updated] = await tx
      .update(notes)
      .set({ status: 'approved', finalText: body.finalText, origin, approvedAt: new Date() })
      .where(eq(notes.id, noteId))
      .returning()
    if (!updated) throw notFound()
    await recordAudit(tx, { actorId: actor.userId, action: 'note.approved', subjectType: 'note', subjectId: noteId, outcome: 'ok', requestId: requestId ?? null })
    return noteView(updated, await nicknames(tx, [updated.learnerId, updated.guardianId]))
  })
}

export async function sendNote(db: Db, actor: Actor, noteId: string, requestId?: string): Promise<NoteView> {
  if (!(await can(db, actor, 'note.update', { type: 'note', id: noteId }))) throw notFound()
  return db.transaction(async (tx) => {
    const [existing] = await tx.select().from(notes).where(eq(notes.id, noteId)).for('update').limit(1)
    if (!existing) throw notFound()
    if (existing.status === 'sent') throw alreadySent()
    if (existing.status !== 'approved' || existing.finalText === null) throw notApproved()
    const [updated] = await tx.update(notes).set({ status: 'sent', sentAt: new Date() }).where(eq(notes.id, noteId)).returning()
    if (!updated) throw notFound()
    await appendEvent(tx, {
      learnerId: updated.learnerId,
      kind: 'note_sent',
      basis: 'none',
      payload: { note_id: updated.id, origin: updated.origin, audience: updated.audience },
    })
    await recordAudit(tx, { actorId: actor.userId, action: 'note.sent', subjectType: 'note', subjectId: noteId, outcome: 'ok', requestId: requestId ?? null })
    return noteView(updated, await nicknames(tx, [updated.learnerId, updated.guardianId]))
  })
}

// ── the guardian's side ────────────────────────────────────────────────────────────────────

/**
 * A sent note as its guardian reads it, with its translation state in the guardian's
 * language (B12): the cached translation, or `pending` while the background job writes it.
 * Only a `sent` row ever reaches this function, so nothing is translated before sending.
 */
async function guardianView(deps: TranslateDeps, actor: Actor, row: NoteRow, people: Map<string, string>, language: Language): Promise<GuardianNoteView> {
  const teacherNickname = people.get(row.teacherId) ?? 'Your teacher'
  const learnerNickname = people.get(row.learnerId) ?? 'Learner'
  const text = row.finalText ?? row.draftText
  return {
    id: row.id,
    learner: { id: row.learnerId, nickname: learnerNickname },
    teacher: { id: row.teacherId, nickname: teacherNickname },
    label: publicOriginLabel(row.origin, teacherNickname),
    text,
    sentAt: (row.sentAt ?? row.createdAt).toISOString(),
    translation: await translationFor(deps, { kind: 'note', id: row.id, text, names: { learner: learnerNickname, teacher: teacherNickname } }, language, actor.userId),
  }
}

/** `GET /api/guardian/notes`: sent notes addressed to this guardian, for linked learners, newest first (spec 03 §8.2, §8.3). */
export async function guardianNotes(deps: TranslateDeps, actor: Actor, language?: Language): Promise<GuardianNoteView[]> {
  const { db } = deps
  const lang = language ?? (await preferredLanguage(db, actor.userId))
  const rows = await db
    .select({ note: notes })
    .from(notes)
    .innerJoin(guardianLinks, and(eq(guardianLinks.learnerId, notes.learnerId), eq(guardianLinks.guardianId, notes.guardianId), isNull(guardianLinks.revokedAt)))
    .where(and(eq(notes.guardianId, actor.userId), eq(notes.status, 'sent'), eq(notes.audience, 'guardian')))
    .orderBy(desc(notes.sentAt))
  const list = rows.map((row) => row.note)
  const people = await nicknames(db, list.flatMap((row) => [row.learnerId, row.teacherId]))
  const out: GuardianNoteView[] = []
  for (const row of list) out.push(await guardianView(deps, actor, row, people, lang))
  return out
}

/** One note, for its guardian, once sent; anything else is a 404 (a `draft` note requested by its guardian → 404). */
export async function guardianNote(deps: TranslateDeps, actor: Actor, noteId: string): Promise<GuardianNoteView> {
  const { db } = deps
  if (!(await can(db, actor, 'note.read', { type: 'note', id: noteId }))) throw notFound()
  const [row] = await db.select().from(notes).where(eq(notes.id, noteId)).limit(1)
  if (!row || row.status !== 'sent' || row.audience !== 'guardian') throw notFound()
  return guardianView(deps, actor, row, await nicknames(db, [row.learnerId, row.teacherId]), await preferredLanguage(db, actor.userId))
}
