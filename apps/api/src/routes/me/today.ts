import { and, asc, desc, eq, gte, inArray, isNull, or } from 'drizzle-orm'
import { Router } from 'express'
import { dayOf, daysBetween, planLearnerViewSchema, type RecentInput, type RecentInputStatus, type TodayResponse } from '@guardian-book/shared'
import { requireActor, requireRole } from '../../auth/session.js'
import type { Db } from '../../db/client.js'
import { assessments, attempts, calendarEvents, classMembers, guardianLinks, helpPlans, inputs, learningEvents, profiles } from '../../db/schema.js'
import { loadBrainEvents } from '../../evidence/projection.js'
import { notFound } from '../../lib/http.js'
import { learnerPractice } from '../../library/service.js'
import { latestGapEvent } from '../../plans/service.js'
import { dueChecksFor, type ChecksClock } from './checks.js'

/**
 * `GET /api/me/today` (spec 05 §4.2 L1, §9): open → one next step. The exam chip (next
 * confirmed calendar event), tonight's step (the current Help Plan's learner view, else
 * nothing yet), the check-ins due (they outrank tonight's step on the screen), the last
 * three inputs with their status, and whether a guardian is linked.
 */
export function todayRouter(db: Db, clock: ChecksClock = { now: () => new Date(), retentionDays: 2 }): Router {
  const router = Router()

  router.get('/api/me/today', requireRole('learner'), async (_req, res, next) => {
    try {
      const actor = requireActor(res)
      const now = clock.now()
      const today = dayOf(now)

      const [profile] = await db.select({ nickname: profiles.nickname, cards: profiles.cards }).from(profiles).where(eq(profiles.userId, actor.userId)).limit(1)
      if (!profile) throw notFound()

      const memberships = await db.select({ classId: classMembers.classId }).from(classMembers).where(eq(classMembers.learnerId, actor.userId))
      const classIds = memberships.map((m) => m.classId)
      const scopeFilter = or(
        and(eq(calendarEvents.scopeType, 'learner'), eq(calendarEvents.scopeId, actor.userId)),
        classIds.length > 0 ? and(eq(calendarEvents.scopeType, 'class'), inArray(calendarEvents.scopeId, classIds)) : undefined,
      )
      const [nextEvent] = await db
        .select({ id: calendarEvents.id, title: calendarEvents.title, subject: calendarEvents.subject, paper: calendarEvents.paper, onDate: calendarEvents.onDate })
        .from(calendarEvents)
        .where(and(eq(calendarEvents.status, 'confirmed'), gte(calendarEvents.onDate, today), scopeFilter))
        .orderBy(asc(calendarEvents.onDate), asc(calendarEvents.id))
        .limit(1)

      const [plan] = await db
        .select({ id: helpPlans.id, learnerView: helpPlans.learnerView, gapSkillTag: helpPlans.gapSkillTag })
        .from(helpPlans)
        .where(and(eq(helpPlans.learnerId, actor.userId), eq(helpPlans.status, 'issued')))
        .orderBy(desc(helpPlans.createdAt))
        .limit(1)
      const learnerView = plan ? planLearnerViewSchema.safeParse(plan.learnerView) : null
      // "Start" opens fix-it on the attempt the gap came from (B06).
      const gapAttempt = plan ? await latestGapEvent(db, actor.userId, plan.gapSkillTag) : null
      const tonight: TodayResponse['tonight'] =
        plan && learnerView?.success
          ? { kind: 'plan', planId: plan.id, step: learnerView.data.tonight_step.text, hint: learnerView.data.hint, why: learnerView.data.why_it_matters.text, attemptId: gapAttempt?.attemptId ?? null }
          : { kind: 'none' }

      const events = await loadBrainEvents(db, actor.userId)
      const checkIns = await dueChecksFor(db, actor.userId, now, events, clock.retentionDays)

      const [link] = await db
        .select({ learnerId: guardianLinks.learnerId })
        .from(guardianLinks)
        .where(and(eq(guardianLinks.learnerId, actor.userId), isNull(guardianLinks.revokedAt)))
        .limit(1)

      const body: TodayResponse = {
        nickname: profile.nickname,
        today,
        exam: nextEvent ? { ...nextEvent, daysAway: daysBetween(today, nextEvent.onDate) } : null,
        tonight,
        checkIns,
        // B17: class practice from the library, soonest due first.
        practice: await learnerPractice(db, actor.userId, now),
        recent: await recentInputs(db, actor.userId),
        guardianLinked: Boolean(link),
        hasCards: profile.cards !== null,
      }
      res.setHeader('Cache-Control', 'no-store')
      res.json(body)
    } catch (err) {
      next(err)
    }
  })

  return router
}

/** The last three inputs with a status in the words of spec 05 L1: feedback ready / your teacher is checking / fixed. */
async function recentInputs(db: Db, learnerId: string): Promise<RecentInput[]> {
  const rows = await db
    .select({
      id: inputs.id,
      kind: inputs.kind,
      createdAt: inputs.createdAt,
      attemptId: inputs.attemptId,
      assessmentStatus: assessments.status,
    })
    .from(inputs)
    .leftJoin(attempts, eq(attempts.id, inputs.attemptId))
    .leftJoin(assessments, eq(assessments.attemptId, attempts.id))
    .where(eq(inputs.learnerId, learnerId))
    .orderBy(desc(inputs.createdAt), desc(inputs.id))
    .limit(3)

  const attemptIds = rows.map((row) => row.attemptId).filter((id): id is string => id !== null)
  const fixed = new Set<string>()
  if (attemptIds.length > 0) {
    // A fix lands on the retry attempt (parent → child) or is tagged with the original; count both.
    const children = await db
      .select({ id: attempts.id, parentAttemptId: attempts.parentAttemptId })
      .from(attempts)
      .where(inArray(attempts.parentAttemptId, attemptIds))
    const childToParent = new Map(children.map((child) => [child.id, child.parentAttemptId]))
    const candidates = [...attemptIds, ...children.map((child) => child.id)]
    const fixes = await db
      .select({ attemptId: learningEvents.attemptId })
      .from(learningEvents)
      .where(and(eq(learningEvents.learnerId, learnerId), eq(learningEvents.kind, 'fixed_independently'), inArray(learningEvents.attemptId, candidates)))
    for (const fix of fixes) {
      if (!fix.attemptId) continue
      fixed.add(childToParent.get(fix.attemptId) ?? fix.attemptId)
    }
  }

  const noticeInputIds = rows.filter((row) => row.kind === 'notice').map((row) => row.id)
  const readNotices = new Set<string>()
  if (noticeInputIds.length > 0) {
    const extracted = await db.select({ sourceInputId: calendarEvents.sourceInputId }).from(calendarEvents).where(inArray(calendarEvents.sourceInputId, noticeInputIds))
    for (const row of extracted) readNotices.add(row.sourceInputId)
  }

  return rows.map((row) => {
    let status: RecentInputStatus
    if (row.kind === 'question') status = 'asked'
    else if (row.kind === 'notice') status = readNotices.has(row.id) ? 'read' : 'reading'
    else if (row.attemptId && fixed.has(row.attemptId)) status = 'fixed'
    else if (row.assessmentStatus === 'proposed') status = 'feedback_ready'
    else if (row.assessmentStatus === 'uncertain') status = 'teacher_checking'
    else if (row.assessmentStatus === 'failed') status = 'failed'
    else status = 'reading'
    return { id: row.id, kind: row.kind, status, attemptId: row.attemptId, createdAt: row.createdAt.toISOString() }
  })
}
