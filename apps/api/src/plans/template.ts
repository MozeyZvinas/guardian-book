import type { PlanOutput, SkillLabels } from '@guardian-book/shared'

/**
 * The safe template plan (brief B06 §4: "exceeding steps → a safe template plan"). Written
 * by the server from the skill labels and the evidence IDs it already holds; no model text
 * in it. It passes the same plan rules as a model plan (test). Provenance when stored:
 * `synthetic_self_generated`, never `model_generated`.
 */
export interface TemplateInput {
  gapSkillTag: string
  labels: SkillLabels
  /** At least one evidence ID (the assessed event that showed the gap). */
  evidenceIds: readonly string[]
}

export function templatePlan(input: TemplateInput): PlanOutput {
  const ids = [...input.evidenceIds]
  const cite = (text: string) => ({ text, evidence_ids: ids })
  const { learner, guardian, teacher } = input.labels
  return {
    gap_skill_tag: input.gapSkillTag,
    learner_view: {
      tonight_step: cite(`Redo the step you lost on ${learner}. Take it one line at a time.`),
      hint: 'Open your feedback, read the hint on the lost step, then try that step again without looking at the rest.',
      why_it_matters: cite(`${learner} comes up again in the next paper. Fixing it now saves marks later.`),
    },
    guardian_view: {
      gap: cite(`One step slipped this week: ${guardian}. One more go will help.`),
      one_action: cite('Ask them to teach you the step they fixed. Ten minutes is enough. You do not need to know the maths.'),
      something_to_celebrate: cite('They brought their work and got it checked this week.'),
    },
    teacher_view: {
      who_shares_this_gap: cite(`This evidence covers one learner. Check the class picture for others with ${teacher}.`),
      suggested_intervention: cite(`A ten-minute starter on ${teacher} this week, then a follow-up check in two days.`),
    },
    evidence_event_ids: ids,
    resource_ids: [],
  }
}
