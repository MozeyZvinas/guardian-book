import { hashPassword } from 'better-auth/crypto'
import { fromNodeHeaders } from 'better-auth/node'
import { eq } from 'drizzle-orm'
import { Router } from 'express'
import express from 'express'
import { signUpBodySchema, uuidv7, type SignUpResponse } from '@guardian-book/shared'
import { recordAudit } from '../audit/record.js'
import type { Db } from '../db/client.js'
import { account, classMembers, classes, profiles, user } from '../db/schema.js'
import { hashCode } from '../lib/codes.js'
import { HttpError, parse, requestIdOf } from '../lib/http.js'
import type { Logger } from '../logger.js'
import type { Auth } from './auth.js'

export const SIGN_UP_PATH = '/api/auth/sign-up/email'

/** Drizzle wraps driver errors ("Failed query") with the pg error as `cause`. */
function isUniqueViolation(err: unknown): boolean {
  let current: unknown = err
  for (let depth = 0; depth < 4 && typeof current === 'object' && current !== null; depth += 1) {
    if ((current as { code?: unknown }).code === '23505') return true
    current = (current as { cause?: unknown }).cause
  }
  return false
}

/**
 * `POST /api/auth/sign-up/email` (spec 03 §5; spec 02 P0-01; D19).
 *
 * The body must carry `ageAttested: true` and a self-assignable role; anything else is a
 * 400 and nothing is written. The user, the credential account (Better Auth's own password
 * hash) and the `profiles` row with `age_attested_at` commit in ONE transaction, with an
 * audit row. Better Auth then signs the new user in, so the cookie it sets is its own.
 *
 * B09: `tryClass: true` from `/try` asks to join the public try-it class. The class comes
 * from `PUBLIC_TRY_CLASS_CODE` on the server (the client names nothing), learners only,
 * in the same transaction; unconfigured or unknown → the sign-up still succeeds, joins
 * nothing, and the response says `joinedClass: null`.
 */
export function signUpRouter(deps: { db: Db; auth: Auth; logger: Logger; tryClassCode?: string | null }): Router {
  const { db, auth, logger } = deps
  const router = Router()

  router.post(SIGN_UP_PATH, express.json({ limit: '16kb' }), async (req, res, next) => {
    try {
      const requestId = requestIdOf(req) ?? null
      const body = parse(signUpBodySchema, req.body)
      const passwordHash = await hashPassword(body.password)
      const userId = uuidv7()
      const now = new Date()

      const tryClass =
        body.tryClass === true && body.role === 'learner' && deps.tryClassCode
          ? ((await db
              .select({ id: classes.id, name: classes.name, schoolId: classes.schoolId })
              .from(classes)
              .where(eq(classes.codeHash, hashCode(deps.tryClassCode)))
              .limit(1))[0] ?? null)
          : null
      if (body.tryClass === true && !tryClass) {
        logger.warn('sign-up: try-it requested but no try-it class is reachable', { requestId, role: body.role })
      }

      try {
        await db.transaction(async (tx) => {
          await tx.insert(user).values({ id: userId, name: body.nickname, email: body.email })
          await tx.insert(account).values({
            id: uuidv7(),
            accountId: userId,
            providerId: 'credential',
            userId,
            password: passwordHash,
          })
          await tx.insert(profiles).values({
            userId,
            role: body.role,
            nickname: body.nickname,
            ageAttestedAt: now,
            // A learner joining a first class takes the class's school (access `class.join`).
            schoolId: tryClass ? tryClass.schoolId : null,
          })
          await recordAudit(tx, {
            actorId: userId,
            action: 'auth.sign_up',
            subjectType: 'user',
            subjectId: userId,
            outcome: 'ok',
            requestId,
          })
          if (tryClass) {
            await tx.insert(classMembers).values({ classId: tryClass.id, learnerId: userId })
            await recordAudit(tx, {
              actorId: userId,
              action: 'circle.class_joined',
              subjectType: 'class',
              subjectId: tryClass.id,
              outcome: 'ok',
              requestId,
            })
          }
        })
      } catch (err) {
        if (isUniqueViolation(err)) {
          throw new HttpError(409, 'email_in_use', 'That email is already registered. Sign in instead.')
        }
        throw err
      }

      const signedIn = await auth.api.signInEmail({
        body: { email: body.email, password: body.password },
        headers: fromNodeHeaders(req.headers),
        returnHeaders: true,
      })
      for (const cookie of signedIn.headers.getSetCookie()) res.append('Set-Cookie', cookie)

      const [profile] = await db.select().from(profiles).where(eq(profiles.userId, userId)).limit(1)
      if (!profile) throw new Error('sign-up: profile missing after commit')
      const payload: SignUpResponse = {
        user: { id: userId },
        profile: {
          userId,
          role: profile.role,
          nickname: profile.nickname,
          schoolId: profile.schoolId,
          ageAttestedAt: profile.ageAttestedAt.toISOString(),
        },
        joinedClass: tryClass ? { id: tryClass.id, name: tryClass.name } : null,
      }
      logger.info('sign-up', { requestId, userId, role: body.role, tryClass: Boolean(tryClass) })
      res.status(201).json(payload)
    } catch (err) {
      next(err)
    }
  })

  return router
}
