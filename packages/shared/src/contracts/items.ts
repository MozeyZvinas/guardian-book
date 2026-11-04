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

/**
 * Where an item came from (B17; D40). `original`: written for this build. `dbe_nsc`: a real
 * NSC question extracted from a DBE paper, which must carry its `source_ref` (paper and
 * question number) and an `attribution` line that is shown wherever the question is shown
 * and never stripped. Nothing else is allowed in.
 */
export const ITEM_SOURCES = ['original', 'dbe_nsc'] as const
export const itemSourceSchema = z.enum(ITEM_SOURCES)
export type ItemSource = z.infer<typeof itemSourceSchema>

/** The three NSC sittings in a year, in calendar order. */
export const PAPER_SESSIONS = ['feb_march', 'may_june', 'november'] as const
export const paperSessionSchema = z.enum(PAPER_SESSIONS)
export type PaperSession = z.infer<typeof paperSessionSchema>

/** One paper: the library's Subject → Grade → Year → Session → Paper key. */
export const paperRefSchema = z
  .object({
    subject: z.string().trim().min(1).max(60),
    grade: z.number().int().min(10).max(12),
    year: z.number().int().min(2008).max(2100),
    session: paperSessionSchema,
    paper: z.number().int().min(1).max(3),
  })
  .strict()
export type PaperRef = z.infer<typeof paperRefSchema>

/** A `dbe_nsc` item's place in its paper: the paper plus the question number ("3.2"). */
export const sourceRefSchema = paperRefSchema
  .extend({
    question: z
      .string()
      .trim()
      .min(1)
      .max(20)
      .regex(/^[0-9]+(?:\.[0-9]+)*$/, 'question numbers look like "3" or "3.2.1"'),
  })
  .strict()
export type SourceRef = z.infer<typeof sourceRefSchema>

export const MAX_ATTRIBUTION_CHARS = 300

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
 * directory outside the repo; the dev samples under `apps/api/seed/items/` use the same
 * shape. `source` is `original` (D20) or, since B17 (D40), `dbe_nsc`: a real NSC question
 * with its memo, which must say which paper and question it is (`source_ref`), carry its
 * attribution line, and be `licensed_content`. `held_out` marks the newest session (D31):
 * loaded, but never offered as practice and never in the library; the evaluation reads it.
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
    source: itemSourceSchema.default('original'),
    source_ref: sourceRefSchema.nullable().default(null),
    attribution: z.string().trim().min(1).max(MAX_ATTRIBUTION_CHARS).nullable().default(null),
    held_out: z.boolean().default(false),
    provenance: provenanceSchema,
    guideline_steps: z.array(guidelineStepFileSchema).min(1).max(50),
  })
  .strict()
  .superRefine((item, ctx) => {
    if (item.source === 'dbe_nsc') {
      if (!item.source_ref) ctx.addIssue({ code: 'custom', path: ['source_ref'], message: 'a dbe_nsc item must say which paper and question it is' })
      if (!item.attribution) ctx.addIssue({ code: 'custom', path: ['attribution'], message: 'a dbe_nsc item must carry its attribution line (D40)' })
      if (item.provenance !== 'licensed_content') {
        ctx.addIssue({ code: 'custom', path: ['provenance'], message: 'a dbe_nsc item is licensed_content' })
      }
    } else if (item.source_ref) {
      ctx.addIssue({ code: 'custom', path: ['source_ref'], message: 'only a dbe_nsc item has a source_ref' })
    }
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
  /** B09: the question itself (Markdown with TeX maths), so a picker never shows the slug. */
  promptMd: z.string(),
  /** B09, learners only: true when a class the learner is in has this revision's guideline approved. */
  approvedForYou: z.boolean().optional(),
  /** B17 (D40): where the question came from; the attribution line is shown wherever the question is. */
  source: itemSourceSchema.default('original'),
  attribution: z.string().nullable().default(null),
  sourceRef: sourceRefSchema.nullable().default(null),
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
