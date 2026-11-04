import { GUIDE_MAX_STEPS, GUIDE_MIN_STEPS, type GuideOutput } from '@guardian-book/shared'
import { findUnsafeText } from '../../gateway/promptSafety.js'
import { normaliseMaths } from '../text.js'
import { fail, pass, type CheckOutcome, type CheckRule, type GuideContext } from '../types.js'
import { stringsIn } from './common.js'

/**
 * Rules for "help me with a question" (brief B15 §3). The model read the learner's
 * question and wrote a guide; before any of it reaches the screen it must read the
 * question back, keep to 2–8 steps, write maths the renderer can lay out, echo nothing
 * personal, and (once the second, independent read is in) agree with it on the final
 * answer. Disagreement is not re-asked: the service shows the read-back and the first
 * hint only. Everything else is a model mistake worth one more go.
 */

/** Every string in the output with its path, for the text rules. */
export function guideTexts(output: GuideOutput): Array<{ path: string; text: string }> {
  return stringsIn(output)
}

export function questionMissing(output: GuideOutput): CheckOutcome {
  const text = output.question_md.trim()
  if (text.length === 0) return fail('question_md is empty; read the question back as asked, in Markdown with $…$ maths')
  if (!/[a-z0-9]/i.test(text)) return fail('question_md holds no words or numbers; read the question back as asked')
  return pass('the question is read back')
}

export function stepsOutOfRange(output: GuideOutput): CheckOutcome {
  const n = output.steps.length
  if (n < GUIDE_MIN_STEPS || n > GUIDE_MAX_STEPS) {
    return fail(`${n} step${n === 1 ? '' : 's'}; write between ${GUIDE_MIN_STEPS} and ${GUIDE_MAX_STEPS}, each with a goal, a hint and the worked step`)
  }
  return pass(`${n} steps`)
}

/**
 * Why a piece of text cannot be laid out: an odd number of `$`, a `$$` block left open,
 * braces that do not close, `\left` without `\right`, or `\( … \)` delimiters (the
 * renderer speaks `$…$` only). Null when it is fine. Escaped `\$` is money, not maths.
 */
export function unbalancedMaths(text: string): string | null {
  const bare = text.replace(/\\\$/g, '')
  if (/\\\(|\\\)|\\\[|\\\]/.test(bare)) return 'uses \\( \\) or \\[ \\] delimiters; write maths between $…$ or $$…$$'
  const doubles = (bare.match(/\$\$/g) ?? []).length
  if (doubles % 2 !== 0) return 'a $$ block is not closed'
  const singles = (bare.replace(/\$\$/g, '').match(/\$/g) ?? []).length
  if (singles % 2 !== 0) return 'an odd number of $ signs: every $ needs a closing $'
  let depth = 0
  for (const char of bare.replace(/\\[{}]/g, '')) {
    if (char === '{') depth += 1
    if (char === '}') depth -= 1
    if (depth < 0) return 'a } closes before any { opened'
  }
  if (depth !== 0) return `${depth} { ${depth === 1 ? 'is' : 'are'} never closed`
  const lefts = (bare.match(/\\left\b/g) ?? []).length
  const rights = (bare.match(/\\right\b/g) ?? []).length
  if (lefts !== rights) return `\\left (${lefts}) and \\right (${rights}) do not pair up`
  return null
}

export function mathUnbalanced(output: GuideOutput): CheckOutcome {
  const problems: string[] = []
  for (const { path, text } of guideTexts(output)) {
    const problem = unbalancedMaths(text)
    if (problem) problems.push(`${path}: ${problem}`)
  }
  if (problems.length === 0) return pass('every maths delimiter and brace is balanced')
  return fail(problems.join('; '))
}

export function personalData(output: GuideOutput): CheckOutcome {
  const hits: string[] = []
  for (const { path, text } of guideTexts(output)) {
    const reason = findUnsafeText(text)
    if (reason) hits.push(`${path} contains ${reason === 'email' ? 'an email address' : 'a phone number'}`)
  }
  if (hits.length === 0) return pass('no email address or phone number')
  return fail(`${hits.join('; ')}; leave contact details out and answer the question only`)
}

/**
 * A final answer reduced to what two reads must share: TeX dollars and spacing dropped,
 * `\frac{a}{b}` → `a/b`, signs unified, "x = 2 or x = 3" and "x=3, x=2" the same set.
 * Deliberately simple and explainable: a false "disagree" costs a hint, never a wrong
 * answer shown.
 */
export function normaliseAnswer(text: string): string {
  const flat = text
    .replace(/\$/g, '')
    .replace(/\\(?:left|right)\b/g, '')
    .replace(/\\(?:d|t)?frac\s*\{([^{}]*)\}\s*\{([^{}]*)\}/g, '($1)/($2)')
    .replace(/\\times|\\cdot/g, '*')
    .replace(/\\div/g, '/')
    .replace(/\\pm/g, '±')
    .replace(/\\sqrt\s*\{([^{}]*)\}/g, 'sqrt($1)')
    .replace(/\\(?:,|;|!|quad|qquad)/g, ' ')
    .replace(/\\text\s*\{([^{}]*)\}/g, ' $1 ')
    .replace(/\\([a-zA-Z]+)/g, '$1')
    .replace(/[{}]/g, '')
    .replace(/\(([a-z0-9.]+)\)\/\(([a-z0-9.]+)\)/gi, '$1/$2')
    .replace(/[.\s]+$/g, '')
  const parts = normaliseMaths(flat)
    .split(/\s*(?:,|;|\bor\b|\band\b)\s*/)
    .map((part) => part.replace(/\s+/g, ''))
    .filter((part) => part.length > 0)
  return [...new Set(parts)].sort().join(',')
}

export function answersDisagree(output: GuideOutput, context: GuideContext): CheckOutcome {
  if (context.otherFinalAnswer === null) return pass('one read so far; nothing to compare yet')
  const mine = normaliseAnswer(output.final_answer)
  const theirs = normaliseAnswer(context.otherFinalAnswer)
  if (mine.length === 0 || theirs.length === 0) return fail('a final answer is empty; the two reads cannot be compared')
  if (mine === theirs) return pass('both reads reach the same final answer')
  return fail('the two independent reads reach different final answers; only the read-back and the first hint may be shown')
}

export const GUIDE_RULES: CheckRule<GuideOutput, GuideContext>[] = [
  { code: 'QUESTION_MISSING', retryable: true, run: (output) => questionMissing(output) },
  { code: 'STEPS_OUT_OF_RANGE', retryable: true, run: (output) => stepsOutOfRange(output) },
  { code: 'MATH_UNBALANCED', retryable: true, run: (output) => mathUnbalanced(output) },
  { code: 'PERSONAL_DATA', retryable: true, run: (output) => personalData(output) },
  // Not re-asked: a model nudged towards the other answer would agree for the wrong reason.
  { code: 'ANSWERS_DISAGREE', retryable: false, run: answersDisagree },
]
