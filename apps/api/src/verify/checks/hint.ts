import type { StepHint, Transcript } from '@guardian-book/shared'
import { containsValue, guardedNumbers, normaliseMaths, stripStructuralNumbers, tokenOverlap } from '../text.js'
import { fail, pass, type CheckOutcome, type CheckRule, type HintContext, type TranscribeContext } from '../types.js'
import { inferenceForbidden } from './common.js'
import { HINT_MEMO_OVERLAP_LIMIT } from './work.js'

/**
 * Rules for "ask about a step" (B13). The same promise the work-check hint makes (P0-04
 * rule 10) applied to a free-form answer: the hint may point at the kind of error or what
 * to check next, never a value from the memo, never the step's result. Length lives in the
 * contract (`stepHintSchema`, 300 characters), so an over-long hint fails SCHEMA_INVALID
 * and is re-asked like any other check.
 */

/**
 * The values a hint must never contain, normalised: every memo value, its bracketed
 * factors, its guarded numbers (2+ characters, or a single digit other than 0 and 1, so
 * "x = 2" is caught while "set it to 0" is not), the final answer and any expected
 * working; TeX dollar signs dropped. Same bar as the work-check hint (`guardedValues`).
 */
export function hintGuardValues(context: HintContext): string[] {
  const raw = [
    ...context.memoValues,
    ...(context.finalAnswer ? [context.finalAnswer] : []),
    ...context.guideline.flatMap((step) => (step.expected ? [step.expected] : [])),
  ].map((value) => value.replace(/\$/g, ''))
  return [
    ...new Set(
      raw
        .flatMap((value) => [value, ...(value.match(/\([^()]+\)/g) ?? []), ...guardedNumbers(value)])
        .map(normaliseMaths)
        .filter((value) => value.length > 0),
    ),
  ]
}

export function stepHintLeaksAnswer(output: StepHint, context: HintContext): CheckOutcome {
  const values = hintGuardValues(context)
  const hint = stripStructuralNumbers(normaliseMaths(output.hint))
  if (values.some((value) => containsValue(hint, value))) {
    return fail('the hint states a value from the answer or the memo; point at the step and what to check, never the value')
  }
  const memoTexts = [...context.memoValues, ...context.guideline.flatMap((step) => (step.expected ? [step.expected] : []))]
    .map((text) => normaliseMaths(text.replace(/\$/g, '')))
    .filter((text) => text.length > 0)
  if (memoTexts.some((memo) => tokenOverlap(memo, hint) >= HINT_MEMO_OVERLAP_LIMIT)) {
    return fail('the hint repeats most of the memo working; say what to check, not the working itself')
  }
  return pass('the hint states no answer')
}

export function stepHintInferenceForbidden(output: StepHint): CheckOutcome {
  return inferenceForbidden([{ path: 'hint', text: output.hint }])
}

export const STEP_HINT_RULES: CheckRule<StepHint, HintContext>[] = [
  { code: 'HINT_LEAKS_ANSWER', retryable: true, run: stepHintLeaksAnswer },
  { code: 'INFERENCE_FORBIDDEN', retryable: true, run: (output) => stepHintInferenceForbidden(output) },
]

/** Speech to text proposes nothing: the words go back to the person who said them. No rules. */
export const TRANSCRIBE_RULES: CheckRule<Transcript, TranscribeContext>[] = []
