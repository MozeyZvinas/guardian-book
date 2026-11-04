import { z } from 'zod'
import { classSummarySchema, createAttemptResponseSchema, type CreateAttemptResponse } from '@guardian-book/shared'
import { api } from '../../../api/client'

/**
 * B11 · the Mark-a-script screen's two calls. `POST /api/teacher/classes/:classId/scripts`
 * (multipart: learnerId, itemId, idempotencyKey, image) answers the same shape as
 * `POST /api/attempts`: the attempt to poll through `GET /api/teacher/attempts/:id`.
 */
export function uploadScript(classId: string, fields: { learnerId: string; itemId: string; idempotencyKey: string }, image: Blob, filename = 'script.jpg'): Promise<CreateAttemptResponse> {
  const form = new FormData()
  form.set('learnerId', fields.learnerId)
  form.set('itemId', fields.itemId)
  form.set('idempotencyKey', fields.idempotencyKey)
  form.set('image', image, filename)
  return api(`/api/teacher/classes/${encodeURIComponent(classId)}/scripts`, createAttemptResponseSchema, { method: 'POST', form })
}

/** The class roster (B02's `GET /api/teacher/classes/:id`): nicknames only. */
export const classDetailResponseSchema = z.object({
  class: classSummarySchema,
  members: z.array(z.object({ learnerId: z.string().uuid(), nickname: z.string(), joinedAt: z.string() })),
})
export type ClassDetailResponse = z.infer<typeof classDetailResponseSchema>

export const classDetail = (classId: string) => api(`/api/teacher/classes/${encodeURIComponent(classId)}`, classDetailResponseSchema)
