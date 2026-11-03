import { z } from 'zod'

/**
 * The shape of one evaluation case file (spec 04 §5.2). Cases live outside the repo in
 * `EVAL_DIR` and are never committed. The expected marks are the teacher's adjudicated
 * marks against the same guideline.
 */

const guidelineStepSchema = z.strictObject({
  step_id: z.string().min(1),
  step_no: z.number().int().positive(),
  kind: z.enum(['M', 'A', 'CA']),
  criterion: z.string().min(1),
  marks: z.number().int().nonnegative(),
  notes: z.string().nullable(),
  expected: z.string().nullable(),
})

export const evalCaseSchema = z.strictObject({
  id: z.string().min(1).max(64),
  /** A free label for stratified reporting (spec 04 §5.2), e.g. "partial_credit". */
  category: z.string().max(64).nullable().default(null),
  /** Teacher's legibility rating for photos, 1–4; null for typed. */
  legibility: z.number().int().min(1).max(4).nullable().default(null),
  item: z.strictObject({
    slug: z.string().min(1),
    prompt_md: z.string().min(1),
    max_marks: z.number().int().positive(),
  }),
  guideline: z.array(guidelineStepSchema).min(1),
  final_answer: z.string().nullable(),
  answer: z.discriminatedUnion('kind', [
    z.strictObject({ kind: z.literal('typed'), text: z.string().min(1) }),
    z.strictObject({
      kind: z.literal('photo'),
      /** Relative to EVAL_DIR. */
      image_path: z.string().min(1),
      media_type: z.enum(['image/jpeg', 'image/png', 'image/webp']),
    }),
  ]),
  mode: z.enum(['assisted', 'independent', 'retention']).default('assisted'),
  expected: z.strictObject({
    total: z.number().int().nonnegative(),
    /** awarded per step_id. */
    awarded: z.record(z.string(), z.number().int().nonnegative()),
    /** The first step where a mark was lost, or null when none was. */
    first_lost_step: z.string().nullable(),
  }),
})
export type EvalCase = z.infer<typeof evalCaseSchema>
