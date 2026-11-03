import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { MAX_PASSWORD_LENGTH, MIN_PASSWORD_LENGTH, uuidv7 } from '@guardian-book/shared'
import type { Db } from '../db/client.js'
import { account, session, user, verification } from '../db/schema.js'

export const AUTH_BASE_PATH = '/api/auth'
export const SESSION_DAYS = 7

export interface AuthSettings {
  secret: string
  /** The public origin, e.g. https://guardianbook.app. Secure cookies follow its scheme. */
  url: string
}

/**
 * Better Auth (spec 01: email + password only; no other plugins, D21). Sessions live in
 * Postgres through the Drizzle adapter. Cookies are HttpOnly, SameSite=Lax and Secure
 * whenever the public origin is https.
 *
 * Sign-up is NOT Better Auth's: `disableSignUp` turns its endpoint off, and
 * `./signup.ts` owns `POST /api/auth/sign-up/email` so the user, credential account and
 * `profiles` row (with the age attestation, D19) commit in one transaction. Better Auth
 * then issues the session through its own sign-in.
 */
export function createAuth(db: Db, settings: AuthSettings) {
  const secure = settings.url.toLowerCase().startsWith('https://')
  return betterAuth({
    appName: 'Guardian Book',
    baseURL: settings.url,
    basePath: AUTH_BASE_PATH,
    secret: settings.secret,
    trustedOrigins: [settings.url],
    database: drizzleAdapter(db, {
      provider: 'pg',
      schema: { user, session, account, verification },
    }),
    emailAndPassword: {
      enabled: true,
      disableSignUp: true,
      requireEmailVerification: false,
      minPasswordLength: MIN_PASSWORD_LENGTH,
      maxPasswordLength: MAX_PASSWORD_LENGTH,
    },
    session: {
      expiresIn: SESSION_DAYS * 24 * 60 * 60,
      updateAge: 24 * 60 * 60,
    },
    user: {
      changeEmail: { enabled: false },
      deleteUser: { enabled: false },
    },
    advanced: {
      database: { generateId: () => uuidv7() },
      useSecureCookies: secure,
      defaultCookieAttributes: { httpOnly: true, sameSite: 'lax', path: '/' },
    },
  })
}

export type Auth = ReturnType<typeof createAuth>
