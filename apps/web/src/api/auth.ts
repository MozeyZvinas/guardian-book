import { z } from 'zod'
import { meResponseSchema, signUpResponseSchema, type Role, type SignInBody, type SignUpBody } from '@guardian-book/shared'
import { api } from './client'

export const signUp = (body: SignUpBody) => api('/api/auth/sign-up/email', signUpResponseSchema, { method: 'POST', body })

const signInResponseSchema = z.object({ user: z.object({ id: z.string() }) }).passthrough()
export const signIn = (body: SignInBody) => api('/api/auth/sign-in/email', signInResponseSchema, { method: 'POST', body })

const signOutResponseSchema = z.object({ success: z.boolean() }).passthrough()
export const signOut = () => api('/api/auth/sign-out', signOutResponseSchema, { method: 'POST', body: {} })

export const me = () => api('/api/me', meResponseSchema)

/** Where each role lands after sign-in (spec 05 §4; Today and the guardian week arrive with B05 and B06). */
export function homeFor(role: Role): string {
  switch (role) {
    case 'learner':
      return '/me'
    case 'guardian':
      return '/guardian/link'
    case 'teacher':
      return '/teacher'
    default:
      return '/'
  }
}
