import { z } from 'zod'
import { shortText } from './common.js'

/**
 * Ask about a step (brief B13; P1-a). The learner asks, in their own words, about one
 * step that slipped; the model answers with ONE hint that never states the step's result.
 * The verifier (HINT_LEAKS_ANSWER against the item's memo values, INFERENCE_FORBIDDEN)
 * gates every output; the length is part of the contract itself (SCHEMA_INVALID).
 */

export const STEP_HINT_MAX_CHARS = 300

/** The model's output for purpose `step_hint`: one hint, nothing else. */
export const stepHintSchema = z.strictObject({
  hint: shortText(STEP_HINT_MAX_CHARS),
})
export type StepHint = z.infer<typeof stepHintSchema>

// ── `POST /api/attempts/:id/ask` ──────────────────────────────────────────────────────────

export const MAX_QUESTION_CHARS = 500

export const askBodySchema = z
  .object({
    /** The learner's question, typed or transcribed. Untrusted data in the prompt. */
    question: z.string().trim().min(1).max(MAX_QUESTION_CHARS),
    /** The step asked about; defaults to the first step that slipped. */
    stepNo: z.number().int().min(1).max(50).optional(),
  })
  .strict()
export type AskBody = z.infer<typeof askBodySchema>

export const ASK_STATUSES = ['accepted', 'exhausted', 'failed'] as const
export const askStatusSchema = z.enum(ASK_STATUSES)
export type AskStatus = z.infer<typeof askStatusSchema>

/** What the learner sees when no verified hint came back (brief B13 §3): this, and nothing else. */
export const ASK_YOUR_TEACHER = 'Ask your teacher about this step.'

export const askResponseSchema = z.object({
  status: askStatusSchema,
  stepNo: z.number().int(),
  /** The verified hint when `accepted`; null otherwise. */
  hint: z.string().nullable(),
  /** Model calls made for this question (each counts against the daily cap). */
  calls: z.number().int().nonnegative(),
  /** Plain words for the screen when there is no hint. */
  message: z.string().nullable(),
})
export type AskResponse = z.infer<typeof askResponseSchema>
