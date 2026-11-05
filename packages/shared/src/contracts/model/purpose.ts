import { z } from 'zod'

/**
 * Why a model call is made (spec 03 §8.1, `model_runs.purpose`). One purpose, one output
 * contract, one rule set in the verifier. Stable strings: they are stored on every run.
 */
// B12 adds `translate` (one parent-facing text into the parent's home language).
// B13 adds `transcribe` (Muse Voice Transcribe; audio in, text out) and `step_hint` (ask about a step).
// B15 adds `guide` (help me with a question: any question read back and worked step by step).
// B17 adds `extract` (one page of an NSC paper or memo read into questions and marking steps).
export const MODEL_PURPOSES = ['classify', 'profile_cards', 'assess', 'notice', 'plan', 'note', 'translate', 'transcribe', 'step_hint', 'guide', 'extract'] as const
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
