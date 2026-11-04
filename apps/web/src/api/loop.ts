import { checkAloneResponseSchema, fixAttemptResponseSchema, learnerPlanResponseSchema, type CheckMode } from '@guardian-book/shared'
import { api } from './client'

/** Closing the loop (B06): fix it, check it alone, the learner's plan. */

export const fixAttempt = (attemptId: string, answerText: string) =>
  api(`/api/attempts/${encodeURIComponent(attemptId)}/fix`, fixAttemptResponseSchema, { method: 'POST', body: { answerText } })

export function fixAttemptPhoto(attemptId: string, file: Blob, filename = 'fix.jpg') {
  const form = new FormData()
  form.set('file', file, filename)
  return api(`/api/attempts/${encodeURIComponent(attemptId)}/fix`, fixAttemptResponseSchema, { method: 'POST', form })
}

export const checkAlone = (skill: string, mode: CheckMode, from: string | null) =>
  api(`/api/me/check-alone?skill=${encodeURIComponent(skill)}&mode=${mode}${from ? `&from=${encodeURIComponent(from)}` : ''}`, checkAloneResponseSchema)

export const myPlan = () => api('/api/me/plan', learnerPlanResponseSchema)
