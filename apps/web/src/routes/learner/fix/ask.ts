import { askResponseSchema, type AskBody } from '@guardian-book/shared'
import { api } from '../../../api/client'

/** `POST /api/attempts/:id/ask` (B13): one question about one lost step, one verified hint. */
export const askAboutStep = (attemptId: string, body: AskBody) =>
  api(`/api/attempts/${encodeURIComponent(attemptId)}/ask`, askResponseSchema, { method: 'POST', body })
