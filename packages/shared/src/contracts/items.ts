import { z } from 'zod'
import { provenanceSchema } from './provenance.js'

/**
 * Items and marking guidelines (spec 03 §2; spec 02 P0-04). Guideline steps are typed
 * M (method), A (accuracy) or CA (consistent accuracy). The sum of step marks must equal
 * the item's `max_marks`; the loader enforces it because a cross-row CHECK is impractical.
 */
export const GUIDELINE_STEP_TYPES = ['M', 'A', 'CA'] as const
export const guidelineStepTypeSchema = z.enum(GUIDELINE_STEP_TYPES)
export type GuidelineStepType = z.infer<typeof guidelineStepTypeSchema>

export const ITEM_STATUSES = ['draft', 'approved'] as const
export const itemStatusSchema = z.enum(ITEM_STATUSES)

export const skillTagSchema = z
  .string()
  .min(1)
  .max(100)
  .regex(/^[a-z0-9]+(?:[-_.][a-z0-9]+)*$/, 'skill tags are lower-case tokens, e.g. "factorise-trinomial"')

const slugSchema = z
  .string()
  .min(1)
  .max(80)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'slugs are lower-case, dash-separated')

/** The reviewer value of an item nobody has reviewed yet. */
export const PENDING_REVIEWER = 'pending'

/** One guideline step as written in a content file. */
export const guidelineStepFileSchema = z
  .object({
    step_no: z.number().int().min(1).max(50),
    step_type: guidelineStepTypeSchema,
    criterion: z.string().trim().min(1).max(500),
    marks: z.number().int().min(0).max(50),
    skill_tag: skillTagSchema,
    notes: z.string().trim().max(1000).nullable().default(null),
  })
  .strict()
export type GuidelineStepFile = z.infer<typeof guidelineStepFileSchema>

/**
 * A content file: one item with its guideline. Loaded by `pnpm content:load <dir>` from a
 * directory outside the repo; the two dev samples under `apps/api/seed/items/` use the
 * same shape. `source` is always `original` (D20: nothing from DBE papers enters).
 */
export const itemFileSchema = z
  .object({
    slug: slugSchema,
    topic: z.string().trim().min(1).max(100),
    skill_tags: z.array(skillTagSchema).min(1).max(20),
    prompt_md: z.string().trim().min(1).max(8000),
    diagram_key: z.string().max(200).nullable().default(null),
    max_marks: z.number().int().min(1).max(100),
    author: z.string().trim().min(1).max(100),
    /** `pending` until a teacher has reviewed the guideline. */
    reviewer: z.string().trim().min(1).max(100),
    reviewed_at: z.string().datetime().nullable().default(null),
    source: z.literal('original'),
    provenance: provenanceSchema,
    guideline_steps: z.array(guidelineStepFileSchema).min(1).max(50),
  })
  .strict()
  .superRefine((item, ctx) => {
    const sum = item.guideline_steps.reduce((total, step) => total + step.marks, 0)
    if (sum !== item.max_marks) {
      ctx.addIssue({
        code: 'custom',
        path: ['guideline_steps'],
        message: `guideline marks sum to ${sum} but max_marks is ${item.max_marks}`,
      })
    }
    const numbers = item.guideline_steps.map((step) => step.step_no)
    const expected = numbers.map((_, index) => index + 1)
    if (numbers.join(',') !== expected.join(',')) {
      ctx.addIssue({
        code: 'custom',
        path: ['guideline_steps'],
        message: 'step_no must run 1..n in order',
      })
    }
    // An AI-drafted item is honestly labelled `model_generated` and loads only while its
    // reviewer is still `pending`: the class teacher's guideline approval (spec 03 §9.1) is
    // the review gate, and B07 labels such guidelines "AI-drafted: check before approving".
    // Once a teacher has reviewed it, the file says so with `teacher_verified`.
    if (item.provenance === 'model_generated' && item.reviewer !== PENDING_REVIEWER) {
      ctx.addIssue({
        code: 'custom',
        path: ['provenance'],
        message: `a model_generated item must have reviewer "${PENDING_REVIEWER}"; once reviewed, set provenance to teacher_verified`,
      })
    }
  })
export type ItemFile = z.infer<typeof itemFileSchema>

/** What the API serves (camelCase). Guideline steps appear only when the caller may see them. */
export const guidelineStepSchema = z.object({
  id: z.string().uuid(),
  stepNo: z.number().int(),
  stepType: guidelineStepTypeSchema,
  criterion: z.string(),
  marks: z.number().int(),
  skillTag: z.string(),
  notes: z.string().nullable(),
})
export type GuidelineStep = z.infer<typeof guidelineStepSchema>

export const itemSummarySchema = z.object({
  id: z.string().uuid(),
  slug: z.string(),
  topic: z.string(),
  skillTags: z.array(z.string()),
  maxMarks: z.number().int(),
  revision: z.number().int(),
})
export type ItemSummary = z.infer<typeof itemSummarySchema>

export const itemDetailSchema = itemSummarySchema.extend({
  promptMd: z.string(),
  diagramKey: z.string().nullable(),
  guidelineSteps: z.array(guidelineStepSchema).optional(),
  /** Teachers and admins only: where the item came from, so an AI-drafted guideline is labelled before approval. */
  provenance: provenanceSchema.optional(),
  reviewer: z.string().optional(),
})
export type ItemDetail = z.infer<typeof itemDetailSchema>

export const itemsResponseSchema = z.object({ items: z.array(itemSummarySchema) })
export const itemResponseSchema = z.object({ item: itemDetailSchema })
