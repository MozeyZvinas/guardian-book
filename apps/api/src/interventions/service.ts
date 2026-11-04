import { and, asc, eq, gt, inArray, sql } from 'drizzle-orm'
import type { CreateInterventionBody, InterventionEvidence, InterventionView, PatchInterventionBody } from '@guardian-book/shared'
import { can, classMember } from '../access/index.js'
import { recordAudit } from '../audit/record.js'
import type { Actor } from '../auth/session.js'
import type { Db, DbOrTx } from '../db/client.js'
import { interventions, learningEvents, profiles } from '../db/schema.js'
import { appendEvent } from '../evidence/append.js'
import { HttpError, notFound } from '../lib/http.js'
import { eventSkillOutcome } from '../teacher/outcomes.js'

/**
 * Interventions (spec 03 §9.1 `interventions`, §9.2, §9.3; spec 05 §9 T2; brief B07 §2;
 * D35 mechanic 4): the teacher owns an action for one learner on one skill with a follow-up
 * date. `follow_up_on` is what the learner's check-in reads (`GET /api/me/checks`, B05).
 * Closing needs an outcome and at least one evidence event on the skill since assignment
 * (the follow-up check); the database CHECK enforces the same.
 */

export const outcomeRequired = () => new HttpError(400, 'outcome_required', 'Say how it went: improved, no change, or needs more.')
export const evidenceRequired = () => new HttpError(400, 'evidence_required', 'No follow-up check on this skill yet. Close it once the learner has checked it.')
export const evidenceUnknown = () => new HttpError(400, 'evidence_unknown', 'That evidence does not belong to this learner and skill.')
export const alreadyClosed = () => new HttpError(409, 'already_closed', 'This intervention is closed.')
export const learnerNotInClass = () => new HttpError(404, 'not_found', 'Not found.')

type Row = typeof interventions.$inferSelect

/** Evidence events on the skill recorded since the intervention was assigned. */
export async function evidenceSince(db: DbOrTx, row: Pick<Row, 'learnerId' | 'skillTag' | 'createdAt'>): Promise<InterventionEvidence[]> {
  const events = await db
    .select({ id: learningEvents.id, kind: learningEvents.kind, basis: learningEvents.basis, skillTag: learningEvents.skillTag, payload: learningEvents.payload, attemptId: learningEvents.attemptId, occurredAt: learningEvents.occurredAt })
    .from(learningEvents)
    .where(and(eq(learningEvents.learnerId, row.learnerId), gt(learningEvents.occurredAt, row.createdAt)))
    .orderBy(asc(learningEvents.occurredAt))
  const out: InterventionEvidence[] = []
  for (const event of events) {
    const outcome = eventSkillOutcome(event, row.skillTag)
    if (!outcome) continue
    out.push({ eventId: event.id, kind: event.kind, occurredAt: event.occurredAt.toISOString(), attemptId: event.attemptId, correct: outcome.correct, mode: outcome.mode })
  }
  return out
}

async function toView(db: DbOrTx, row: Row, people: Map<string, string>): Promise<InterventionView> {
  const evidence = row.status === 'closed' ? [] : await evidenceSince(db, row)
  return {
    id: row.id,
    learner: { id: row.learnerId, nickname: people.get(row.learnerId) ?? 'Learner' },
    classId: row.classId,
    skillTag: row.skillTag,
    owner: { id: row.ownerId, nickname: people.get(row.ownerId) ?? 'Teacher' },
    action: row.action,
    followUpOn: row.followUpOn,
    status: row.status,
    outcome: row.outcome,
    outcomeEvidenceEventIds: row.outcomeEvidenceEventIds,
    evidence,
    createdAt: row.createdAt.toISOString(),
    closedAt: row.closedAt?.toISOString() ?? null,
  }
}

async function nicknames(db: DbOrTx, ids: string[]): Promise<Map<string, string>> {
  if (ids.length === 0) return new Map()
  const rows = await db.select({ id: profiles.userId, nickname: profiles.nickname }).from(profiles).where(inArray(profiles.userId, [...new Set(ids)]))
  return new Map(rows.map((row) => [row.id, row.nickname]))
}

const STATUS_ORDER = sql`case ${interventions.status} when 'open' then 0 when 'checking' then 1 else 2 end`

async function views(db: DbOrTx, rows: Row[]): Promise<InterventionView[]> {
  const people = await nicknames(db, rows.flatMap((row) => [row.learnerId, row.ownerId]))
  const out: InterventionView[] = []
  for (const row of rows) out.push(await toView(db, row, people))
  return out
}

/** Open first, by follow-up date (spec 03 §9.3). */
export async function listInterventions(db: Db, actor: Actor, classId: string): Promise<InterventionView[]> {
  if (!(await can(db, actor, 'class.read', { type: 'class', id: classId }))) throw notFound()
  const rows = await db.select().from(interventions).where(eq(interventions.classId, classId)).orderBy(STATUS_ORDER, asc(interventions.followUpOn), asc(interventions.createdAt))
  return views(db, rows)
}

export async function listInterventionsForLearner(db: DbOrTx, learnerId: string, classIds: string[]): Promise<InterventionView[]> {
  if (classIds.length === 0) return []
  const rows = await db
    .select()
    .from(interventions)
    .where(and(eq(interventions.learnerId, learnerId), inArray(interventions.classId, classIds)))
    .orderBy(STATUS_ORDER, asc(interventions.followUpOn))
  return views(db, rows)
}

export async function createIntervention(db: Db, actor: Actor, body: CreateInterventionBody, requestId?: string): Promise<InterventionView> {
  if (!(await can(db, actor, 'intervention.create', { type: 'class', id: body.classId }))) throw notFound()
  if (!(await classMember(db, body.learnerId, body.classId))) throw learnerNotInClass()
  return db.transaction(async (tx) => {
    const [row] = await tx
      .insert(interventions)
      .values({ learnerId: body.learnerId, classId: body.classId, skillTag: body.skillTag, ownerId: actor.userId, action: body.action, followUpOn: body.followUpOn, status: 'open' })
      .returning()
    if (!row) throw new Error('intervention insert returned no row')
    await appendEvent(tx, {
      learnerId: body.learnerId,
      kind: 'intervention_assigned',
      skillTag: body.skillTag,
      basis: 'none',
      payload: { intervention_id: row.id, class_id: body.classId, owner_id: actor.userId, follow_up_on: body.followUpOn },
    })
    await recordAudit(tx, { actorId: actor.userId, action: 'intervention.assigned', subjectType: 'intervention', subjectId: row.id, outcome: 'ok', requestId: requestId ?? null })
    return toView(tx, row, await nicknames(tx, [row.learnerId, row.ownerId]))
  })
}

export async function patchIntervention(db: Db, actor: Actor, id: string, body: PatchInterventionBody, requestId?: string): Promise<InterventionView> {
  if (!(await can(db, actor, 'intervention.update', { type: 'intervention', id }))) throw notFound()
  return db.transaction(async (tx) => {
    const [existing] = await tx.select().from(interventions).where(eq(interventions.id, id)).for('update').limit(1)
    if (!existing) throw notFound()
    if (existing.status === 'closed') throw alreadyClosed()

    const closing = body.status === 'closed'
    const patch: Partial<typeof interventions.$inferInsert> = {}
    if (body.action !== undefined) patch.action = body.action
    if (body.followUpOn !== undefined) patch.followUpOn = body.followUpOn
    if (body.status !== undefined && !closing) patch.status = body.status

    let evidenceIds: string[] = []
    if (closing) {
      if (!body.outcome) throw outcomeRequired()
      const candidates = await evidenceSince(tx, existing)
      const known = new Set(candidates.map((e) => e.eventId))
      if (body.evidenceEventIds && body.evidenceEventIds.length > 0) {
        if (body.evidenceEventIds.some((eventId) => !known.has(eventId))) throw evidenceUnknown()
        evidenceIds = body.evidenceEventIds
      } else {
        evidenceIds = [...known]
      }
      if (evidenceIds.length === 0) throw evidenceRequired()
      patch.status = 'closed'
      patch.outcome = body.outcome
      patch.outcomeEvidenceEventIds = evidenceIds
      patch.closedAt = new Date()
    } else if (body.outcome !== undefined) {
      patch.outcome = body.outcome
    }

    const [updated] = await tx.update(interventions).set(patch).where(eq(interventions.id, id)).returning()
    if (!updated) throw notFound()
    if (closing) {
      await appendEvent(tx, {
        learnerId: updated.learnerId,
        kind: 'intervention_closed',
        skillTag: updated.skillTag,
        basis: 'none',
        payload: { intervention_id: updated.id, outcome: updated.outcome, evidence_event_ids: evidenceIds },
      })
    }
    await recordAudit(tx, { actorId: actor.userId, action: closing ? 'intervention.closed' : 'intervention.updated', subjectType: 'intervention', subjectId: updated.id, outcome: 'ok', requestId: requestId ?? null })
    return toView(tx, updated, await nicknames(tx, [updated.learnerId, updated.ownerId]))
  })
}
