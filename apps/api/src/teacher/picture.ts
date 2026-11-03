import { and, count, eq, inArray, isNull, sql } from 'drizzle-orm'
import type { NeedsYouView, PictureResponse } from '@guardian-book/shared'
import { can } from '../access/index.js'
import type { Actor } from '../auth/session.js'
import type { Db } from '../db/client.js'
import { assessments, attempts, classMembers, classes, interventions, notes, profiles, reviews } from '../db/schema.js'
import { notFound } from '../lib/http.js'
import { repeatedSkills, sharedGaps, trustedOutcomes } from './outcomes.js'

/**
 * T2 · Class picture (spec 03 §8.3 `GET /api/teacher/classes/:id/picture`; spec 05 §4.4 T2,
 * §9; brief B07 §2): shared gaps from trusted evidence, who needs the teacher, and the
 * counts behind the queue, draft notes and open interventions. Never a ranking of
 * teachers, never a leaderboard of learners (the covenant; spec 05 §8).
 */
export async function classPicture(db: Db, actor: Actor, classId: string): Promise<PictureResponse> {
  if (!(await can(db, actor, 'class.read', { type: 'class', id: classId }))) throw notFound()
  const [cls] = await db.select({ id: classes.id, name: classes.name }).from(classes).where(eq(classes.id, classId)).limit(1)
  if (!cls) throw notFound()
  const members = await db
    .select({ id: classMembers.learnerId, nickname: profiles.nickname })
    .from(classMembers)
    .innerJoin(profiles, eq(profiles.userId, classMembers.learnerId))
    .where(eq(classMembers.classId, classId))
    .orderBy(profiles.nickname)
  const memberIds = members.map((m) => m.id)
  const base = { class: { ...cls, learnerCount: members.length }, members }
  if (memberIds.length === 0) return { ...base, gaps: [], needsYou: [], counts: { queue: 0, draftNotes: 0, openInterventions: 0 } }

  const outcomes = await trustedOutcomes(db, memberIds)
  const gaps = sharedGaps(outcomes, memberIds)

  // Unreviewed results per learner, uncertain ones counted separately.
  const pending = await db
    .select({
      learnerId: attempts.learnerId,
      uncertain: sql<number>`count(*) filter (where ${assessments.status} = 'uncertain')`.mapWith(Number),
      total: count(),
    })
    .from(attempts)
    .innerJoin(assessments, eq(assessments.attemptId, attempts.id))
    .leftJoin(reviews, eq(reviews.assessmentId, assessments.id))
    .where(and(inArray(attempts.learnerId, memberIds), isNull(reviews.id), inArray(assessments.status, ['uncertain', 'proposed'])))
    .groupBy(attempts.learnerId)
  const queue = pending.reduce((acc, row) => acc + row.total, 0)

  const needsYou: NeedsYouView[] = []
  for (const member of members) {
    const uncertain = pending.find((row) => row.learnerId === member.id)?.uncertain ?? 0
    const repeated = repeatedSkills(outcomes.filter((o) => o.learnerId === member.id))
    if (uncertain > 0 || repeated.length > 0) needsYou.push({ learner: member, uncertain, repeatedSkills: repeated })
  }
  needsYou.sort((a, b) => b.uncertain - a.uncertain || b.repeatedSkills.length - a.repeatedSkills.length || a.learner.nickname.localeCompare(b.learner.nickname))

  const [drafts] = await db
    .select({ n: count() })
    .from(notes)
    .where(and(eq(notes.teacherId, actor.userId), inArray(notes.learnerId, memberIds), eq(notes.status, 'draft')))
  const [open] = await db
    .select({ n: count() })
    .from(interventions)
    .where(and(eq(interventions.classId, classId), inArray(interventions.status, ['open', 'checking'])))

  return { ...base, gaps, needsYou, counts: { queue, draftNotes: drafts?.n ?? 0, openInterventions: open?.n ?? 0 } }
}
