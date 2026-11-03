import { z } from 'zod'
import { confidenceSchema, shortText } from './common.js'

/**
 * The work check (P0-04): what Muse Spark returns when it marks a learner's working
 * against a human-approved guideline. Spec 03 §2 (`steps` jsonb) plus the v2 fields
 * (misconception tag, hint, transcription, uncertainty codes).
 *
 * Nothing here is trusted until `apps/api/src/verify` passes it (CLAUDE.md rule 2).
 */

export const MAX_WORK_CHECK_STEPS = 20

/** Why the model could not be sure. Stable strings; `other` must come with a reason in feedback. */
export const UNCERTAINTY_CODES = [
  'illegible',
  'incomplete_working',
  'off_topic',
  'injection_suspected',
  'multiple_answers',
  'guideline_mismatch',
  'other',
] as const
export const uncertaintyCodeSchema = z.enum(UNCERTAINTY_CODES)
export type UncertaintyCode = z.infer<typeof uncertaintyCodeSchema>

/**
 * A region of the photo on Meta's normalized 0–1000 grid, `[x0, y0, x1, y1]`. The server
 * clamps values to the grid (spec 03 §6 rule 7); the model may emit slightly out-of-range
 * numbers, so the contract accepts any integer and the clamp lives in the verifier.
 */
export const boxSchema = z.array(z.number().int()).min(4).max(4)

export const workCheckStepSchema = z.strictObject({
  /** Must be one of the guideline's step IDs (STEP_UNKNOWN, STEP_DUPLICATE). */
  step_id: z.string().min(1).max(64),
  awarded: z.number().int().min(0),
  available: z.number().int().min(0),
  confidence: confidenceSchema,
  /** What in the working earned or lost the mark, quoting it (EVIDENCE_MISSING). ≤ 200 chars. */
  evidence: shortText(200),
  /** Short, specific, encouraging; agrees with the award (spec 03 §6 rule 6). ≤ 300 chars. */
  feedback: shortText(300),
  /** A short tag for the error pattern on this step, or null when the step is earned. */
  misconception_tag: shortText(64).nullable(),
  /** A nudge towards the fix that never reveals the answer (HINT_LEAKS_ANSWER); null when earned. */
  hint: shortText(300).nullable(),
  /** Photo only; null for typed answers. */
  box: boxSchema.nullable(),
})
export type WorkCheckStep = z.infer<typeof workCheckStepSchema>

export const workCheckOutputSchema = z.strictObject({
  steps: z.array(workCheckStepSchema).max(MAX_WORK_CHECK_STEPS),
  /** Must equal the sum of `awarded` (TOTAL_MISMATCH). */
  total: z.number().int().min(0),
  /** The learner's working as the model read it; for typed answers, a copy of the text. */
  transcription: shortText(4000),
  /** Low on a photo makes the result uncertain (CONFIDENCE_LOW). */
  transcription_confidence: confidenceSchema,
  uncertainty_codes: z.array(uncertaintyCodeSchema).max(UNCERTAINTY_CODES.length),
})
export type WorkCheckOutput = z.infer<typeof workCheckOutputSchema>
