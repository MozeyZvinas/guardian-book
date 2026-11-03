import { z } from 'zod'

/**
 * Why a model call is made (spec 03 §8.1, `model_runs.purpose`). One purpose, one output
 * contract, one rule set in the verifier. Stable strings: they are stored on every run.
 */
export const MODEL_PURPOSES = ['classify', 'profile_cards', 'assess', 'notice', 'plan', 'note'] as const
export const modelPurposeSchema = z.enum(MODEL_PURPOSES)
export type ModelPurpose = z.infer<typeof modelPurposeSchema>

/** Carried on every model output so B04 can record `provenance = model_generated` (D35). */
export const modelProvenanceSchema = z.strictObject({
  provider: z.literal('meta'),
  model: z.string().min(1),
  /** The prompt version string, immutable once shipped. */
  version: z.string().min(1),
})
export type ModelProvenance = z.infer<typeof modelProvenanceSchema>
