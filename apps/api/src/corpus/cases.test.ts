import type { ExtractStep, PaperRef } from '@guardian-book/shared'
import { describe, expect, it } from 'vitest'
import { evalCaseSchema } from '../evals/cases.js'
import { guideCaseSchema } from '../evals/guideCases.js'
import { guideCase, memoAnswer, modelAnswerCase, perturbFinalStep, perturbedCase } from './cases.js'
import type { BuiltQuestion } from './merge.js'

/** Synthetic questions only (never DBE text). */
const ref: PaperRef = { subject: 'Mathematics', grade: 12, year: 2026, session: 'may_june', paper: 1 }
const step = (marks: number, working: string, step_type: ExtractStep['step_type'] = 'A'): ExtractStep => ({ criterion: `Correct: ${working}`, working, step_type, marks, skill_tag: 'algebra.factorising', notes: null })
const question = (over: Partial<BuiltQuestion> = {}): BuiltQuestion => ({
  number: '1.1.1',
  prompt_md: 'Solve for $x$: $x^2 - 49 = 0$',
  marks: 3,
  topic: 'Quadratic equations',
  skill_tag: 'algebra.factorising',
  diagram: null,
  diagramOwner: null,
  steps: [step(1, '$(x-7)(x+7)=0$', 'M'), step(2, '$x = 7$ or $x = -7$')],
  final_answer: '$x = \\pm 7$',
  memoMarks: 3,
  reasons: [],
  details: [],
  memoPages: [4],
  paperPages: [2],
  ...over,
})

describe('held-out evaluation cases', () => {
  it('turns the memo’s own working into a full-marks work-check case', () => {
    const memoCase = modelAnswerCase(ref, question())
    expect(evalCaseSchema.parse(memoCase)).toEqual(memoCase)
    expect(memoCase?.id).toBe('nsc-maths-p1-2026-jun-q1-1-1-memo')
    expect(memoCase?.answer).toEqual({ kind: 'typed', text: '$(x-7)(x+7)=0$\n$x = 7$ or $x = -7$' })
    expect(memoCase?.expected).toEqual({ total: 3, awarded: { S1: 1, S2: 2 }, first_lost_step: null })
    expect(memoAnswer(question({ steps: [step(1, '  '), step(2, '$x=1$')] }))).toBe('$x=1$')
  })

  it('perturbs the last number of the final step and expects that step lost', () => {
    expect(perturbFinalStep(question())).toEqual({ answer: '$(x-7)(x+7)=0$\n$x = 7$ or $x = -8$', stepIndex: 1 })
    expect(perturbFinalStep(question({ steps: [step(1, 'a'), step(1, '$x = 2.59$')] }))?.answer).toBe('a\n$x = 2.58$')
    expect(perturbFinalStep(question({ steps: [step(1, 'a'), step(1, 'no digits here')] }))).toBeNull()
    const perturbed = perturbedCase(ref, question())
    expect(evalCaseSchema.parse(perturbed)).toEqual(perturbed)
    expect(perturbed?.expected).toEqual({ total: 1, awarded: { S1: 1, S2: 0 }, first_lost_step: 'S2' })
    expect(perturbed?.category).toBe('memo_perturbed_final_step')
  })

  it('writes nothing for a draft, a one-step answer or a question without a final answer', () => {
    expect(modelAnswerCase(ref, question({ reasons: ['marks_mismatch'] }))).toBeNull()
    expect(perturbedCase(ref, question({ steps: [step(3, '$x = 3$')] }))).toBeNull()
    expect(guideCase(ref, question({ final_answer: null }), null)).toBeNull()
  })

  it('writes a guide case with the memo’s final answer as truth', () => {
    const guide = guideCase(ref, question(), '../../diagrams/library/dbe/q1.png')
    expect(guideCaseSchema.parse(guide)).toEqual(guide)
    expect(guide).toMatchObject({ id: 'nsc-maths-p1-2026-jun-q1-1-1-guide', expected_final_answer: '$x = \\pm 7$', diagram_path: '../../diagrams/library/dbe/q1.png' })
  })
})
