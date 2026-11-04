import { z } from 'zod'

/**
 * Voice (brief B13; P1-a): the learner holds to talk, the browser encodes a short WAV clip,
 * the API sends it to Muse Voice Transcribe through the gateway and returns the words for
 * the learner to see and edit. Audio is never stored (not in the bucket, not in logs).
 */

/** The transcription as a model output (purpose `transcribe`): the text and nothing else. */
export const transcriptSchema = z.strictObject({
  transcript: z.string().max(4_000),
})
export type Transcript = z.infer<typeof transcriptSchema>

/** Upload cap for one clip (brief B13 §2). 60 s of 16 kHz mono 16-bit PCM is about 1.9 MB. */
export const MAX_VOICE_BYTES = 5 * 1024 * 1024
export const MAX_VOICE_SECONDS = 60
/**
 * Meta, "Transcribe a recording" (https://dev.meta.ai/docs/api-reference/voice/transcribe),
 * read 4 Nov 2026: "`WAV` is a RIFF/WAVE container holding mono integer PCM at 16 kHz or
 * 24 kHz." The browser records at the first rate; the server accepts both.
 */
export const VOICE_SAMPLE_RATES = [16_000, 24_000] as const
export const VOICE_BITS_PER_SAMPLE = 16

/** `POST /api/voice/transcribe`: the words, and how long the clip was (for the learner's own record). */
export const transcribeResponseSchema = z.object({
  transcript: z.string(),
  durationMs: z.number().int().nonnegative(),
})
export type TranscribeResponse = z.infer<typeof transcribeResponseSchema>
