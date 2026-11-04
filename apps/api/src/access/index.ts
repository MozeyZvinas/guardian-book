import { and, eq, isNull } from 'drizzle-orm'
import type { Actor } from '../auth/session.js'
import type { DbOrTx } from '../db/client.js'
import { attempts, calendarEvents, classMembers, classes, guardianLinks, inputs, profiles } from '../db/schema.js'

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
  // B05 (spec 03 §4): the Brain, skill evidence, timeline
  | 'progress.read'
  // B04 (spec 03 §8.2, §9.2)
  | 'input.create'
  | 'input.read'
  | 'input.update'
  | 'attempt.create'
  | 'attempt.assess'
  | 'calendar_event.read'
  | 'calendar_event.decide'
  // B06 (spec 03 §8.2, §9.2): the Help Plan, "We did it", fix it
  | 'plan.read'
  | 'plan.done'
  | 'attempt.fix'

export type Resource =
  | { type: 'class'; id: string }
  | { type: 'learner'; id: string }
  | { type: 'guardian_link'; learnerId: string; guardianId: string }
  | { type: 'item'; id: string }
  | { type: 'attempt'; id: string }
  | { type: 'school'; id: string | null }
  | { type: 'input'; id: string }
  | { type: 'calendar_event'; id: string }

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
    case 'input': {
      const [row] = await db
        .select({ schoolId: profiles.schoolId })
        .from(inputs)
        .innerJoin(profiles, eq(profiles.userId, inputs.learnerId))
        .where(eq(inputs.id, resource.id))
        .limit(1)
      return row?.schoolId === subject.schoolId
    }
    case 'calendar_event': {
      const [row] = await db
        .select({ scopeType: calendarEvents.scopeType, scopeId: calendarEvents.scopeId })
        .from(calendarEvents)
        .where(eq(calendarEvents.id, resource.id))
        .limit(1)
      if (!row) return false
      return sameSchool(db, subject, row.scopeType === 'class' ? { type: 'class', id: row.scopeId } : { type: 'learner', id: row.scopeId })
    }
    case 'guardian_link':
    case 'item':
      return true // not school-scoped
    default:
      return false
  }
}

async function inputRow(db: DbOrTx, inputId: string): Promise<{ learnerId: string; kind: 'work' | 'notice' | 'question' } | null> {
  const [row] = await db.select({ learnerId: inputs.learnerId, kind: inputs.kind }).from(inputs).where(eq(inputs.id, inputId)).limit(1)
  return row ?? null
}

async function calendarEventRow(db: DbOrTx, eventId: string): Promise<{ scopeType: 'class' | 'learner'; scopeId: string; status: string } | null> {
  const [row] = await db
    .select({ scopeType: calendarEvents.scopeType, scopeId: calendarEvents.scopeId, status: calendarEvents.status })
    .from(calendarEvents)
    .where(eq(calendarEvents.id, eventId))
    .limit(1)
  return row ?? null
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

    case 'progress.read':
      // Spec 03 §4: progress (the Brain, skill evidence, timeline) is the learner's own or
      // their class teacher's. Guardians get the Help Plan's guardian view only (§8.2).
      if (resource.type !== 'learner') return false
      if (learnerOwns(subject, resource.id)) return true
      if (subject.role === 'teacher') return teacherOfLearner(db, subject, resource.id)
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

    // ── B04: inputs, attempts, calendar ────────────────────────────────────────────────────

    case 'input.create':
      // A learner brings their own; a teacher brings a class notice for a class they own.
      if (resource.type === 'learner') return learnerOwns(subject, resource.id)
      if (resource.type === 'class') return teacherOwnsClass(db, subject, resource.id)
      return false

    case 'input.read': {
      // Owner always; a class teacher reads a learner's *work* only (spec 03 §8.2). Guardians never.
      if (resource.type !== 'input') return false
      const row = await inputRow(db, resource.id)
      if (!row) return false
      if (row.learnerId === subject.userId) return true
      if (subject.role === 'teacher' && row.kind === 'work') {
        return (await teacherOfLearner(db, subject, row.learnerId)) && sameSchool(db, subject, resource)
      }
      return false
    }

    case 'input.update': {
      if (resource.type !== 'input') return false
      const row = await inputRow(db, resource.id)
      return Boolean(row) && row?.learnerId === subject.userId
    }

    case 'attempt.create':
      return resource.type === 'learner' && learnerOwns(subject, resource.id)

    case 'attempt.assess': {
      if (resource.type !== 'attempt') return false
      const [row] = await db.select({ learnerId: attempts.learnerId }).from(attempts).where(eq(attempts.id, resource.id)).limit(1)
      return Boolean(row) && learnerOwns(subject, row?.learnerId ?? '')
    }

    case 'calendar_event.read': {
      if (resource.type !== 'calendar_event') return false
      const row = await calendarEventRow(db, resource.id)
      if (!row) return false
      if (row.scopeType === 'learner') {
        if (learnerOwns(subject, row.scopeId)) return true
        if (subject.role === 'guardian') return row.status === 'confirmed' && guardianLinkedTo(db, subject.userId, row.scopeId)
        if (subject.role === 'teacher') return row.status === 'confirmed' && teacherOfLearner(db, subject, row.scopeId)
        return false
      }
      if (subject.role === 'teacher') return teacherOwnsClass(db, subject, row.scopeId)
      if (subject.role === 'learner') {
        return row.status === 'confirmed' && (await classMember(db, subject.userId, row.scopeId)) && sameSchool(db, subject, resource)
      }
      if (subject.role === 'guardian') {
        if (row.status !== 'confirmed') return false
        const linked = await db
          .select({ learnerId: guardianLinks.learnerId })
          .from(guardianLinks)
          .innerJoin(classMembers, eq(classMembers.learnerId, guardianLinks.learnerId))
          .where(and(eq(guardianLinks.guardianId, subject.userId), isNull(guardianLinks.revokedAt), eq(classMembers.classId, row.scopeId)))
          .limit(1)
        return linked.length > 0
      }
      return false
    }

    case 'calendar_event.decide': {
      // The person who must confirm it: the learner for their own events, the class teacher for class events.
      if (resource.type !== 'calendar_event') return false
      const row = await calendarEventRow(db, resource.id)
      if (!row) return false
      if (row.scopeType === 'learner') return learnerOwns(subject, row.scopeId)
      return teacherOwnsClass(db, subject, row.scopeId)
    }

    // ── B06: the Help Plan, "We did it", fix it ─────────────────────────────────────────────

    case 'plan.read':
      // Own learner view; a linked guardian's guardian view; the class teacher's teacher view (spec 03 §8.2).
      if (resource.type !== 'learner') return false
      if (learnerOwns(subject, resource.id)) return true
      if (subject.role === 'guardian') return guardianLinkedTo(db, subject.userId, resource.id)
      if (subject.role === 'teacher') return teacherOfLearner(db, subject, resource.id)
      return false

    case 'plan.done':
      return resource.type === 'learner' && subject.role === 'guardian' && guardianLinkedTo(db, subject.userId, resource.id)

    case 'attempt.fix': {
      // Only the owner redoes a step (spec 03 §8.3 `POST /api/attempts/:id/fix`: owner).
      if (resource.type !== 'attempt') return false
      const [row] = await db.select({ learnerId: attempts.learnerId }).from(attempts).where(eq(attempts.id, resource.id)).limit(1)
      return Boolean(row) && learnerOwns(subject, row?.learnerId ?? '')
    }

    default:
      return false
  }
}
