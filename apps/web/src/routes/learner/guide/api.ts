import { guideResponseSchema, type CreateGuideFields } from '@guardian-book/shared'
import { api } from '../../../api/client'

/** `POST /api/guide` (B15): JSON for typed text or an input already brought; multipart when there is a photo. */
export function createGuide(fields: CreateGuideFields, file: Blob | null, filename = 'question.jpg') {
  if (!file) return api('/api/guide', guideResponseSchema, { method: 'POST', body: fields })
  const form = new FormData()
  for (const [key, value] of Object.entries(fields)) if (value !== undefined) form.set(key, String(value))
  form.set('file', file, filename)
  return api('/api/guide', guideResponseSchema, { method: 'POST', form })
}

/** `GET /api/guide/:id`: polled every 2 s while the two reads run. */
export const getGuide = (id: string) => api(`/api/guide/${encodeURIComponent(id)}`, guideResponseSchema)
