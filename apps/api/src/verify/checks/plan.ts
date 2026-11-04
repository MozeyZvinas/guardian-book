import type { CitedStatement, InputClass, NoteDraft, PlanAgentTurn, PlanOutput, ProfileCards } from '@guardian-book/shared'
import { containsValue, guardedNumbers, normaliseMaths, stripStructuralNumbers } from '../text.js'
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

/**
 * HINT_LEAKS_ANSWER for the plan (B06): no text in the learner view may state a value from
 * the gap item's memo (the accuracy criteria), the same rule the work-check hint obeys.
 */
export function planAnswerLeak(output: PlanOutput, context: PlanContext): CheckOutcome {
  // A memo value, its bracketed factors and its guarded numbers; TeX dollar signs dropped.
  const raw = (context.memoValues ?? []).map((value) => value.replace(/\$/g, ''))
  const values = [...new Set(raw.flatMap((value) => [value, ...(value.match(/\([^()]+\)/g) ?? []), ...guardedNumbers(value)]).map(normaliseMaths).filter((v) => v.length > 1))]
  if (values.length === 0) return pass('no memo values to guard')
  const texts = [
    { path: 'learner_view.tonight_step', text: output.learner_view.tonight_step.text },
    { path: 'learner_view.hint', text: output.learner_view.hint },
    { path: 'learner_view.why_it_matters', text: output.learner_view.why_it_matters.text },
  ]
  const problems: string[] = []
  for (const { path, text } of texts) {
    const normalised = stripStructuralNumbers(normaliseMaths(text))
    if (values.some((value) => containsValue(normalised, value))) problems.push(`${path} states a value from the answer or the memo`)
  }
  if (problems.length === 0) return pass('the learner view states no answer')
  return fail(`${problems.join('; ')}; point at the step and what to check, never the value`)
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

// ── the agent turn (B06): the rules above applied to one model call ─────────────────────────

/** The context as it stands once this turn is counted: the trace plus the tool it names. */
function withThisTurn(turn: PlanAgentTurn, context: PlanContext): PlanContext {
  return { ...context, trace: [...context.trace, { tool: turn.tool }] }
}

const EMPTY_PLAN_FOR_RULES = {} as PlanOutput // toolUnknown and stepsExceeded never read the output

/** A content rule runs on the plan a `writePlan` turn carries; any other turn passes it. */
const onPlan =
  (rule: (output: PlanOutput, context: PlanContext) => CheckOutcome) =>
  (turn: PlanAgentTurn, context: PlanContext): CheckOutcome =>
    turn.plan ? rule(turn.plan, context) : pass('no plan in this turn')

export function planMissing(turn: PlanAgentTurn): CheckOutcome {
  if (turn.tool === 'writePlan' && !turn.plan) return fail('writePlan needs the plan object filled in')
  if (turn.tool !== 'writePlan' && turn.plan) return fail(`a ${turn.tool} call carries no plan; set plan to null, or name the tool writePlan`)
  return pass(turn.plan ? 'the plan is present' : 'a tool call')
}

export const PLAN_RULES: CheckRule<PlanAgentTurn, PlanContext>[] = [
  { code: 'TOOL_UNKNOWN', retryable: false, run: (turn, context) => toolUnknown(EMPTY_PLAN_FOR_RULES, withThisTurn(turn, context)) },
  { code: 'STEPS_EXCEEDED', retryable: false, run: (turn, context) => stepsExceeded(EMPTY_PLAN_FOR_RULES, withThisTurn(turn, context)) },
  { code: 'PLAN_MISSING', retryable: true, run: (turn) => planMissing(turn) },
  { code: 'EVIDENCE_REF_UNKNOWN', retryable: true, run: onPlan(planEvidenceRefs) },
  { code: 'RESOURCE_UNVETTED', retryable: true, run: onPlan(resourceUnvetted) },
  { code: 'PLAIN_LANGUAGE_FAIL', retryable: true, run: onPlan(planPlainLanguage) },
  { code: 'INFERENCE_FORBIDDEN', retryable: true, run: onPlan(planInferenceForbidden) },
  { code: 'HINT_LEAKS_ANSWER', retryable: true, run: onPlan(planAnswerLeak) },
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
