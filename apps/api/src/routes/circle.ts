import { and, count, eq, gt } from 'drizzle-orm'
import { Router } from 'express'
import {
  createClassBodySchema,
  joinClassBodySchema,
  linkGuardianBodySchema,
  type CreateClassResponse,
  type JoinClassResponse,
  type LinkGuardianResponse,
} from '@guardian-book/shared'
import { can } from '../access/index.js'
import { recordAudit } from '../audit/record.js'
import { requireActor, requireRole } from '../auth/session.js'
import type { Db } from '../db/client.js'
import { classMembers, classes, guardianInviteCodes, guardianLinks, profiles, schools } from '../db/schema.js'
import { generateCode, hashCode } from '../lib/codes.js'
import { HttpError, notFound, parse, requestIdOf, uuidParam } from '../lib/http.js'

/**
 * The circle (spec 03 §8.1, §8.3; spec 02 P0-01): a teacher's class and its code, a
 * learner joining, a guardian redeeming the learner's code. Every object check goes
 * through `access.can`; a denial is a 404.
 */
export function circleRouter(db: Db): Router {
  const router = Router()

  // ── teacher ─────────────────────────────────────────────────────────────────────────────

  router.post('/api/teacher/classes', requireRole('teacher'), async (req, res, next) => {
    try {
      const actor = requireActor(res)
      const body = parse(createClassBodySchema, req.body)
      // A first class needs a school; after that the teacher's school applies, and asking
      // for another school is a 404 (the boundary, spec 03 §9.2).
      const schoolId = body.schoolId ?? actor.schoolId
      if (!schoolId) {
        throw new HttpError(400, 'school_required', 'Choose a school for your first class.')
      }
      if (!(await can(db, actor, 'class.create', { type: 'school', id: schoolId }))) throw notFound()
      const [school] = await db.select({ id: schools.id }).from(schools).where(eq(schools.id, schoolId)).limit(1)
      if (!school) throw notFound()

      const code = generateCode()
      const created = await db.transaction(async (tx) => {
        const [row] = await tx
          .insert(classes)
          .values({ name: body.name, teacherId: actor.userId, schoolId, codeHash: hashCode(code) })
          .returning({ id: classes.id, name: classes.name, schoolId: classes.schoolId })
        if (!row) throw new Error('class insert returned no row')
        if (!actor.schoolId) {
          await tx.update(profiles).set({ schoolId }).where(eq(profiles.userId, actor.userId))
        }
        await recordAudit(tx, {
          actorId: actor.userId,
          action: 'circle.class_created',
          subjectType: 'class',
          subjectId: row.id,
          outcome: 'ok',
          requestId: requestIdOf(req),
        })
        return row
      })
      const payload: CreateClassResponse = { class: { ...created, learnerCount: 0 }, code }
      res.setHeader('Cache-Control', 'no-store')
      res.status(201).json(payload)
    } catch (err) {
      next(err)
    }
  })

  router.get('/api/teacher/classes/:id', requireRole('teacher'), async (req, res, next) => {
    try {
      const actor = requireActor(res)
      const classId = uuidParam(req, 'id')
      if (!(await can(db, actor, 'class.read', { type: 'class', id: classId }))) throw notFound()
      const [cls] = await db
        .select({ id: classes.id, name: classes.name, schoolId: classes.schoolId })
        .from(classes)
        .where(eq(classes.id, classId))
        .limit(1)
      if (!cls) throw notFound()
      const members = await db
        .select({ learnerId: classMembers.learnerId, nickname: profiles.nickname, joinedAt: classMembers.joinedAt })
        .from(classMembers)
        .innerJoin(profiles, eq(profiles.userId, classMembers.learnerId))
        .where(eq(classMembers.classId, classId))
        .orderBy(profiles.nickname)
      res.setHeader('Cache-Control', 'no-store')
      res.json({
        class: { ...cls, learnerCount: members.length },
        members: members.map((m) => ({ ...m, joinedAt: m.joinedAt.toISOString() })),
      })
    } catch (err) {
      next(err)
    }
  })

  // ── learner ─────────────────────────────────────────────────────────────────────────────

  router.post('/api/learner/join', requireRole('learner'), async (req, res, next) => {
    try {
      const actor = requireActor(res)
      const body = parse(joinClassBodySchema, req.body)
      const [cls] = await db
        .select({ id: classes.id, name: classes.name, schoolId: classes.schoolId })
        .from(classes)
        .where(eq(classes.codeHash, hashCode(body.code)))
        .limit(1)
      // A wrong code and a class in another school look the same: 404.
      if (!cls || !(await can(db, actor, 'class.join', { type: 'class', id: cls.id }))) {
        await recordAudit(db, {
          actorId: actor.userId,
          action: 'circle.class_joined',
          subjectType: 'class',
          subjectId: null,
          outcome: 'refused',
          requestId: requestIdOf(req),
        })
        throw notFound()
      }
      const alreadyMember = await db.transaction(async (tx) => {
        const inserted = await tx
          .insert(classMembers)
          .values({ classId: cls.id, learnerId: actor.userId })
          .onConflictDoNothing()
          .returning({ classId: classMembers.classId })
        if (!actor.schoolId) {
          await tx.update(profiles).set({ schoolId: cls.schoolId }).where(eq(profiles.userId, actor.userId))
        }
        await recordAudit(tx, {
          actorId: actor.userId,
          action: 'circle.class_joined',
          subjectType: 'class',
          subjectId: cls.id,
          outcome: 'ok',
          requestId: requestIdOf(req),
        })
        return inserted.length === 0
      })
      const payload: JoinClassResponse = { class: { id: cls.id, name: cls.name }, alreadyMember }
      res.setHeader('Cache-Control', 'no-store')
      res.json(payload)
    } catch (err) {
      next(err)
    }
  })

  // ── guardian ────────────────────────────────────────────────────────────────────────────

  router.post('/api/guardian/link', requireRole('guardian'), async (req, res, next) => {
    try {
      const actor = requireActor(res)
      const body = parse(linkGuardianBodySchema, req.body)
      const codeHash = hashCode(body.code)
      const [invite] = await db
        .select({ learnerId: guardianInviteCodes.learnerId, nickname: profiles.nickname })
        .from(guardianInviteCodes)
        .innerJoin(profiles, eq(profiles.userId, guardianInviteCodes.learnerId))
        .where(and(eq(guardianInviteCodes.codeHash, codeHash), gt(guardianInviteCodes.expiresAt, new Date())))
        .limit(1)
      if (!invite) {
        await recordAudit(db, {
          actorId: actor.userId,
          action: 'circle.guardian_linked',
          subjectType: 'learner',
          subjectId: null,
          outcome: 'refused',
          requestId: requestIdOf(req),
        })
        throw notFound()
      }
      const alreadyLinked = await db.transaction(async (tx) => {
        const [existing] = await tx
          .select({ revokedAt: guardianLinks.revokedAt })
          .from(guardianLinks)
          .where(and(eq(guardianLinks.learnerId, invite.learnerId), eq(guardianLinks.guardianId, actor.userId)))
          .limit(1)
        const active = Boolean(existing) && existing?.revokedAt === null
        if (!active) {
          await tx
            .insert(guardianLinks)
            .values({ learnerId: invite.learnerId, guardianId: actor.userId, inviteCodeHash: codeHash })
            .onConflictDoUpdate({
              target: [guardianLinks.learnerId, guardianLinks.guardianId],
              set: { inviteCodeHash: codeHash, linkedAt: new Date(), revokedAt: null },
            })
        }
        await recordAudit(tx, {
          actorId: actor.userId,
          action: 'circle.guardian_linked',
          subjectType: 'learner',
          subjectId: invite.learnerId,
          outcome: 'ok',
          requestId: requestIdOf(req),
        })
        return active
      })
      const payload: LinkGuardianResponse = {
        learner: { id: invite.learnerId, nickname: invite.nickname },
        alreadyLinked,
      }
      res.setHeader('Cache-Control', 'no-store')
      res.json(payload)
    } catch (err) {
      next(err)
    }
  })

  // ── schools (read-only; the fictional tenants a first class may be created in) ──────────

  router.get('/api/schools', async (_req, res, next) => {
    try {
      requireActor(res)
      const rows = await db
        .select({ id: schools.id, name: schools.name, kind: schools.kind, classCount: count(classes.id) })
        .from(schools)
        .leftJoin(classes, eq(classes.schoolId, schools.id))
        .groupBy(schools.id)
        .orderBy(schools.name)
      res.json({ schools: rows.map(({ id, name, kind }) => ({ id, name, kind })) })
    } catch (err) {
      next(err)
    }
  })

  return router
}
