import {
  assessResponseSchema,
  attemptResponseSchema,
  calendarDecisionResponseSchema,
  calendarResponseSchema,
  createAttemptResponseSchema,
  inputResponseSchema,
  inputsListResponseSchema,
  itemsResponseSchema,
  type CreateAttemptBody,
  type CreateInputFields,
  type PatchInputKindBody,
} from '@guardian-book/shared'
import { api } from './client'

/** Bring anything, the homework check and the calendar (spec 03 §5, §8.3). */

export const items = () => api('/api/items', itemsResponseSchema)

/** JSON for typed text; multipart when there is a file. */
export function createInput(fields: CreateInputFields, file: Blob | null, filename = 'capture.jpg') {
  if (!file) return api('/api/inputs', inputResponseSchema, { method: 'POST', body: fields })
  const form = new FormData()
  for (const [key, value] of Object.entries(fields)) if (value !== undefined) form.set(key, String(value))
  form.set('file', file, filename)
  return api('/api/inputs', inputResponseSchema, { method: 'POST', form })
}

export const getInput = (id: string) => api(`/api/inputs/${encodeURIComponent(id)}`, inputResponseSchema)
export const listInputs = () => api('/api/inputs', inputsListResponseSchema)
export const setInputKind = (id: string, body: PatchInputKindBody) =>
  api(`/api/inputs/${encodeURIComponent(id)}/kind`, inputResponseSchema, { method: 'PATCH', body })

export const createAttempt = (body: CreateAttemptBody) => api('/api/attempts', createAttemptResponseSchema, { method: 'POST', body })
export const assess = (attemptId: string) => api(`/api/attempts/${encodeURIComponent(attemptId)}/assess`, assessResponseSchema, { method: 'POST', body: {} })
export const getAttempt = (attemptId: string) => api(`/api/attempts/${encodeURIComponent(attemptId)}`, attemptResponseSchema)
/** The 302 target is a presigned link that lives five minutes; the browser follows it. */
export const attemptImageUrl = (attemptId: string) => `/api/attempts/${encodeURIComponent(attemptId)}/image`

export const calendar = (scope?: string) => api(`/api/calendar${scope ? `?scope=${encodeURIComponent(scope)}` : ''}`, calendarResponseSchema)
export const decideEvent = (eventId: string, decision: 'confirm' | 'reject') =>
  api(`/api/calendar/${encodeURIComponent(eventId)}/${decision}`, calendarDecisionResponseSchema, { method: 'POST', body: {} })
