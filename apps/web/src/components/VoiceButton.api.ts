import { transcribeResponseSchema } from '@guardian-book/shared'
import { api } from '../api/client'

/** `POST /api/voice/transcribe` (B13): the clip goes up once, the words come back; nothing is kept. */
export function transcribeVoice(clip: Blob) {
  const form = new FormData()
  form.set('file', clip, 'question.wav')
  return api('/api/voice/transcribe', transcribeResponseSchema, { method: 'POST', form })
}
