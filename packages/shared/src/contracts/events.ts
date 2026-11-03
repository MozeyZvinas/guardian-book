import { z } from 'zod'

/**
 * Learning events (spec 03 §2, §8.1, §9.1): the Brain's append-only evidence. Every kind
 * the schema knows is listed here; `appendEvent` in the API validates against this file
 * and is the only code path that writes `learning_events`.
 */
export const LEARNING_EVENT_KINDS = [
  // spec 03 §2
  'attempt_submitted',
  'assessed',
  'retried',
  'review_confirmed',
  'review_released',
  // spec 03 §8.1
  'fixed_independently',
  'support_given',
  'notice_confirmed',
  'plan_issued',
  'note_sent',
  'profile_set',
  // spec 03 §9.1
  'independent_check_completed',
  'retention_check_completed',
  'guideline_approved',
  'feedback_teacher_added',
  'intervention_assigned',
  'intervention_closed',
] as const

export const learningEventKindSchema = z.enum(LEARNING_EVENT_KINDS)
export type LearningEventKind = z.infer<typeof learningEventKindSchema>

export const EVENT_BASES = ['model_high', 'teacher_confirmed', 'none'] as const
export const eventBasisSchema = z.enum(EVENT_BASES)
export type EventBasis = z.infer<typeof eventBasisSchema>

/** Kinds that never move skill state (spec 03 §8.1: `support_given` has basis `none`). */
export const BASIS_NONE_ONLY_KINDS: ReadonlySet<LearningEventKind> = new Set([
  'support_given',
  'notice_confirmed',
  'plan_issued',
  'note_sent',
  'profile_set',
  'guideline_approved',
  'feedback_teacher_added',
  'intervention_assigned',
  'intervention_closed',
])

const uuid = z.string().uuid()

/**
 * The payload carries IDs, numbers, booleans and enum-like short tokens only: no free
 * text (spec 03 §2). Strings are capped at 64 characters and must look like tokens.
 */
const payloadToken = z.string().max(64).regex(/^[A-Za-z0-9_.:-]*$/, 'payload strings are tokens, not text')
const payloadScalar = z.union([payloadToken, z.number().finite(), z.boolean(), z.null()])
export const eventPayloadSchema = z.record(
  z.string().max(64),
  z.union([payloadScalar, z.array(payloadScalar).max(100)]),
)
export type EventPayload = z.infer<typeof eventPayloadSchema>

export const learningEventInputSchema = z
  .object({
    learnerId: uuid,
    kind: learningEventKindSchema,
    attemptId: uuid.nullable().default(null),
    itemId: uuid.nullable().default(null),
    skillTag: z.string().min(1).max(100).nullable().default(null),
    basis: eventBasisSchema,
    payload: eventPayloadSchema.default({}),
    occurredAt: z.coerce.date().optional(),
  })
  .strict()
  .superRefine((event, ctx) => {
    if (BASIS_NONE_ONLY_KINDS.has(event.kind) && event.basis !== 'none') {
      ctx.addIssue({
        code: 'custom',
        path: ['basis'],
        message: `${event.kind} never moves skill state: basis must be "none"`,
      })
    }
  })

export type LearningEventInput = z.input<typeof learningEventInputSchema>
export type LearningEvent = z.output<typeof learningEventInputSchema>
