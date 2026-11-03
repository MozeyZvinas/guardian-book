import type { WorkCheckOutput, WorkCheckStep } from '@guardian-book/shared'
import { containsValue, guardedNumbers, normaliseMaths, stripStructuralNumbers, tokenOverlap } from '../text.js'
import { fail, pass, type AssessContext, type CheckOutcome, type CheckRule } from '../types.js'
import { inferenceForbidden, stringsIn } from './common.js'

/** Rules for the work check (P0-04). Each is a pure function with its own unit test. */

export const EVIDENCE_MIN_CHARS = 8
export const HINT_MEMO_OVERLAP_LIMIT = 0.6
export const BOX_GRID_MAX = 1000

const idsOf = (context: AssessContext): string[] => context.guideline.map((step) => step.step_id)

export function stepUnknown(output: WorkCheckOutput, context: AssessContext): CheckOutcome {
  const allowed = new Set(idsOf(context))
  const unknown = output.steps.map((step) => step.step_id).filter((id) => !allowed.has(id))
  if (unknown.length === 0) return pass('every step_id is in the guideline')
  return fail(`step_id ${unknown.map((id) => `"${id}"`).join(', ')} not in the guideline; use only: ${idsOf(context).join(', ')}`)
}

export function stepMissing(output: WorkCheckOutput, context: AssessContext): CheckOutcome {
  const present = new Set(output.steps.map((step) => step.step_id))
  const missing = idsOf(context).filter((id) => !present.has(id))
  if (missing.length === 0) return pass('every guideline step has an entry')
  return fail(`no entry for step ${missing.join(', ')}; return one entry per guideline step, in order`)
}

export function stepDuplicate(output: WorkCheckOutput): CheckOutcome {
  const seen = new Set<string>()
  const duplicates = new Set<string>()
  for (const step of output.steps) {
    if (seen.has(step.step_id)) duplicates.add(step.step_id)
    seen.add(step.step_id)
  }
  if (duplicates.size === 0) return pass('no step appears twice')
  return fail(`step ${[...duplicates].join(', ')} appears more than once; one entry per step`)
}

export function marksOverMax(output: WorkCheckOutput, context: AssessContext): CheckOutcome {
  const marksFor = new Map(context.guideline.map((step) => [step.step_id, step.marks]))
  const problems: string[] = []
  for (const step of output.steps) {
    const max = marksFor.get(step.step_id)
    if (max === undefined) continue // STEP_UNKNOWN reports it
    if (step.awarded > max) problems.push(`${step.step_id}: awarded ${step.awarded} of a possible ${max}`)
    if (step.available !== max) problems.push(`${step.step_id}: available must be ${max}, not ${step.available}`)
  }
  if (problems.length === 0) return pass('every award is within its step maximum')
  return fail(problems.join('; '))
}

export function totalMismatch(output: WorkCheckOutput): CheckOutcome {
  const sum = output.steps.reduce((acc, step) => acc + step.awarded, 0)
  if (output.total === sum) return pass(`total ${sum} equals the sum of awarded`)
  return fail(`total is ${output.total} but the awarded marks sum to ${sum}`)
}

/** The text the evidence must be quoted from: the typed answer, else the model's transcription. */
export function workingText(output: WorkCheckOutput, context: AssessContext): string {
  return context.answerKind === 'typed' && context.answerText !== null ? context.answerText : output.transcription
}

/**
 * True when some window of `EVIDENCE_MIN_CHARS` characters of the evidence occurs in the
 * working. Both are compared in `normaliseMaths` form, so operator spacing differences
 * ("(x-2)" vs "(x - 2)") do not matter, while words keep their spaces and count as
 * characters. A working shorter than the window lowers the bar to its whole length.
 */
function quotesFrom(evidence: string, working: string): boolean {
  const need = Math.min(EVIDENCE_MIN_CHARS, working.length)
  if (need === 0) return false
  if (evidence.length < need) return false
  for (let i = 0; i + need <= evidence.length; i += 1) {
    if (working.includes(evidence.slice(i, i + need))) return true
  }
  return false
}

export function evidenceMissing(output: WorkCheckOutput, context: AssessContext): CheckOutcome {
  const working = normaliseMaths(workingText(output, context))
  const problems: string[] = []
  for (const step of output.steps) {
    if (step.awarded <= 0) continue
    if (!quotesFrom(normaliseMaths(step.evidence), working)) {
      problems.push(`${step.step_id}: evidence must quote at least ${EVIDENCE_MIN_CHARS} characters verbatim from the learner's working`)
    }
  }
  if (problems.length === 0) return pass('every awarded step quotes the working')
  return fail(problems.join('; '))
}

/**
 * CA_INCONSISTENT (spec 03 §6 rule 2): a method or consistent-accuracy step applied
 * correctly to an earlier wrong value still earns its marks. The deterministic signal of
 * the rule being broken is a step given less than full marks while its own feedback or
 * evidence says the method was right or the error was carried from earlier.
 */
const CARRIED_ERROR = [
  /\b(?:method|working|approach|procedure|steps?)\s+(?:is|was|are|were)\s+(?:correct|right|sound|fine)\b/i,
  /\b(?:correct|right)\s+(?:method|approach|procedure|working)\b/i,
  /\bcorrectly\s+(?:applied|carried|substituted|followed|used|solved)\b/i,
  /\bcarried\s+(?:forward|over|through|down)\b/i,
  /\bfollow(?:s|ed)?[\s-]+through\b/i,
  /\bconsistent\s+with\s+(?:the|their|an?)\s+(?:earlier|previous|own)\b/i,
  /\b(?:earlier|previous)\s+(?:error|mistake|slip)\b/i,
  /\bbecause\s+of\s+(?:the|an?)\s+(?:earlier|previous)\b/i,
]

export function caInconsistent(output: WorkCheckOutput, context: AssessContext): CheckOutcome {
  const kindOf = new Map(context.guideline.map((step) => [step.step_id, step.kind]))
  const problems: string[] = []
  for (const step of output.steps) {
    const kind = kindOf.get(step.step_id)
    if (kind !== 'M' && kind !== 'CA') continue
    if (step.awarded >= step.available) continue
    const text = `${step.feedback} ${step.evidence}`
    if (CARRIED_ERROR.some((pattern) => pattern.test(text))) {
      problems.push(`${step.step_id} (${kind}): the feedback says the method was right or the error was carried from an earlier step, yet marks were withheld; a correct method on an earlier wrong value earns its marks`)
    }
  }
  if (problems.length === 0) return pass('method and consistent-accuracy awards agree with their feedback')
  return fail(problems.join('; '))
}

/** The values a hint must never contain, normalised and de-duplicated. */
export function guardedValues(context: AssessContext): string[] {
  const raw: string[] = []
  if (context.finalAnswer) raw.push(context.finalAnswer, ...guardedNumbers(context.finalAnswer))
  for (const value of context.memoValues) raw.push(value, ...guardedNumbers(value))
  for (const step of context.guideline) if (step.expected) raw.push(step.expected)
  return [...new Set(raw.map(normaliseMaths).filter((value) => value.length > 0))]
}

export function hintLeaksAnswer(output: WorkCheckOutput, context: AssessContext): CheckOutcome {
  const values = guardedValues(context)
  const memoTexts = context.guideline.flatMap((step) => (step.expected ? [{ id: step.step_id, text: normaliseMaths(step.expected) }] : []))
  const problems: string[] = []
  for (const step of output.steps) {
    if (step.hint === null) continue
    const hint = stripStructuralNumbers(normaliseMaths(step.hint))
    if (values.some((value) => containsValue(hint, value))) {
      problems.push(`${step.step_id}: the hint states a value from the answer or the memo`)
      continue
    }
    const overlapping = memoTexts.find((memo) => tokenOverlap(memo.text, hint) >= HINT_MEMO_OVERLAP_LIMIT)
    if (overlapping) problems.push(`${step.step_id}: the hint repeats most of the memo working for step ${overlapping.id}`)
  }
  if (problems.length === 0) return pass('no hint reveals the answer or the memo')
  return fail(`${problems.join('; ')}; a hint points at the kind of error or what to check next, never the value`)
}

export function confidenceLow(output: WorkCheckOutput, context: AssessContext): CheckOutcome {
  const low = output.steps.filter((step) => step.confidence === 'low').map((step) => step.step_id)
  const problems: string[] = []
  if (low.length > 0) problems.push(`low confidence on step ${low.join(', ')}`)
  if (context.answerKind === 'photo' && output.transcription_confidence === 'low') problems.push('low transcription confidence')
  if (problems.length === 0) return pass('no step is low confidence')
  return fail(`${problems.join('; ')}: the teacher decides`)
}

export function workInferenceForbidden(output: WorkCheckOutput): CheckOutcome {
  const texts = output.steps.flatMap((step, index) => [
    ...stringsIn(step.feedback, `steps[${index}].feedback`),
    ...stringsIn(step.hint, `steps[${index}].hint`),
  ])
  return inferenceForbidden(texts)
}

/** Clamps every box to the 0–1000 grid (spec 03 §6 rule 7); pure, returns a copy. */
export function clampBoxes(output: WorkCheckOutput): WorkCheckOutput {
  const clamp = (n: number): number => Math.min(BOX_GRID_MAX, Math.max(0, Math.round(n)))
  const steps: WorkCheckStep[] = output.steps.map((step) => (step.box ? { ...step, box: step.box.map(clamp) } : step))
  return { ...output, steps }
}

export const WORK_CHECK_RULES: CheckRule<WorkCheckOutput, AssessContext>[] = [
  { code: 'STEP_UNKNOWN', retryable: true, run: stepUnknown },
  { code: 'STEP_MISSING', retryable: true, run: stepMissing },
  { code: 'STEP_DUPLICATE', retryable: true, run: stepDuplicate },
  { code: 'MARKS_OVER_MAX', retryable: true, run: marksOverMax },
  { code: 'TOTAL_MISMATCH', retryable: true, run: totalMismatch },
  { code: 'EVIDENCE_MISSING', retryable: true, run: evidenceMissing },
  { code: 'CA_INCONSISTENT', retryable: true, run: caInconsistent },
  { code: 'HINT_LEAKS_ANSWER', retryable: true, run: hintLeaksAnswer },
  { code: 'INFERENCE_FORBIDDEN', retryable: true, run: workInferenceForbidden },
  { code: 'CONFIDENCE_LOW', retryable: false, run: confidenceLow },
]
