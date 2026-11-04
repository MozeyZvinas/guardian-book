import { and, asc, eq, inArray, lte } from 'drizzle-orm'
import { Router } from 'express'
import { dayOf, daysBetween, dueRetentionChecks, skillLabel, type BrainEvent, type CheckIn, type ChecksResponse } from '@guardian-book/shared'
import { requireActor, requireRole } from '../../auth/session.js'
import type { Db, DbOrTx } from '../../db/client.js'
import { interventions } from '../../db/schema.js'
import { loadBrainEvents } from '../../evidence/projection.js'

/**
 * `GET /api/me/checks` (spec 03 §9.3): what is due for this learner today. Two sources:
 * open interventions whose follow-up date has arrived (the teacher's one-line action, the
 * date, nothing else; spec 03 §9.2), and retention checks derived from the events (two days
 * after a correct independent check, until one is recorded). Today reads the same list.
 */
export interface ChecksClock {
  now: () => Date
  /** Days from a correct independent check to the follow-up check (B06, `RETENTION_CHECK_DAYS`). */
  retentionDays: number
}

export function checksRouter(db: Db, clock: ChecksClock = { now: () => new Date(), retentionDays: 2 }): Router {
  const router = Router()

  router.get('/api/me/checks', requireRole('learner'), async (_req, res, next) => {
    try {
      const actor = requireActor(res)
      const now = clock.now()
      const body: ChecksResponse = { today: dayOf(now), checks: await dueChecksFor(db, actor.userId, now, undefined, clock.retentionDays) }
      res.setHeader('Cache-Control', 'no-store')
      res.json(body)
    } catch (err) {
      next(err)
    }
  })

  return router
}

export async function dueChecksFor(db: DbOrTx, learnerId: string, now: Date, events?: BrainEvent[], retentionDays?: number): Promise<CheckIn[]> {
  const today = dayOf(now)
  const open = await db
    .select({ id: interventions.id, skillTag: interventions.skillTag, action: interventions.action, followUpOn: interventions.followUpOn })
    .from(interventions)
    .where(and(eq(interventions.learnerId, learnerId), inArray(interventions.status, ['open', 'checking']), lte(interventions.followUpOn, today)))
    .orderBy(asc(interventions.followUpOn))

  const checks: CheckIn[] = open.map((row) => ({
    kind: 'intervention',
    skillTag: row.skillTag,
    label: skillLabel(row.skillTag, 'learner'),
    dueOn: row.followUpOn,
    overdueDays: daysBetween(row.followUpOn, today),
    interventionId: row.id,
    action: row.action,
    sinceEventId: null,
  }))

  const covered = new Set(checks.map((check) => check.skillTag))
  for (const due of dueRetentionChecks(events ?? (await loadBrainEvents(db, learnerId)), now, retentionDays === undefined ? {} : { days: retentionDays })) {
    if (covered.has(due.skillTag)) continue // the teacher's follow-up already covers this skill
    checks.push({
      kind: 'retention',
      skillTag: due.skillTag,
      label: skillLabel(due.skillTag, 'learner'),
      dueOn: due.dueOn,
      overdueDays: due.overdueDays,
      interventionId: null,
      action: null,
      sinceEventId: due.sinceEventId,
    })
  }
  return checks.sort((a, b) => (a.dueOn !== b.dueOn ? (a.dueOn < b.dueOn ? -1 : 1) : a.skillTag < b.skillTag ? -1 : a.skillTag > b.skillTag ? 1 : 0))
}
