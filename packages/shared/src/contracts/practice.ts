import { z } from 'zod'
import { confidenceSchema } from './model/common.js'
import { inputKindSchema } from './model/inputClass.js'
import { provenanceSchema } from './provenance.js'

/**
 * Bring anything, the homework check and notice to plan (spec 03 §2, §8.1, §8.3, §9.1;
 * spec 02 P0-03, P0-04, P0-06). What the API accepts and what it serves, camelCase.
 */

export const ATTEMPT_MODES = ['assisted', 'independent', 'retention'] as const
export const attemptModeSchema = z.enum(ATTEMPT_MODES)
export type AttemptMode = z.infer<typeof attemptModeSchema>

export const MAX_INPUT_TEXT = 4_000
export const MAX_UPLOAD_BYTES = 8 * 1024 * 1024
export const UPLOAD_MEDIA_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'] as const
export const uploadMediaTypeSchema = z.enum(UPLOAD_MEDIA_TYPES)
export type UploadMediaType = z.infer<typeof uploadMediaTypeSchema>
/** The long edge the client downscales to before upload and the server caps at (spec 06 §2). */
export const MAX_IMAGE_EDGE_PX = 2_000

const idempotencyKeySchema = z.string().trim().min(1).max(100)

/** Fields of `POST /api/inputs`, as JSON or as multipart text fields next to `file`. */
export const createInputFieldsSchema = z
  .object({
    /** Skip the classify call by saying what it is. */
    kind: inputKindSchema.optional(),
    /** Homework: the approved item this answers. */
    itemId: z.string().uuid().optional(),
    mode: attemptModeSchema.optional(),
    /** Teacher only: the class a notice is for. */
    classId: z.string().uuid().optional(),
    text: z.string().trim().min(1).max(MAX_INPUT_TEXT).optional(),
    idempotencyKey: idempotencyKeySchema,
  })
  .strict()
export type CreateInputFields = z.infer<typeof createInputFieldsSchema>

export const patchInputKindBodySchema = z
  .object({
    kind: inputKindSchema,
    itemId: z.string().uuid().optional(),
    mode: attemptModeSchema.optional(),
    classId: z.string().uuid().optional(),
  })
  .strict()
export type PatchInputKindBody = z.infer<typeof patchInputKindBodySchema>

/** Where a notice stands: extraction runs in the background after the upload answers. */
export const NOTICE_STATES = ['none', 'extracting', 'extracted', 'not_a_notice', 'uncertain', 'failed', 'unsupported_pdf'] as const
export const noticeStateSchema = z.enum(NOTICE_STATES)
export type NoticeState = z.infer<typeof noticeStateSchema>

export const inputViewSchema = z.object({
  id: z.string().uuid(),
  kind: inputKindSchema,
  kindOverridden: z.boolean(),
  /** The classifier's confidence; null when the person stated the kind or no model ran. */
  confidence: confidenceSchema.nullable(),
  /** True when the client should ask "Which is it?" before routing. */
  needsKind: z.boolean(),
  hasText: z.boolean(),
  mediaType: uploadMediaTypeSchema.nullable(),
  attemptId: z.string().uuid().nullable(),
  notice: z.object({ state: noticeStateSchema, events: z.number().int().nonnegative(), proposed: z.number().int().nonnegative() }),
  createdAt: z.string(),
})
export type InputView = z.infer<typeof inputViewSchema>

export const inputResponseSchema = z.object({ input: inputViewSchema, replayed: z.boolean() })
export type InputResponse = z.infer<typeof inputResponseSchema>

/** Where an attempt stands, derived server-side (spec 05 §4.2 L3 states plus `assessing`). */
export const ATTEMPT_STATUSES = ['submitted', 'assessing', 'proposed', 'uncertain', 'failed'] as const
export const attemptStatusSchema = z.enum(ATTEMPT_STATUSES)
export type AttemptStatus = z.infer<typeof attemptStatusSchema>

/** One assessed step as served (spec 03 §2 `steps` jsonb, with the v2 fields). */
export const assessedStepSchema = z.object({
  stepId: z.string().uuid(),
  stepNo: z.number().int(),
  skillTag: z.string(),
  awarded: z.number().int(),
  available: z.number().int(),
  confidence: confidenceSchema,
  evidence: z.string(),
  feedback: z.string(),
  misconceptionTag: z.string().nullable(),
  /** Withheld (null) for independent and retention attempts until they are assessed. */
  hint: z.string().nullable(),
  box: z.array(z.number().int()).length(4).nullable(),
})
export type AssessedStep = z.infer<typeof assessedStepSchema>

export const assessmentViewSchema = z.object({
  id: z.string().uuid(),
  status: z.enum(['proposed', 'uncertain', 'failed']),
  /** Null unless `proposed`: no marks are shown for an uncertain result. */
  total: z.number().int().nullable(),
  steps: z.array(assessedStepSchema),
  ambiguityReasons: z.array(z.string()),
  transcriptionConfidence: confidenceSchema.nullable(),
  modelId: z.string(),
  promptVersion: z.string(),
  latencyMs: z.number().int(),
  createdAt: z.string(),
})
export type AssessmentView = z.infer<typeof assessmentViewSchema>

export const guidelineStepNameSchema = z.object({
  id: z.string().uuid(),
  stepNo: z.number().int(),
  stepType: z.enum(['M', 'A', 'CA']),
  marks: z.number().int(),
  skillTag: z.string(),
  criterion: z.string(),
})

export const attemptViewSchema = z.object({
  id: z.string().uuid(),
  learnerId: z.string().uuid(),
  itemId: z.string().uuid(),
  itemSlug: z.string(),
  itemTopic: z.string(),
  itemPromptMd: z.string(),
  itemRevision: z.number().int(),
  maxMarks: z.number().int(),
  kind: z.enum(['typed', 'photo']),
  mode: attemptModeSchema,
  status: attemptStatusSchema,
  answerText: z.string().nullable(),
  hasImage: z.boolean(),
  provenance: provenanceSchema,
  createdAt: z.string(),
})
export type AttemptView = z.infer<typeof attemptViewSchema>

export const attemptResponseSchema = z.object({
  attempt: attemptViewSchema,
  assessment: assessmentViewSchema.nullable(),
  /** The guideline's step names, in order (readable once the learner has this attempt). */
  guideline: z.array(guidelineStepNameSchema),
  /** Hints are present only when this is true (spec 03 §9.1 `attempts.mode`). */
  hintsVisible: z.boolean(),
})
export type AttemptResponse = z.infer<typeof attemptResponseSchema>

export const assessResponseSchema = z.object({
  status: z.enum(['assessing', 'done']),
  attemptId: z.string().uuid(),
})
export type AssessResponse = z.infer<typeof assessResponseSchema>

export const createAttemptBodySchema = z
  .object({
    itemId: z.string().uuid(),
    answerText: z.string().trim().min(1).max(MAX_INPUT_TEXT),
    idempotencyKey: idempotencyKeySchema,
    mode: attemptModeSchema.default('assisted'),
  })
  .strict()
export type CreateAttemptBody = z.infer<typeof createAttemptBodySchema>

export const createAttemptResponseSchema = z.object({ attemptId: z.string().uuid(), inputId: z.string().uuid(), replayed: z.boolean() })
export type CreateAttemptResponse = z.infer<typeof createAttemptResponseSchema>

/** The learner's recent inputs (L1 "Recent" in B05 reads this too). */
export const inputsListResponseSchema = z.object({ inputs: z.array(inputViewSchema) })

// ── calendar (P0-06) ──────────────────────────────────────────────────────────────────────

export const calendarEventViewSchema = z.object({
  id: z.string().uuid(),
  scopeType: z.enum(['class', 'learner']),
  scopeId: z.string().uuid(),
  title: z.string(),
  subject: z.string().nullable(),
  paper: z.string().nullable(),
  /** YYYY-MM-DD. */
  onDate: z.string(),
  sourceLine: z.string(),
  confidence: z.enum(['high', 'low']),
  status: z.enum(['proposed', 'confirmed', 'rejected']),
  sourceInputId: z.string().uuid(),
  /** True when the caller may confirm or reject it. */
  canDecide: z.boolean(),
  createdAt: z.string(),
})
export type CalendarEventView = z.infer<typeof calendarEventViewSchema>

export const calendarResponseSchema = z.object({ events: z.array(calendarEventViewSchema) })
export type CalendarResponse = z.infer<typeof calendarResponseSchema>

export const calendarDecisionResponseSchema = z.object({
  event: calendarEventViewSchema,
  /** For a class-scope confirmation: who now sees it. */
  published: z.object({ learners: z.number().int().nonnegative(), guardians: z.number().int().nonnegative() }).nullable(),
})
export type CalendarDecisionResponse = z.infer<typeof calendarDecisionResponseSchema>
