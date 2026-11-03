import { z } from 'zod'
import {
  createClassResponseSchema,
  guardianCodeResponseSchema,
  joinClassResponseSchema,
  linkGuardianResponseSchema,
  schoolsResponseSchema,
  type CreateClassBody,
} from '@guardian-book/shared'
import { api } from './client'

export const createClass = (body: CreateClassBody) =>
  api('/api/teacher/classes', createClassResponseSchema, { method: 'POST', body })

export const joinClass = (code: string) => api('/api/learner/join', joinClassResponseSchema, { method: 'POST', body: { code } })

export const issueGuardianCode = () => api('/api/me/guardian-code', guardianCodeResponseSchema, { method: 'POST', body: {} })

export const linkGuardian = (code: string) =>
  api('/api/guardian/link', linkGuardianResponseSchema, { method: 'POST', body: { code } })

export const revokeGuardian = (guardianId: string) =>
  api(`/api/me/guardians/${encodeURIComponent(guardianId)}`, z.undefined(), { method: 'DELETE' })

export const schools = () => api('/api/schools', schoolsResponseSchema)
