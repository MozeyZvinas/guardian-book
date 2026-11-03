import { z } from 'zod'
import { confidenceSchema, shortText } from './common.js'

/**
 * Bring anything (P0-03): the server classifies an input so it can route it. The learner
 * can override the class without a second upload.
 */

export const INPUT_KINDS = ['work', 'notice', 'question'] as const
export const inputKindSchema = z.enum(INPUT_KINDS)
export type InputKind = z.infer<typeof inputKindSchema>

export const inputClassSchema = z.strictObject({
  kind: inputKindSchema,
  confidence: confidenceSchema,
  /** One short sentence on what the input looked like. Never a transcription. */
  reason: shortText(200),
})
export type InputClass = z.infer<typeof inputClassSchema>
