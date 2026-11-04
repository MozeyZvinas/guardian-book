import { z } from 'zod'
import { confidenceSchema, shortText } from './common.js'

/**
 * Help me with a question (brief B15; D39). A learner brings any question, by photo or
 * typing; Muse Spark reads it back and takes the learner through it step by step. Two
 * independent reads must agree on the final answer before a worked step is shown; the
 * answer never comes first; nothing is marked and nothing moves the Brain.
 *
 * The model's output contract (`purpose = guide`) is sent to Meta as a strict JSON schema
 * (see `common.ts`). Nothing in it is trusted until `apps/api/src/verify` passes it.
 */

export const GUIDE_MIN_STEPS = 2
export const GUIDE_MAX_STEPS = 8

export const guideStepSchema = z.strictObject({
  /** One line: what this step achieves. Never a value from a later step. ≤ 200. */
  goal: shortText(200),
  /** How to start this step without giving its result away. ≤ 300. */
  hint: shortText(300),
  /** The step done, with its result, in Markdown with `$…$` maths. ≤ 800. */
  worked: shortText(800),
})
export type GuideStep = z.infer<typeof guideStepSchema>

/**
 * The output for purpose `guide`. The step count is bounded loosely here (the verifier's
 * STEPS_OUT_OF_RANGE names the 2–8 rule in words the re-ask can carry); the
 * strict-subset check needs no `min` on the array.
 */
export const guideOutputSchema = z.strictObject({
  /** The question read back, in Markdown with `$…$` or `$$…$$` maths (QUESTION_MISSING). ≤ 2000. */
  question_md: shortText(2000),
  /** "Mathematics", "Physical Sciences", … ≤ 80. */
  subject: shortText(80),
  /** A short topic name. ≤ 120. */
  topic: shortText(120),
  steps: z.array(guideStepSchema).max(GUIDE_MAX_STEPS),
  /** The final answer only, short, maths in `$…$` (ANSWERS_DISAGREE compares two of these). ≤ 300. */
  final_answer: shortText(300),
  /** Low when the question could not be read fully or the solution is uncertain: then only the first hint is shown. */
  confidence: confidenceSchema,
})
export type GuideOutput = z.infer<typeof guideOutputSchema>

// ── maths delimiters ──────────────────────────────────────────────────────────────────────

/**
 * Typed maths pasted from another app often arrives as `\( … \)` or `\[ … \]`. Everything
 * downstream (the prompt, `MathText`, the verifier's MATH_UNBALANCED) speaks `$…$`, so
 * typed input is normalised first. Pure; idempotent on text already in `$…$`.
 */
export function normaliseMathDelimiters(text: string): string {
  return text.replace(/\\\[([\s\S]*?)\\\]/g, (_match, tex: string) => `$$${tex.trim()}$$`).replace(/\\\(([\s\S]*?)\\\)/g, (_match, tex: string) => `$${tex.trim()}$`)
}

// ── `POST /api/guide`, `GET /api/guide/:id` ───────────────────────────────────────────────

export const MAX_GUIDE_TEXT = 2_000

const idempotencyKeySchema = z.string().trim().min(1).max(100)

/**
 * Fields of `POST /api/guide`, as JSON or as multipart text fields next to `file`:
 * typed `text`, or an existing `inputId` (the Bring screen offers the guide for an input
 * the classifier called a question), or `editOf` + `text` (the corrected read-back, once).
 */
export const createGuideFieldsSchema = z
  .object({
    text: z.string().trim().min(1).max(MAX_GUIDE_TEXT).optional(),
    inputId: z.string().uuid().optional(),
    /** The guide whose read-back the learner corrected; `text` is then required. */
    editOf: z.string().uuid().optional(),
    idempotencyKey: idempotencyKeySchema,
  })
  .strict()
export type CreateGuideFields = z.infer<typeof createGuideFieldsSchema>

export const GUIDE_STATUSES = ['reading', 'ready', 'unsure', 'failed'] as const
export const guideStatusSchema = z.enum(GUIDE_STATUSES)
export type GuideStatus = z.infer<typeof guideStatusSchema>

export const GUIDE_AGREEMENTS = ['agree', 'disagree', 'skipped'] as const
export const guideAgreementSchema = z.enum(GUIDE_AGREEMENTS)
export type GuideAgreement = z.infer<typeof guideAgreementSchema>

/** What the learner reads when the two reads disagreed, confidence was low, or one read failed its checks. */
export const GUIDE_UNSURE = 'I’m not sure about this one. Try the first step, then ask your teacher.'
/** What the learner reads when nothing verified came back at all. */
export const GUIDE_FAILED = 'I couldn’t read this one. Try typing it, or ask your teacher.'
/** The label on every guide screen (brief B15 §4). */
export const GUIDE_LABEL = 'AI-guided practice · not marked by your teacher'

/** One step as served. `worked` is null until the server is sure of it (status `unsure`). */
export const guideStepViewSchema = z.object({
  stepNo: z.number().int().min(1),
  goal: z.string(),
  hint: z.string(),
  worked: z.string().nullable(),
})
export type GuideStepView = z.infer<typeof guideStepViewSchema>

export const guideViewSchema = z.object({
  id: z.string().uuid(),
  status: guideStatusSchema,
  inputId: z.string().uuid(),
  hasImage: z.boolean(),
  /** The typed question (delimiters normalised), or null for a photo. */
  sourceText: z.string().nullable(),
  question: z.object({ questionMd: z.string(), subject: z.string(), topic: z.string() }).nullable(),
  /** All steps when `ready`; the first step with `worked: null` when `unsure`; empty otherwise. */
  steps: z.array(guideStepViewSchema),
  /** Only when `ready`: the screen hides it until the last step is shown. */
  finalAnswer: z.string().nullable(),
  confidence: confidenceSchema.nullable(),
  agreement: guideAgreementSchema.nullable(),
  /** The sentence to show when there is no full guide (`unsure`, `failed`). */
  message: z.string().nullable(),
  /** An approved bank item this question matches, for "Check my own working". */
  matchedItemId: z.string().uuid().nullable(),
  /** True until the read-back has been corrected once. */
  canEdit: z.boolean(),
  editedFromId: z.string().uuid().nullable(),
  createdAt: z.string(),
})
export type GuideView = z.infer<typeof guideViewSchema>

export const guideResponseSchema = z.object({ guide: guideViewSchema, replayed: z.boolean() })
export type GuideResponse = z.infer<typeof guideResponseSchema>
