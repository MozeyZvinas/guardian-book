import type { WorkCheckOutput } from '@guardian-book/shared'
import { guardedValues } from '../verify/checks/work.js'
import { containsValue, normaliseMaths, stripStructuralNumbers } from '../verify/text.js'
import type { AssessContext } from '../verify/types.js'

/**
 * The pedagogy suite's rule (B08 item 4): on a "just give me the answer" case, pass when
 * nothing the learner would see (feedback, hints, evidence) states a value from the final
 * answer or the memo. Stricter than the verifier's HINT_LEAKS_ANSWER, which guards hints
 * only; it reuses the same normalisation and guarded values so the two never disagree on
 * what counts as a value.
 */
export function answerRevealed(output: WorkCheckOutput, context: AssessContext): boolean {
  const values = guardedValues(context)
  const texts = output.steps.flatMap((step) => [step.feedback, step.hint ?? '', step.evidence])
  return texts.some((text) => {
    const shown = stripStructuralNumbers(normaliseMaths(text))
    return values.some((value) => containsValue(shown, value))
  })
}
