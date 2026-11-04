import { z } from 'zod'
import { guardianWeekResponseSchema, supportGivenResponseSchema } from '@guardian-book/shared'
import { api } from './client'

/** The guardian space (B06): the week, "We did it", and B07's sent notes. */

export const guardianWeek = (learnerId: string) => api(`/api/guardian/learners/${encodeURIComponent(learnerId)}/plan`, guardianWeekResponseSchema)

export const supportGiven = (learnerId: string) =>
  api(`/api/guardian/learners/${encodeURIComponent(learnerId)}/plan/done`, supportGivenResponseSchema, { method: 'POST', body: {} })

/** `GET /api/guardian/notes` is B07's (D37); only sent notes addressed to this guardian come back. */
export const guardianNoteSchema = z.object({
  id: z.string(),
  learner: z.object({ id: z.string(), nickname: z.string() }),
  teacher: z.object({ id: z.string(), nickname: z.string() }),
  label: z.string(),
  text: z.string(),
  sentAt: z.string(),
})
export type GuardianNote = z.infer<typeof guardianNoteSchema>
export const guardianNotes = () => api('/api/guardian/notes', z.object({ notes: z.array(guardianNoteSchema) }))
