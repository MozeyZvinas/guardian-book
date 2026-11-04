import { z } from 'zod'
import {
  approveGuidelineResponseSchema,
  attemptReviewResponseSchema,
  draftNotesResponseSchema,
  feedbackResponseSchema,
  guidelinesResponseSchema,
  interventionResponseSchema,
  interventionsResponseSchema,
  noteResponseSchema,
  noteViewSchema,
  notesResponseSchema,
  pictureResponseSchema,
  queueResponseSchema,
  reviewAttemptResponseSchema,
  reviewResponseSchema,
  teacherLearnerResponseSchema,
  type ConfirmReviewBody,
  type CreateInterventionBody,
  type CreateNoteBody,
  type FeedbackBody,
  type PatchInterventionBody,
} from '@guardian-book/shared'
import { api } from './client'

/** The teacher space (spec 03 §5, §8.3, §9.3): one function per route, parsed with the shared schema. */

const id = (value: string) => encodeURIComponent(value)

export const guidelines = (classId: string) => api(`/api/teacher/classes/${id(classId)}/guidelines`, guidelinesResponseSchema)
export const approveGuideline = (classId: string, itemId: string, itemRevision: number) =>
  api(`/api/teacher/classes/${id(classId)}/guidelines/${id(itemId)}/approve`, approveGuidelineResponseSchema, { method: 'POST', body: { itemRevision } })

export const picture = (classId: string) => api(`/api/teacher/classes/${id(classId)}/picture`, pictureResponseSchema)
export const queue = (classId: string) => api(`/api/teacher/queue?classId=${id(classId)}`, queueResponseSchema)

export const reviewAttempt = (attemptId: string) => api(`/api/teacher/attempts/${id(attemptId)}`, reviewAttemptResponseSchema)
export const confirmReview = (attemptId: string, body: ConfirmReviewBody) => api(`/api/teacher/attempts/${id(attemptId)}/review`, reviewResponseSchema, { method: 'POST', body })
export const releaseAttempt = (attemptId: string, version: number) => api(`/api/teacher/attempts/${id(attemptId)}/release`, reviewResponseSchema, { method: 'POST', body: { version } })
export const addFeedback = (reviewId: string, body: FeedbackBody) => api(`/api/teacher/reviews/${id(reviewId)}/feedback`, feedbackResponseSchema, { method: 'POST', body })
export const attemptReview = (attemptId: string) => api(`/api/attempts/${id(attemptId)}/review`, attemptReviewResponseSchema)

export const interventions = (classId: string) => api(`/api/teacher/classes/${id(classId)}/interventions`, interventionsResponseSchema)
export const createIntervention = (body: CreateInterventionBody) => api('/api/teacher/interventions', interventionResponseSchema, { method: 'POST', body })
export const patchIntervention = (interventionId: string, body: PatchInterventionBody) =>
  api(`/api/teacher/interventions/${id(interventionId)}`, interventionResponseSchema, { method: 'PATCH', body })

export const notes = (classId: string) => api(`/api/teacher/notes?classId=${id(classId)}`, notesResponseSchema)
export const draftNotes = (classId: string) => api(`/api/teacher/classes/${id(classId)}/notes/draft`, draftNotesResponseSchema, { method: 'POST', body: {} })
export const createNote = (body: CreateNoteBody) => api('/api/teacher/notes', z.object({ notes: z.array(noteViewSchema) }), { method: 'POST', body })
export const approveNote = (noteId: string, finalText: string) => api(`/api/teacher/notes/${id(noteId)}/approve`, noteResponseSchema, { method: 'POST', body: { finalText } })
export const sendNote = (noteId: string) => api(`/api/teacher/notes/${id(noteId)}/send`, noteResponseSchema, { method: 'POST', body: {} })

export const learnerProfile = (learnerId: string) => api(`/api/teacher/learners/${id(learnerId)}`, teacherLearnerResponseSchema)
