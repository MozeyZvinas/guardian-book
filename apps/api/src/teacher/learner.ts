import { and, desc, eq } from 'drizzle-orm'
import type { TeacherLearnerResponse, TeacherSkillSummary } from '@guardian-book/shared'
import { can } from '../access/index.js'
import { attemptStatusOf } from '../assessment/service.js'
import type { Actor } from '../auth/session.js'
import type { Db } from '../db/client.js'
import { assessments, attempts, classMembers, classes, items, profiles, reviews } from '../db/schema.js'
import { listInterventionsForLearner } from '../interventions/service.js'
import { notFound } from '../lib/http.js'
import { trustedOutcomes, type AttemptOutcome } from './outcomes.js'

/**
 * T6 · Learner profile (spec 03 §8.2; spec 05 §4.4 T6; brief B07 §5): one learner in the
 * teacher's own classes. Skill counts come from trusted results (B05's projection endpoint
 * is not on main yet: raw counts, as the brief allows); recent attempts with their status;
 * from the profile cards, subjects and the hardest subject only (never the dream, never
 * the raw text); open interventions.
 */

/** Pure: per skill, how many steps were lost and found, and the latest result. */
export function skillSummaries(outcomes: readonly AttemptOutcome[]): TeacherSkillSummary[] {
  const map = new Map<string, TeacherSkillSummary & { latestAt: number }>()
  for (const outcome of outcomes) {
    for (const step of outcome.steps) {
      if (!step.skillTag) continue
      const entry = map.get(step.skillTag) ?? { skillTag: step.skillTag, lost: 0, found: 0, latest: null, lastCheckedAt: null, latestAt: 0 }
      const lost = step.awarded < step.available
      if (lost) entry.lost += 1
      else entry.found += 1
      const at = outcome.occurredAt.getTime()
      if (at > entry.latestAt) {
        entry.latestAt = at
        entry.latest = lost ? 'lost' : 'found'
        entry.lastCheckedAt = outcome.occurredAt.toISOString()
      } else if (at === entry.latestAt && lost) {
        entry.latest = 'lost' // several steps on one skill in one attempt: any lost step counts as lost
      }
      map.set(step.skillTag, entry)
    }
  }
  return [...map.values()]
    .map(({ latestAt: _latestAt, ...summary }) => summary)
    .sort((a, b) => b.lost - a.lost || a.skillTag.localeCompare(b.skillTag))
}

export async function teacherLearnerProfile(db: Db, actor: Actor, learnerId: string): Promise<TeacherLearnerResponse> {
  if (actor.role !== 'teacher' && actor.role !== 'admin') throw notFound()
  if (!(await can(db, actor, 'learner.read', { type: 'learner', id: learnerId }))) throw notFound()
  const [profile] = await db
    .select({ nickname: profiles.nickname, cards: profiles.cards })
    .from(profiles)
    .where(and(eq(profiles.userId, learnerId), eq(profiles.role, 'learner')))
    .limit(1)
  if (!profile) throw notFound()
  const shared = await db
    .select({ id: classes.id, name: classes.name })
    .from(classMembers)
    .innerJoin(classes, eq(classes.id, classMembers.classId))
    .where(and(eq(classMembers.learnerId, learnerId), eq(classes.teacherId, actor.userId)))
    .orderBy(classes.name)

  const outcomes = await trustedOutcomes(db, [learnerId])
  const recent = await db
    .select({ attempt: attempts, item: items, assessment: assessments, review: reviews })
    .from(attempts)
    .innerJoin(items, eq(items.id, attempts.itemId))
    .leftJoin(assessments, eq(assessments.attemptId, attempts.id))
    .leftJoin(reviews, eq(reviews.assessmentId, assessments.id))
    .where(eq(attempts.learnerId, learnerId))
    .orderBy(desc(attempts.createdAt))
    .limit(10)

  const cards = profile.cards as { subjects?: unknown; hardest_subject?: unknown } | null
  const subjects = Array.isArray(cards?.subjects) ? cards.subjects.filter((s): s is string => typeof s === 'string') : []
  const hardestSubject = typeof cards?.hardest_subject === 'string' ? cards.hardest_subject : null

  const interventionsOpen = shared.length > 0 ? await listInterventionsForLearner(db, learnerId, shared.map((c) => c.id)) : []

  return {
    learner: { id: learnerId, nickname: profile.nickname },
    classes: shared,
    cards: cards ? { subjects, hardestSubject } : null,
    skills: skillSummaries(outcomes),
    attempts: recent.map((row) => ({
      id: row.attempt.id,
      itemSlug: row.item.slug,
      itemTopic: row.item.topic,
      status: attemptStatusOf(row.attempt, row.assessment),
      mode: row.attempt.mode,
      proposedTotal: row.assessment?.status === 'proposed' ? row.assessment.total : null,
      maxMarks: row.item.maxMarks,
      review: row.review ? { state: row.review.state, total: row.review.total } : null,
      createdAt: row.attempt.createdAt.toISOString(),
    })),
    interventions: interventionsOpen.filter((i) => i.status !== 'closed'),
  }
}
