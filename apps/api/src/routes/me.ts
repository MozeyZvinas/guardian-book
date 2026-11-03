import { and, count, eq, isNull } from 'drizzle-orm'
import { Router } from 'express'
import { GUARDIAN_CODE_TTL_DAYS, type MeResponse } from '@guardian-book/shared'
import { can } from '../access/index.js'
import { recordAudit } from '../audit/record.js'
import { requireActor, requireRole } from '../auth/session.js'
import type { Db } from '../db/client.js'
import { classMembers, classes, guardianInviteCodes, guardianLinks, profiles, schools } from '../db/schema.js'
import { generateCode, hashCode } from '../lib/codes.js'
import { notFound, requestIdOf, uuidParam } from '../lib/http.js'

/** `/api/me` (spec 03 §5, §8.3): the profile and the circle as this role sees it. */
export function meRouter(db: Db): Router {
  const router = Router()

  router.get('/api/me', async (_req, res, next) => {
    try {
      const actor = requireActor(res)
      const [profile] = await db.select().from(profiles).where(eq(profiles.userId, actor.userId)).limit(1)
      if (!profile) throw notFound()

      const school = profile.schoolId
        ? ((await db.select({ id: schools.id, name: schools.name }).from(schools).where(eq(schools.id, profile.schoolId)).limit(1))[0] ?? null)
        : null

      const body: MeResponse = {
        user: { id: actor.userId, email: actor.email },
        profile: {
          userId: profile.userId,
          role: profile.role,
          nickname: profile.nickname,
          schoolId: profile.schoolId,
          ageAttestedAt: profile.ageAttestedAt.toISOString(),
        },
        school,
        memberships: [],
        guardians: [],
        classes: [],
        learners: [],
      }

      if (profile.role === 'learner') {
        body.memberships = await db
          .select({ classId: classes.id, name: classes.name })
          .from(classMembers)
          .innerJoin(classes, eq(classes.id, classMembers.classId))
          .where(eq(classMembers.learnerId, actor.userId))
        const links = await db
          .select({ guardianId: guardianLinks.guardianId, nickname: profiles.nickname, linkedAt: guardianLinks.linkedAt })
          .from(guardianLinks)
          .innerJoin(profiles, eq(profiles.userId, guardianLinks.guardianId))
          .where(and(eq(guardianLinks.learnerId, actor.userId), isNull(guardianLinks.revokedAt)))
        body.guardians = links.map((link) => ({ ...link, linkedAt: link.linkedAt.toISOString() }))
      }

      if (profile.role === 'teacher') {
        body.classes = await db
          .select({
            id: classes.id,
            name: classes.name,
            schoolId: classes.schoolId,
            learnerCount: count(classMembers.learnerId),
          })
          .from(classes)
          .leftJoin(classMembers, eq(classMembers.classId, classes.id))
          .where(eq(classes.teacherId, actor.userId))
          .groupBy(classes.id)
          .orderBy(classes.name)
      }

      if (profile.role === 'guardian') {
        body.learners = await db
          .select({ learnerId: guardianLinks.learnerId, nickname: profiles.nickname })
          .from(guardianLinks)
          .innerJoin(profiles, eq(profiles.userId, guardianLinks.learnerId))
          .where(and(eq(guardianLinks.guardianId, actor.userId), isNull(guardianLinks.revokedAt)))
      }

      res.setHeader('Cache-Control', 'no-store')
      res.json(body)
    } catch (err) {
      next(err)
    }
  })

  /** Issues (and rotates) the learner's guardian code; only its hash is stored. */
  router.post('/api/me/guardian-code', requireRole('learner'), async (req, res, next) => {
    try {
      const actor = requireActor(res)
      if (!(await can(db, actor, 'guardian_code.issue', { type: 'learner', id: actor.userId }))) throw notFound()
      const code = generateCode()
      const expiresAt = new Date(Date.now() + GUARDIAN_CODE_TTL_DAYS * 24 * 60 * 60 * 1000)
      await db.transaction(async (tx) => {
        await tx
          .insert(guardianInviteCodes)
          .values({ learnerId: actor.userId, codeHash: hashCode(code), expiresAt })
          .onConflictDoUpdate({
            target: guardianInviteCodes.learnerId,
            set: { codeHash: hashCode(code), expiresAt, createdAt: new Date() },
          })
        await recordAudit(tx, {
          actorId: actor.userId,
          action: 'circle.guardian_code_issued',
          subjectType: 'learner',
          subjectId: actor.userId,
          outcome: 'ok',
          requestId: requestIdOf(req),
        })
      })
      res.setHeader('Cache-Control', 'no-store')
      res.status(201).json({ code, expiresAt: expiresAt.toISOString() })
    } catch (err) {
      next(err)
    }
  })

  /** The learner revokes a guardian's link. An unknown or foreign guardian ID is a 404. */
  router.delete('/api/me/guardians/:id', requireRole('learner'), async (req, res, next) => {
    try {
      const actor = requireActor(res)
      const guardianId = uuidParam(req, 'id')
      const resource = { type: 'guardian_link', learnerId: actor.userId, guardianId } as const
      if (!(await can(db, actor, 'guardian_link.revoke', resource))) throw notFound()
      const revoked = await db.transaction(async (tx) => {
        const rows = await tx
          .update(guardianLinks)
          .set({ revokedAt: new Date() })
          .where(
            and(
              eq(guardianLinks.learnerId, actor.userId),
              eq(guardianLinks.guardianId, guardianId),
              isNull(guardianLinks.revokedAt),
            ),
          )
          .returning({ guardianId: guardianLinks.guardianId })
        if (rows.length === 0) return false
        await recordAudit(tx, {
          actorId: actor.userId,
          action: 'circle.guardian_revoked',
          subjectType: 'guardian_link',
          subjectId: `${actor.userId}:${guardianId}`,
          outcome: 'ok',
          requestId: requestIdOf(req),
        })
        return true
      })
      if (!revoked) throw notFound()
      res.status(204).end()
    } catch (err) {
      next(err)
    }
  })

  return router
}
