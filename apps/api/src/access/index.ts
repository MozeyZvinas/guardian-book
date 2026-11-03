import { and, eq, isNull } from 'drizzle-orm'
import type { Actor } from '../auth/session.js'
import type { DbOrTx } from '../db/client.js'
import { attempts, calendarEvents, classMembers, classes, guardianLinks, inputs, interventions, notes, profiles } from '../db/schema.js'

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
  // B04 (spec 03 §8.2, §9.2)
  | 'input.create'
  | 'input.read'
  | 'input.update'
  | 'attempt.create'
  | 'attempt.assess'
  | 'calendar_event.read'
  | 'calendar_event.decide'
  // B07 (spec 03 §4, §8.2, §9.2): the teacher space
  | 'guideline.read'
  | 'guideline.approve'
  | 'review.write'
  | 'review.read'
  | 'intervention.create'
  | 'intervention.read'
  | 'intervention.update'
  | 'note.create'
  | 'note.read'
  | 'note.update'

export type Resource =
  | { type: 'class'; id: string }
  | { type: 'learner'; id: string }
  | { type: 'guardian_link'; learnerId: string; guardianId: string }
  | { type: 'item'; id: string }
  | { type: 'attempt'; id: string }
  | { type: 'school'; id: string | null }
  | { type: 'input'; id: string }
  | { type: 'calendar_event'; id: string }
  | { type: 'intervention'; id: string }
  | { type: 'note'; id: string }

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
    case 'intervention': {
      const [row] = await db.select({ classId: interventions.classId }).from(interventions).where(eq(interventions.id, resource.id)).limit(1)
      return row ? sameSchool(db, subject, { type: 'class', id: row.classId }) : false
    }
    case 'note': {
      const [row] = await db.select({ learnerId: notes.learnerId }).from(notes).where(eq(notes.id, resource.id)).limit(1)
      return row ? sameSchool(db, subject, { type: 'learner', id: row.learnerId }) : false
    }
    case 'guardian_link':
    case 'item':
      return true // not school-scoped
    default:
      return false
  }
}

async function interventionRow(db: DbOrTx, id: string): Promise<{ classId: string; learnerId: string } | null> {
  const [row] = await db.select({ classId: interventions.classId, learnerId: interventions.learnerId }).from(interventions).where(eq(interventions.id, id)).limit(1)
  return row ?? null
}

async function noteRow(db: DbOrTx, id: string): Promise<{ teacherId: string; learnerId: string; guardianId: string; status: string } | null> {
  const [row] = await db
    .select({ teacherId: notes.teacherId, learnerId: notes.learnerId, guardianId: notes.guardianId, status: notes.status })
    .from(notes)
    .where(eq(notes.id, id))
    .limit(1)
  return row ?? null
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

    // ── B07: guidelines, reviews, interventions, notes ──────────────────────────────────────

    case 'guideline.read':
    case 'guideline.approve':
      // The class teacher reads the guideline to approve it (spec 03 §9.2), before any attempt exists.
      return resource.type === 'class' && teacherOwnsClass(db, subject, resource.id)

    case 'review.write': {
      // Confirm, release, add feedback: the teacher of a learner in one of their classes, same school.
      if (resource.type !== 'attempt' || subject.role !== 'teacher') return false
      const [row] = await db.select({ learnerId: attempts.learnerId }).from(attempts).where(eq(attempts.id, resource.id)).limit(1)
      if (!row) return false
      return (await teacherOfLearner(db, subject, row.learnerId)) && sameSchool(db, subject, resource)
    }

    case 'review.read': {
      // The owner (the route serves it only once released) or the class teacher. Guardians never.
      if (resource.type !== 'attempt') return false
      const [row] = await db.select({ learnerId: attempts.learnerId }).from(attempts).where(eq(attempts.id, resource.id)).limit(1)
      if (!row) return false
      if (learnerOwns(subject, row.learnerId)) return true
      if (subject.role === 'teacher') return (await teacherOfLearner(db, subject, row.learnerId)) && sameSchool(db, subject, resource)
      return false
    }

    case 'intervention.create':
      return resource.type === 'class' && teacherOwnsClass(db, subject, resource.id)

    case 'intervention.read':
    case 'intervention.update': {
      if (resource.type !== 'intervention') return false
      const row = await interventionRow(db, resource.id)
      if (!row) return false
      if (subject.role === 'teacher') return teacherOwnsClass(db, subject, row.classId)
      // A learner reads their own (action and follow-up date only; the route trims it). Guardians go through the plan (B06).
      if (action === 'intervention.read') return learnerOwns(subject, row.learnerId)
      return false
    }

    case 'note.create':
      return resource.type === 'learner' && subject.role === 'teacher' && teacherOfLearner(db, subject, resource.id)

    case 'note.read': {
      if (resource.type !== 'note') return false
      const row = await noteRow(db, resource.id)
      if (!row) return false
      if (subject.role === 'teacher') return row.teacherId === subject.userId && sameSchool(db, subject, resource)
      // A guardian reads a note only once sent, and only when addressed to them (spec 03 §8.2).
      if (subject.role === 'guardian') return row.guardianId === subject.userId && row.status === 'sent' && guardianLinkedTo(db, subject.userId, row.learnerId)
      return false
    }

    case 'note.update': {
      if (resource.type !== 'note') return false
      const row = await noteRow(db, resource.id)
      if (!row || subject.role !== 'teacher') return false
      return row.teacherId === subject.userId && sameSchool(db, subject, resource)
    }

    default:
      return false
  }
}
