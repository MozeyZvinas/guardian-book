import { fromNodeHeaders } from 'better-auth/node'
import { eq } from 'drizzle-orm'
import type { Request, RequestHandler, Response } from 'express'
import type { Role } from '@guardian-book/shared'
import type { Db } from '../db/client.js'
import { profiles } from '../db/schema.js'
import { forbidden, unauthorized } from '../lib/http.js'
import type { Auth } from './auth.js'

/** Who is calling: the session's user plus their profile. Never carries the email onward. */
export interface Actor {
  userId: string
  email: string
  role: Role
  nickname: string
  schoolId: string | null
}

/**
 * The one session lookup (spec 03 §4 step 1), mounted on every `/api` route. Resolves the
 * Better Auth session cookie and the profile into `res.locals.actor`, or `null`. Routes
 * then call `requireActor` / `requireRole` for steps 1 and 2, and `access.can` for step 3.
 */
export function attachSession(auth: Auth, db: Db): RequestHandler {
  return async (req, res, next) => {
    res.locals['actor'] = null
    try {
      const found = await auth.api.getSession({ headers: fromNodeHeaders(req.headers) })
      if (found) {
        const [profile] = await db
          .select({
            role: profiles.role,
            nickname: profiles.nickname,
            schoolId: profiles.schoolId,
          })
          .from(profiles)
          .where(eq(profiles.userId, found.user.id))
          .limit(1)
        if (profile) {
          const actor: Actor = {
            userId: found.user.id,
            email: found.user.email,
            role: profile.role,
            nickname: profile.nickname,
            schoolId: profile.schoolId,
          }
          res.locals['actor'] = actor
        }
      }
      next()
    } catch (err) {
      next(err)
    }
  }
}

export function actorOf(res: Response): Actor | null {
  const actor = res.locals['actor']
  return actor && typeof actor === 'object' ? (actor as Actor) : null
}

/** Step 1: 401 without a session. */
export function requireActor(res: Response): Actor {
  const actor = actorOf(res)
  if (!actor) throw unauthorized()
  return actor
}

/** Steps 1 and 2: 401 without a session, 403 for another role. */
export function requireRole(...roles: Role[]): RequestHandler {
  return (_req: Request, res, next) => {
    const actor = actorOf(res)
    if (!actor) {
      next(unauthorized())
      return
    }
    if (!roles.includes(actor.role)) {
      next(forbidden())
      return
    }
    next()
  }
}
