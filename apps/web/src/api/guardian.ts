import { guardianNotesResponseSchema, guardianWeekViewSchema, languageResponseSchema, supportGivenResponseSchema, type GuardianNoteView, type Language } from '@guardian-book/shared'
import { api } from './client'

/** The guardian space (B06, B07, B12): the week, "We did it", sent notes, and the parent's home language. */

export const guardianWeek = (learnerId: string) => api(`/api/guardian/learners/${encodeURIComponent(learnerId)}/plan`, guardianWeekViewSchema)

export const supportGiven = (learnerId: string) =>
  api(`/api/guardian/learners/${encodeURIComponent(learnerId)}/plan/done`, supportGivenResponseSchema, { method: 'POST', body: {} })

/** `GET /api/guardian/notes` (B07, D37): only sent notes addressed to this guardian, each with its translation state (B12). */
export type GuardianNote = GuardianNoteView
export const guardianNotes = () => api('/api/guardian/notes', guardianNotesResponseSchema)

export const guardianLanguage = () => api('/api/guardian/language', languageResponseSchema)
export const setGuardianLanguage = (language: Language) => api('/api/guardian/language', languageResponseSchema, { method: 'PATCH', body: { language } })
