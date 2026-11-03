import { desc, eq, inArray } from 'drizzle-orm'
import type { AttemptStatus, QueueResponse, QueueRow } from '@guardian-book/shared'
import { can } from '../access/index.js'
import { attemptStatusOf } from '../assessment/service.js'
import type { Actor } from '../auth/session.js'
import type { Db } from '../db/client.js'
import { assessments, attempts, classMembers, classes, items, profiles, reviews } from '../db/schema.js'
import { notFound } from '../lib/http.js'

/**
 * T3 · Confirm queue (spec 03 §5 `GET /api/teacher/queue`; spec 05 §4.4 T3): the class's
 * attempts, `uncertain` first, then `proposed`, then the rest; reviewed ones after the
 * unreviewed; newest first within a group.
 */

const STATUS_RANK: Record<AttemptStatus, number> = { uncertain: 0, proposed: 1, failed: 2, assessing: 3, submitted: 4 }

export function queueRank(row: { status: AttemptStatus; review: { state: 'confirmed' | 'released' } | null }): number {
  if (row.review?.state === 'released') return 20
  if (row.review?.state === 'confirmed') return 10
  return STATUS_RANK[row.status]
}

export function sortQueue(rows: QueueRow[]): QueueRow[] {
  return [...rows].sort((a, b) => queueRank(a) - queueRank(b) || (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0))
}

export async function listQueue(db: Db, actor: Actor, classId: string): Promise<QueueResponse> {
  if (!(await can(db, actor, 'class.read', { type: 'class', id: classId }))) throw notFound()
  const [cls] = await db.select({ id: classes.id, name: classes.name }).from(classes).where(eq(classes.id, classId)).limit(1)
  if (!cls) throw notFound()
  const members = await db
    .select({ learnerId: classMembers.learnerId, nickname: profiles.nickname })
    .from(classMembers)
    .innerJoin(profiles, eq(profiles.userId, classMembers.learnerId))
    .where(eq(classMembers.classId, classId))
  if (members.length === 0) return { class: cls, rows: [] }
  const nickname = new Map(members.map((m) => [m.learnerId, m.nickname]))

  const rows = await db
    .select({ attempt: attempts, assessment: assessments, review: reviews, item: items })
    .from(attempts)
    .innerJoin(items, eq(items.id, attempts.itemId))
    .leftJoin(assessments, eq(assessments.attemptId, attempts.id))
    .leftJoin(reviews, eq(reviews.assessmentId, assessments.id))
    .where(inArray(attempts.learnerId, members.map((m) => m.learnerId)))
    .orderBy(desc(attempts.createdAt))
    .limit(200)

  const list: QueueRow[] = rows.map((row) => ({
    attemptId: row.attempt.id,
    learner: { id: row.attempt.learnerId, nickname: nickname.get(row.attempt.learnerId) ?? 'Learner' },
    itemId: row.item.id,
    itemSlug: row.item.slug,
    itemTopic: row.item.topic,
    kind: row.attempt.kind,
    mode: row.attempt.mode,
    status: attemptStatusOf(row.attempt, row.assessment),
    proposedTotal: row.assessment?.status === 'proposed' ? row.assessment.total : null,
    maxMarks: row.item.maxMarks,
    review: row.review ? { id: row.review.id, state: row.review.state, total: row.review.total } : null,
    createdAt: row.attempt.createdAt.toISOString(),
  }))
  return { class: cls, rows: sortQueue(list) }
}
