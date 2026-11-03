import { z } from 'zod'

/**
 * Pieces shared by the model output contracts.
 *
 * Every contract here is sent to Meta as a strict JSON schema (`strict: true`), so:
 * - use `strictObject` (closed objects) and `.nullable()`, never `.optional()`: the strict
 *   subset requires every key to be listed in `required`;
 * - no recursion, nesting depth ≤ 10 (`jsonSchema.ts` enforces both at export time);
 * - snake_case keys: these are the shapes the model writes, stored as-is in `model_runs.output`.
 */

export const CONFIDENCE_LEVELS = ['high', 'medium', 'low'] as const
export const confidenceSchema = z.enum(CONFIDENCE_LEVELS)
export type Confidence = z.infer<typeof confidenceSchema>

/** Two-level confidence for extracted facts (calendar events): "please confirm" or not. */
export const binaryConfidenceSchema = z.enum(['high', 'low'])
export type BinaryConfidence = z.infer<typeof binaryConfidenceSchema>

/** `YYYY-MM-DD`; the verifier parses and range-checks it (DATE_OUT_OF_RANGE). */
export const isoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'YYYY-MM-DD')

/** Short free text the model writes; bounded so nothing unbounded reaches the database. */
export const shortText = (max: number) => z.string().max(max)

/** A reference to an evidence event (`learning_events.id`), opaque to the model. */
export const evidenceIdSchema = z.string().min(1).max(64)

/**
 * A statement the model makes about a learner, tied to the evidence it rests on
 * (P0-08: "Every statement cites ≥ 1 evidence ID").
 */
export const citedStatementSchema = z.strictObject({
  text: shortText(400),
  evidence_ids: z.array(evidenceIdSchema).max(20),
})
export type CitedStatement = z.infer<typeof citedStatementSchema>
