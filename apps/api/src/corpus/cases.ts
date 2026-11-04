import type { PaperRef } from '@guardian-book/shared'
import type { EvalCase } from '../evals/cases.js'
import type { GuideCase } from '../evals/guideCases.js'
import { questionSlug, type BuiltQuestion } from './merge.js'

/**
 * Evaluation cases for the held-out session (brief B17 phase C): the memo's own model
 * answer, marked by the work check (expected: full marks); a sample of those answers with
 * the final step perturbed (expected: that step lost); and the question alone for B15's
 * guide (expected: the memo's final answer). Written under `<CORPUS_DIR>/evals/`, outside
 * the repo, in the formats `pnpm eval:dev` reads.
 */

const stepId = (index: number): string => `S${index + 1}`

function guideline(question: BuiltQuestion): EvalCase['guideline'] {
  return question.steps.map((step, index) => ({
    step_id: stepId(index),
    step_no: index + 1,
    kind: step.step_type,
    criterion: step.criterion,
    marks: step.marks,
    notes: step.notes,
    expected: step.working,
  }))
}

/** The memo's working, line by line, as a typed answer. */
export function memoAnswer(question: BuiltQuestion): string {
  return question.steps.map((step) => step.working.trim()).filter((line) => line.length > 0).join('\n')
}

export function modelAnswerCase(ref: PaperRef, question: BuiltQuestion): EvalCase | null {
  if (question.reasons.length > 0 || question.marks === null || question.steps.length === 0) return null
  const answer = memoAnswer(question)
  if (answer.length === 0) return null
  return {
    id: `${questionSlug(ref, question.number)}-memo`,
    suite: 'work_check',
    category: 'memo_model_answer',
    legibility: null,
    item: { slug: questionSlug(ref, question.number), prompt_md: question.prompt_md, max_marks: question.marks },
    guideline: guideline(question),
    final_answer: question.final_answer,
    answer: { kind: 'typed', text: answer },
    mode: 'assisted',
    expected: {
      total: question.marks,
      awarded: Object.fromEntries(question.steps.map((step, index) => [stepId(index), step.marks])),
      first_lost_step: null,
    },
  }
}

const NUMBER = /-?\d+(?:[.,]\d+)?/g

/**
 * One step perturbed: the last number in the final step's working is changed (its last
 * digit moved by one), so the working is right up to the final value and wrong there.
 * Null when the final step has no number to change.
 */
export function perturbFinalStep(question: BuiltQuestion): { answer: string; stepIndex: number } | null {
  const index = question.steps.length - 1
  const last = question.steps[index]
  if (!last) return null
  const matches = [...last.working.matchAll(NUMBER)]
  const target = matches.at(-1)
  if (!target || target.index === undefined) return null
  const original = target[0]
  const digits = original.replace(/[^0-9]/g, '')
  if (digits.length === 0) return null
  const lastDigit = Number(original.charAt(original.length - 1))
  const changed = `${original.slice(0, -1)}${lastDigit === 9 ? 8 : lastDigit + 1}`
  const working = `${last.working.slice(0, target.index)}${changed}${last.working.slice(target.index + original.length)}`
  const lines = question.steps.map((step, stepIndex) => (stepIndex === index ? working : step.working).trim()).filter((line) => line.length > 0)
  return { answer: lines.join('\n'), stepIndex: index }
}

export function perturbedCase(ref: PaperRef, question: BuiltQuestion): EvalCase | null {
  if (question.reasons.length > 0 || question.marks === null || question.steps.length < 2) return null
  const perturbed = perturbFinalStep(question)
  if (!perturbed) return null
  const lost = question.steps[perturbed.stepIndex]
  if (!lost) return null
  const awarded = Object.fromEntries(question.steps.map((step, index) => [stepId(index), index === perturbed.stepIndex ? 0 : step.marks]))
  return {
    id: `${questionSlug(ref, question.number)}-perturbed`,
    suite: 'work_check',
    category: 'memo_perturbed_final_step',
    legibility: null,
    item: { slug: questionSlug(ref, question.number), prompt_md: question.prompt_md, max_marks: question.marks },
    guideline: guideline(question),
    final_answer: question.final_answer,
    answer: { kind: 'typed', text: perturbed.answer },
    mode: 'assisted',
    expected: { total: question.marks - lost.marks, awarded, first_lost_step: stepId(perturbed.stepIndex) },
  }
}

export function guideCase(ref: PaperRef, question: BuiltQuestion, diagramPath: string | null): GuideCase | null {
  if (question.reasons.length > 0 || question.final_answer === null) return null
  return {
    id: `${questionSlug(ref, question.number)}-guide`,
    item: { slug: questionSlug(ref, question.number), prompt_md: question.prompt_md },
    diagram_path: diagramPath,
    expected_final_answer: question.final_answer,
  }
}
