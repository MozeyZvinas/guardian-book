import { and, eq, isNull } from 'drizzle-orm'
import type { Actor } from '../auth/session.js'
import type { DbOrTx } from '../db/client.js'
import { attempts, classMembers, classes, guardianLinks, profiles } from '../db/schema.js'

/**
 * The `access` module (spec 03 §1, §4, §8.2, §9.2): the ONLY place permission decisions
 * are made. Routes do the session and role checks, then ask `can(...)` about the object.
 * A `false` answer is a 404 to the caller: the ID is never confirmed.
 *
 * Every check includes the school boundary (spec 03 §9.2): a user of school A never sees a
 * resource of school B. Guardians have no school; they reach a learner only through an
 * active link. Unknown actions deny.
 */

export type Action =
  | 'class.create'
  | 'class.read'
  | 'class.join'
  | 'learner.read'
  | 'guardian_code.issue'
  | 'guardian_link.revoke'
  | 'item.read'
  | 'item.guideline.read'
  | 'attempt.read'

export type Resource =
  | { type: 'class'; id: string }
  | { type: 'learner'; id: string }
  | { type: 'guardian_link'; learnerId: string; guardianId: string }
  | { type: 'item'; id: string }
  | { type: 'attempt'; id: string }
  | { type: 'school'; id: string | null }

export interface Subject {
  userId: string
  role: Actor['role']
  schoolId: string | null
}

// ── resolvers (later briefs call these too) ───────────────────────────────────────────────

export function learnerOwns(subject: Subject, learnerId: string): boolean {
  return subject.role === 'learner' && subject.userId === learnerId
}

/** True when the teacher teaches a class, in the teacher's school, that the learner belongs to. */
export async function teacherOfLearner(db: DbOrTx, teacher: Subject, learnerId: string): Promise<boolean> {
  if (teacher.role !== 'teacher' || !teacher.schoolId) return false
  const rows = await db
    .select({ classId: classes.id })
    .from(classMembers)
    .innerJoin(classes, eq(classes.id, classMembers.classId))
    .where(
      and(
        eq(classMembers.learnerId, learnerId),
        eq(classes.teacherId, teacher.userId),
        eq(classes.schoolId, teacher.schoolId),
      ),
    )
    .limit(1)
  return rows.length > 0
}

/** True when an unrevoked link exists from the guardian to the learner. */
export async function guardianLinkedTo(db: DbOrTx, guardianId: string, learnerId: string): Promise<boolean> {
  const rows = await db
    .select({ learnerId: guardianLinks.learnerId })
    .from(guardianLinks)
    .where(
      and(
        eq(guardianLinks.guardianId, guardianId),
        eq(guardianLinks.learnerId, learnerId),
        isNull(guardianLinks.revokedAt),
      ),
    )
    .limit(1)
  return rows.length > 0
}

export async function classMember(db: DbOrTx, learnerId: string, classId: string): Promise<boolean> {
  const rows = await db
    .select({ classId: classMembers.classId })
    .from(classMembers)
    .where(and(eq(classMembers.classId, classId), eq(classMembers.learnerId, learnerId)))
    .limit(1)
  return rows.length > 0
}

/**
 * The school boundary. A class is in a school; a learner or teacher is in their profile's
 * school. A subject with no school matches nothing (except a learner joining a first class,
 * handled by `class.join`).
 */
export async function sameSchool(db: DbOrTx, subject: Subject, resource: Resource): Promise<boolean> {
  if (!subject.schoolId) return false
  switch (resource.type) {
    case 'school':
      return resource.id === subject.schoolId
    case 'class': {
      const [row] = await db.select({ schoolId: classes.schoolId }).from(classes).where(eq(classes.id, resource.id)).limit(1)
      return row?.schoolId === subject.schoolId
    }
    case 'learner': {
      const [row] = await db
        .select({ schoolId: profiles.schoolId })
        .from(profiles)
        .where(and(eq(profiles.userId, resource.id), eq(profiles.role, 'learner')))
        .limit(1)
      return row?.schoolId === subject.schoolId
    }
    case 'attempt': {
      const [row] = await db
        .select({ schoolId: profiles.schoolId })
        .from(attempts)
        .innerJoin(profiles, eq(profiles.userId, attempts.learnerId))
        .where(eq(attempts.id, resource.id))
        .limit(1)
      return row?.schoolId === subject.schoolId
    }
    case 'guardian_link':
    case 'item':
      return true // not school-scoped
    default:
      return false
  }
}

async function teacherOwnsClass(db: DbOrTx, teacher: Subject, classId: string): Promise<boolean> {
  if (teacher.role !== 'teacher' || !teacher.schoolId) return false
  const [row] = await db
    .select({ id: classes.id })
    .from(classes)
    .where(and(eq(classes.id, classId), eq(classes.teacherId, teacher.userId), eq(classes.schoolId, teacher.schoolId)))
    .limit(1)
  return Boolean(row)
}

async function learnerAttemptedItem(db: DbOrTx, learnerId: string, itemId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: attempts.id })
    .from(attempts)
    .where(and(eq(attempts.learnerId, learnerId), eq(attempts.itemId, itemId)))
    .limit(1)
  return Boolean(row)
}

/** A teacher may read an item's guideline once a learner in one of their classes attempted it. */
async function classAttemptedItem(db: DbOrTx, teacher: Subject, itemId: string): Promise<boolean> {
  if (teacher.role !== 'teacher' || !teacher.schoolId) return false
  const [row] = await db
    .select({ id: attempts.id })
    .from(attempts)
    .innerJoin(classMembers, eq(classMembers.learnerId, attempts.learnerId))
    .innerJoin(classes, eq(classes.id, classMembers.classId))
    .where(and(eq(attempts.itemId, itemId), eq(classes.teacherId, teacher.userId), eq(classes.schoolId, teacher.schoolId)))
    .limit(1)
  return Boolean(row)
}

// ── the decision ──────────────────────────────────────────────────────────────────────────

export async function can(db: DbOrTx, subject: Subject, action: Action, resource: Resource): Promise<boolean> {
  // Admin: everything, audited by the route (spec 03 §4 "Audited").
  if (subject.role === 'admin') return true

  switch (action) {
    case 'class.create':
      return subject.role === 'teacher' && resource.type === 'school' && (subject.schoolId === null || resource.id === subject.schoolId)

    case 'class.read':
      if (resource.type !== 'class') return false
      if (subject.role === 'teacher') return teacherOwnsClass(db, subject, resource.id)
      if (subject.role === 'learner') {
        return (await classMember(db, subject.userId, resource.id)) && sameSchool(db, subject, resource)
      }
      return false

    case 'class.join':
      // A learner joins within their school; a learner with no school yet takes the class's.
      if (subject.role !== 'learner' || resource.type !== 'class') return false
      return subject.schoolId === null ? true : sameSchool(db, subject, resource)

    case 'learner.read':
      if (resource.type !== 'learner') return false
      if (learnerOwns(subject, resource.id)) return true
      if (subject.role === 'teacher') return teacherOfLearner(db, subject, resource.id)
      if (subject.role === 'guardian') return guardianLinkedTo(db, subject.userId, resource.id)
      return false

    case 'guardian_code.issue':
      return resource.type === 'learner' && learnerOwns(subject, resource.id)

    case 'guardian_link.revoke':
      return resource.type === 'guardian_link' && learnerOwns(subject, resource.learnerId)

    case 'item.read':
      return resource.type === 'item' // approved items; the route filters on status

    case 'item.guideline.read':
      if (resource.type !== 'item') return false
      if (subject.role === 'learner') return learnerAttemptedItem(db, subject.userId, resource.id)
      if (subject.role === 'teacher') return classAttemptedItem(db, subject, resource.id)
      return false

    case 'attempt.read': {
      if (resource.type !== 'attempt') return false
      const [row] = await db.select({ learnerId: attempts.learnerId }).from(attempts).where(eq(attempts.id, resource.id)).limit(1)
      if (!row) return false
      if (learnerOwns(subject, row.learnerId)) return true
      if (subject.role === 'teacher') {
        return (await teacherOfLearner(db, subject, row.learnerId)) && sameSchool(db, subject, resource)
      }
      return false // guardians never read attempts (spec 03 §8.2)
    }

    default:
      return false
  }
}
