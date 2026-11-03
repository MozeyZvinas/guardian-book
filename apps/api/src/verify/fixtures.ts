import type { WorkCheckOutput, WorkCheckStep } from '@guardian-book/shared'
import type { AssessContext } from './types.js'

/**
 * A small original item for the verifier tests (not DBE content, D20):
 * "Solve x² − 5x + 6 = 0" with a three-step guideline.
 */

export const QUADRATIC_WORKING = 'x^2 - 5x + 6 = 0\n(x - 2)(x - 3) = 0\nx = 2 or x = 3'

export const quadraticContext = (overrides: Partial<AssessContext> = {}): AssessContext => ({
  guideline: [
    { step_id: 'S1', kind: 'M', marks: 1, expected: '(x - 2)(x - 3) = 0' },
    { step_id: 'S2', kind: 'A', marks: 1, expected: 'x = 2' },
    { step_id: 'S3', kind: 'CA', marks: 1, expected: 'x = 3' },
  ],
  maxMarks: 3,
  answerKind: 'typed',
  answerText: QUADRATIC_WORKING,
  finalAnswer: 'x = 2 or x = 3',
  memoValues: [],
  ...overrides,
})

export const step = (overrides: Partial<WorkCheckStep> & { step_id: string }): WorkCheckStep => ({
  awarded: 1,
  available: 1,
  confidence: 'high',
  evidence: '(x - 2)(x - 3) = 0',
  feedback: 'Correct factorisation.',
  misconception_tag: null,
  hint: null,
  box: null,
  ...overrides,
})

export const goodOutput = (overrides: Partial<WorkCheckOutput> = {}): WorkCheckOutput => ({
  steps: [
    step({ step_id: 'S1', evidence: '(x - 2)(x - 3) = 0', feedback: 'Correct factorisation.' }),
    step({ step_id: 'S2', evidence: 'x = 2 or x = 3', feedback: 'First root found.' }),
    step({ step_id: 'S3', evidence: 'x = 2 or x = 3', feedback: 'Second root found.' }),
  ],
  total: 3,
  transcription: QUADRATIC_WORKING,
  transcription_confidence: 'high',
  uncertainty_codes: [],
  ...overrides,
})

/** The same item, but the learner lost the last step. */
export const partialOutput = (): WorkCheckOutput =>
  goodOutput({
    steps: [
      step({ step_id: 'S1' }),
      step({ step_id: 'S2', evidence: 'x = 2 or x = 5' }),
      step({
        step_id: 'S3',
        awarded: 0,
        confidence: 'high',
        evidence: 'x = 5 is written for the second root',
        feedback: 'The second root is not right.',
        misconception_tag: 'sign_error',
        hint: 'Check the sign when you move the constant across in the second bracket.',
      }),
    ],
    total: 2,
    transcription: 'x^2 - 5x + 6 = 0\n(x - 2)(x - 3) = 0\nx = 2 or x = 5',
  })
