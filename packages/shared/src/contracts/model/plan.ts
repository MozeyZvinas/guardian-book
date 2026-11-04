import { z } from 'zod'
import { citedStatementSchema, evidenceIdSchema, shortText } from './common.js'

/**
 * The Help Plan (P0-08): one gap, three views. Every statement cites evidence; resources
 * come only from the vetted list (RESOURCE_UNVETTED); the guardian view must pass the
 * plain-language check (PLAIN_LANGUAGE_FAIL); no view may infer mood, health or
 * personality (INFERENCE_FORBIDDEN); the learner view never states the answer
 * (HINT_LEAKS_ANSWER).
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

/**
 * The bounded tool-using workflow (brief B06 §4; spec 03 §8.4 TOOL_UNKNOWN, STEPS_EXCEEDED).
 * The agent writes the plan over at most `PLAN_AGENT_MAX_STEPS` turns. Each turn is one
 * model call through the gateway: the model names ONE tool to call next, or `writePlan`
 * with the plan filled in. The server runs the tool, appends its result to the transcript
 * and asks again. `tool` is a free string on purpose: an unknown tool must be *seen* by the
 * verifier (TOOL_UNKNOWN) and discarded, not silently coerced.
 */
export const PLAN_AGENT_TOOLS = ['getEvidence', 'getCalendar', 'getProfileCards', 'getResources', 'writePlan'] as const
export type PlanAgentTool = (typeof PLAN_AGENT_TOOLS)[number]
export const PLAN_AGENT_MAX_STEPS = 8

export const planAgentTurnSchema = z.strictObject({
  /** The tool to call next, or `writePlan`. */
  tool: z.string().min(1).max(40),
  /** One line on why, kept in the stored trace. */
  reason: shortText(200),
  /** Filled in only when `tool` is `writePlan`; null for every other tool. */
  plan: planOutputSchema.nullable(),
})
export type PlanAgentTurn = z.infer<typeof planAgentTurnSchema>

export function isPlanAgentTool(tool: string): tool is PlanAgentTool {
  return (PLAN_AGENT_TOOLS as readonly string[]).includes(tool)
}
