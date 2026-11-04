import { describe, expect, it } from 'vitest'
import { runChecks } from '../runChecks.js'
import type { HintContext } from '../types.js'
import { STEP_HINT_RULES, hintGuardValues, stepHintInferenceForbidden, stepHintLeaksAnswer } from './hint.js'

/** The seed item's guideline (alg-12-factorise-trinomial): the hint must not give the factors or the roots. */
const context: HintContext = {
  guideline: [
    { step_id: 'S1', kind: 'M', marks: 1, expected: null },
    { step_id: 'S2', kind: 'A', marks: 1, expected: null },
    { step_id: 'S3', kind: 'CA', marks: 1, expected: null },
    { step_id: 'S4', kind: 'A', marks: 1, expected: null },
  ],
  finalAnswer: null,
  memoValues: ['Correct factors: $(x - 2)(x - 3) = 0$.', 'Both solutions stated: $x = 2$ and $x = 3$.'],
}

describe('hintGuardValues', () => {
  it('guards the memo values, their bracketed factors and their numbers', () => {
    const values = hintGuardValues(context)
    expect(values).toEqual(expect.arrayContaining(['(x-2)', '(x-3)', '-2', '-3']))
    expect(values.some((value) => value.startsWith('correct factors:'))).toBe(true)
    expect(values).not.toContain('0')
  })
  it('has nothing to guard when the memo is empty', () => {
    expect(hintGuardValues({ guideline: [], finalAnswer: null, memoValues: [] })).toEqual([])
  })
})

describe('HINT_LEAKS_ANSWER (step hint)', () => {
  it('passes a hint that points at the kind of error', () => {
    const result = stepHintLeaksAnswer({ hint: 'Look at the signs: two numbers that multiply to a positive and add to a negative are both negative.' }, context)
    expect(result.passed).toBe(true)
  })
  it('fails a hint that states the factors', () => {
    const result = stepHintLeaksAnswer({ hint: 'The factors are (x − 2)(x − 3), so set each to zero.' }, context)
    expect(result.passed).toBe(false)
    expect(result.detail).toContain('states a value')
  })
  it('fails a hint that states a root, even written loosely', () => {
    expect(stepHintLeaksAnswer({ hint: 'Try x = 2 and see if it works.' }, context).passed).toBe(false)
    expect(stepHintLeaksAnswer({ hint: 'One answer is 3.' }, context).passed).toBe(false)
  })
  it('allows structural numbers (step 2, 1 mark) and the question itself', () => {
    expect(stepHintLeaksAnswer({ hint: 'In step 2 you need two brackets; check the sign in each one (1 mark).' }, context).passed).toBe(true)
  })
  it('fails a hint that repeats most of the memo working', () => {
    expect(stepHintLeaksAnswer({ hint: 'Both solutions stated: x and x.' }, context).passed).toBe(false)
  })
  it('passes anything when there is no memo to guard', () => {
    expect(stepHintLeaksAnswer({ hint: 'x = 2' }, { guideline: [], finalAnswer: null, memoValues: [] }).passed).toBe(true)
  })
})

describe('INFERENCE_FORBIDDEN (step hint)', () => {
  it('speaks about the work, not the person', () => {
    expect(stepHintInferenceForbidden({ hint: 'Check the sign of the second term.' }).passed).toBe(true)
    const result = stepHintInferenceForbidden({ hint: 'You seem anxious; just check the sign.' })
    expect(result.passed).toBe(false)
    expect(result.detail).toContain('anxious')
  })
})

describe('runChecks step_hint', () => {
  it('runs SCHEMA_INVALID (length), the leak rule and the inference rule', () => {
    const good = runChecks('step_hint', { hint: 'Check the sign of each bracket.' }, context)
    expect(good.passed).toBe(true)
    expect(good.checks.map((check) => check.code)).toEqual(['SCHEMA_INVALID', 'HINT_LEAKS_ANSWER', 'INFERENCE_FORBIDDEN'])
    const long = runChecks('step_hint', { hint: 'x'.repeat(301) }, context)
    expect(long.passed).toBe(false)
    expect(long.failed[0]?.code).toBe('SCHEMA_INVALID')
    expect(long.abstain).toBe(false)
    const leak = runChecks('step_hint', { hint: 'It is (x − 2)(x − 3).' }, context)
    expect(leak.failed.map((check) => check.code)).toEqual(['HINT_LEAKS_ANSWER'])
    expect(leak.abstain).toBe(false)
  })
  it('every rule is retryable: a bad hint is re-asked, never silently shown', () => {
    expect(STEP_HINT_RULES.every((rule) => rule.retryable)).toBe(true)
  })
  it('transcribe has no rules and accepts the transcript shape', () => {
    expect(runChecks('transcribe', { transcript: 'why is it minus six' }, {}).passed).toBe(true)
    expect(runChecks('transcribe', { text: 'wrong shape' }, {}).passed).toBe(false)
  })
})
