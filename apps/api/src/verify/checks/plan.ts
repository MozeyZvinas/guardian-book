import type { CitedStatement, InputClass, NoteDraft, PlanOutput, ProfileCards } from '@guardian-book/shared'
import {
  fail,
  pass,
  type CheckOutcome,
  type CheckRule,
  type ClassifyContext,
  type NoteContext,
  type PlanContext,
  type ProfileCardsContext,
} from '../types.js'
import { evidenceRefs, inferenceForbidden, plainLanguage, stringsIn } from './common.js'

/** Rules for the Help Plan (P0-08), notes (P0-10), profile cards (P0-02) and classification (P0-03). */

function planStatements(output: PlanOutput): Array<{ path: string; statement: CitedStatement }> {
  return [
    { path: 'learner_view.tonight_step', statement: output.learner_view.tonight_step },
    { path: 'learner_view.why_it_matters', statement: output.learner_view.why_it_matters },
    { path: 'guardian_view.gap', statement: output.guardian_view.gap },
    { path: 'guardian_view.one_action', statement: output.guardian_view.one_action },
    { path: 'guardian_view.something_to_celebrate', statement: output.guardian_view.something_to_celebrate },
    { path: 'teacher_view.who_shares_this_gap', statement: output.teacher_view.who_shares_this_gap },
    { path: 'teacher_view.suggested_intervention', statement: output.teacher_view.suggested_intervention },
  ]
}

export function planEvidenceRefs(output: PlanOutput, context: PlanContext): CheckOutcome {
  const statements = planStatements(output).map(({ path, statement }) => ({ path, evidence_ids: statement.evidence_ids }))
  statements.push({ path: 'evidence_event_ids', evidence_ids: output.evidence_event_ids })
  return evidenceRefs(statements, context.knownEvidenceIds)
}

export function resourceUnvetted(output: PlanOutput, context: PlanContext): CheckOutcome {
  const vetted = new Set(context.vettedResourceIds)
  const unvetted = output.resource_ids.filter((id) => !vetted.has(id))
  if (unvetted.length === 0) return pass('every resource is on the vetted list')
  return fail(`resource ${unvetted.join(', ')} is not on the vetted list; cite only: ${[...vetted].join(', ') || '(none)'}`)
}

export function planPlainLanguage(output: PlanOutput): CheckOutcome {
  const view = output.guardian_view
  return plainLanguage([
    { path: 'guardian_view.gap', text: view.gap.text },
    { path: 'guardian_view.one_action', text: view.one_action.text },
    { path: 'guardian_view.something_to_celebrate', text: view.something_to_celebrate.text },
  ])
}

export function planInferenceForbidden(output: PlanOutput): CheckOutcome {
  return inferenceForbidden([
    ...stringsIn(output.learner_view, 'learner_view'),
    ...stringsIn(output.guardian_view, 'guardian_view'),
    ...stringsIn(output.teacher_view, 'teacher_view'),
  ])
}

export function toolUnknown(_output: PlanOutput, context: PlanContext): CheckOutcome {
  const allowed = new Set(context.allowedTools)
  const unknown = [...new Set(context.trace.map((step) => step.tool).filter((tool) => !allowed.has(tool)))]
  if (unknown.length === 0) return pass('every agent step used an allowed tool')
  return fail(`tool ${unknown.join(', ')} is not allowed; allowed: ${[...allowed].join(', ') || '(none)'}`)
}

export function stepsExceeded(_output: PlanOutput, context: PlanContext): CheckOutcome {
  if (context.trace.length <= context.maxSteps) return pass(`${context.trace.length} of at most ${context.maxSteps} agent steps`)
  return fail(`the agent took ${context.trace.length} steps; the limit is ${context.maxSteps}`)
}

export const PLAN_RULES: CheckRule<PlanOutput, PlanContext>[] = [
  { code: 'EVIDENCE_REF_UNKNOWN', retryable: true, run: planEvidenceRefs },
  { code: 'RESOURCE_UNVETTED', retryable: true, run: resourceUnvetted },
  { code: 'PLAIN_LANGUAGE_FAIL', retryable: true, run: planPlainLanguage },
  { code: 'INFERENCE_FORBIDDEN', retryable: true, run: planInferenceForbidden },
  { code: 'TOOL_UNKNOWN', retryable: false, run: toolUnknown },
  { code: 'STEPS_EXCEEDED', retryable: false, run: stepsExceeded },
]

export const NOTE_RULES: CheckRule<NoteDraft, NoteContext>[] = [
  { code: 'EVIDENCE_REF_UNKNOWN', retryable: true, run: (output, context) => evidenceRefs([{ path: 'evidence_event_ids', evidence_ids: output.evidence_event_ids }], context.knownEvidenceIds) },
  { code: 'PLAIN_LANGUAGE_FAIL', retryable: true, run: (output) => plainLanguage([{ path: 'text', text: output.text }]) },
  { code: 'INFERENCE_FORBIDDEN', retryable: true, run: (output) => inferenceForbidden([{ path: 'text', text: output.text }]) },
]

export const PROFILE_CARDS_RULES: CheckRule<ProfileCards, ProfileCardsContext>[] = [
  { code: 'INFERENCE_FORBIDDEN', retryable: true, run: (output) => inferenceForbidden(stringsIn(output)) },
]

export const CLASSIFY_RULES: CheckRule<InputClass, ClassifyContext>[] = [
  {
    code: 'CONFIDENCE_LOW',
    retryable: false,
    run: (output) => (output.confidence === 'low' ? fail('low confidence: the learner chooses the kind') : pass('confidence is not low')),
  },
]
