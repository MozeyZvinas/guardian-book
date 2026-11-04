import type { ExtractOutput } from '@guardian-book/shared'
import { fail, pass, type CheckOutcome, type CheckRule, type ExtractContext } from '../types.js'
import { unbalancedMaths } from './guide.js'

/**
 * Rules for past-paper extraction (brief B17 phase A §2): one page of a question paper or
 * a memo, read into numbered entries. These are the checks a single page can carry; the
 * cross-document ones (the memo's steps sum to the paper's marks, every question has its
 * memo entry) run in `apps/api/src/corpus/merge.ts` once both documents are read, and a
 * question that still fails after three reads is kept as a draft with its reason.
 */

/** Every text the renderer or the work check will see, with its path. */
export function extractTexts(output: ExtractOutput): Array<{ path: string; text: string }> {
  const texts: Array<{ path: string; text: string }> = []
  output.entries.forEach((entry, index) => {
    texts.push({ path: `entries[${index}].text_md`, text: entry.text_md })
    if (entry.final_answer !== null) texts.push({ path: `entries[${index}].final_answer`, text: entry.final_answer })
    entry.steps.forEach((step, stepIndex) => {
      texts.push({ path: `entries[${index}].steps[${stepIndex}].criterion`, text: step.criterion })
      texts.push({ path: `entries[${index}].steps[${stepIndex}].working`, text: step.working })
      if (step.notes !== null) texts.push({ path: `entries[${index}].steps[${stepIndex}].notes`, text: step.notes })
    })
  })
  return texts
}

export function extractMathUnbalanced(output: ExtractOutput): CheckOutcome {
  const problems: string[] = []
  for (const { path, text } of extractTexts(output)) {
    const problem = unbalancedMaths(text)
    if (problem) problems.push(`${path}: ${problem}`)
  }
  if (problems.length === 0) return pass('every maths delimiter and brace is balanced')
  return fail(problems.join('; '))
}

/**
 * The entries make sense for the document: a question on a paper page has text and
 * marks (unless it runs on from an earlier page); a question on a memo page has at least
 * one step; no number appears twice on one page unless the second continues the first;
 * a targeted re-read returns only the numbers asked for.
 */
export function extractEntryInvalid(output: ExtractOutput, context: ExtractContext): CheckOutcome {
  const problems: string[] = []
  const seen = new Set<string>()
  output.entries.forEach((entry, index) => {
    const where = `entries[${index}] (${entry.number})`
    if (seen.has(entry.number) && !entry.continues) problems.push(`${where}: the number appears twice on this page; merge the two or mark the second as continuing`)
    seen.add(entry.number)
    if (context.onlyNumbers.length > 0 && !context.onlyNumbers.includes(entry.number)) {
      problems.push(`${where}: only ${context.onlyNumbers.join(', ')} was asked for`)
    }
    if (context.document === 'paper') {
      if (entry.kind === 'question' && !entry.continues && entry.text_md.trim().length === 0) problems.push(`${where}: a question needs its text`)
      // Marks print at the end of a part: a part cut off here, or carried on from an earlier page, may
      // show none on this page; the merge (`apps/api/src/corpus/merge.ts`) checks the joined part has them.
      if (entry.kind === 'question' && !entry.continues && !entry.continues_on_next_page && (entry.marks === null || entry.marks < 1)) {
        problems.push(`${where}: a question carries its bracketed marks; a numbered part with no marks is a stem`)
      }
      if (entry.steps.length > 0) problems.push(`${where}: steps belong on memo pages only`)
    } else {
      if (entry.kind === 'question' && !entry.continues && entry.steps.length === 0) problems.push(`${where}: a memo answer needs at least one step (one per tick)`)
      if (entry.kind === 'question' && !entry.continues_on_next_page && entry.final_answer === null) problems.push(`${where}: give the final answer of the first method`)
    }
  })
  if (problems.length === 0) return pass('every entry fits the page')
  return fail(problems.join('; '))
}

/** On a memo page, a complete answer's step marks add up to its bracketed marks. */
export function extractStepSum(output: ExtractOutput, context: ExtractContext): CheckOutcome {
  if (context.document !== 'memo') return pass('not a memo page')
  const problems: string[] = []
  for (const entry of output.entries) {
    if (entry.kind !== 'question' || entry.marks === null || entry.continues || entry.continues_on_next_page || entry.steps.length === 0) continue
    const sum = entry.steps.reduce((total, step) => total + step.marks, 0)
    if (sum !== entry.marks) problems.push(`${entry.number}: the steps carry ${sum} mark${sum === 1 ? '' : 's'} but the memo shows (${entry.marks}); one step per tick, ✓✓ is 2`)
  }
  if (problems.length === 0) return pass('every complete answer sums to its marks')
  return fail(problems.join('; '))
}

export const EXTRACT_RULES: CheckRule<ExtractOutput, ExtractContext>[] = [
  { code: 'MATH_UNBALANCED', retryable: true, run: (output) => extractMathUnbalanced(output) },
  { code: 'EXTRACT_ENTRY_INVALID', retryable: true, run: extractEntryInvalid },
  { code: 'EXTRACT_STEP_SUM', retryable: true, run: extractStepSum },
]
