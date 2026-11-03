import { z } from 'zod'
import { citedStatementSchema, evidenceIdSchema, shortText } from './common.js'

/**
 * The Help Plan (P0-08): one gap, three views. Every statement cites evidence; resources
 * come only from the vetted list (RESOURCE_UNVETTED); the guardian view must pass the
 * plain-language check (PLAIN_LANGUAGE_FAIL); no view may infer mood, health or
 * personality (INFERENCE_FORBIDDEN).
 */

export const MAX_PLAN_RESOURCES = 5

export const planLearnerViewSchema = z.strictObject({
  tonight_step: citedStatementSchema,
  /** A nudge, never the answer. */
  hint: shortText(300),
  why_it_matters: citedStatementSchema,
})

export const planGuardianViewSchema = z.strictObject({
  /** The gap at topic level, in plain words. */
  gap: citedStatementSchema,
  /** One 10-minute action, free help first. */
  one_action: citedStatementSchema,
  something_to_celebrate: citedStatementSchema,
})

export const planTeacherViewSchema = z.strictObject({
  who_shares_this_gap: citedStatementSchema,
  suggested_intervention: citedStatementSchema,
})

export const planOutputSchema = z.strictObject({
  gap_skill_tag: z.string().min(1).max(64),
  learner_view: planLearnerViewSchema,
  guardian_view: planGuardianViewSchema,
  teacher_view: planTeacherViewSchema,
  /** The union of every statement's citations; ≥ 1 (spec 03 §8.1 `help_plans`). */
  evidence_event_ids: z.array(evidenceIdSchema).min(1).max(50),
  /** IDs from the vetted resource list only. */
  resource_ids: z.array(z.string().min(1).max(64)).max(MAX_PLAN_RESOURCES),
})
export type PlanOutput = z.infer<typeof planOutputSchema>
export type PlanLearnerView = z.infer<typeof planLearnerViewSchema>
export type PlanGuardianView = z.infer<typeof planGuardianViewSchema>
export type PlanTeacherView = z.infer<typeof planTeacherViewSchema>
