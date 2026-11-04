import type { GuideOutput } from '@guardian-book/shared'
import { describe, expect, it } from 'vitest'
import { runChecks } from '../runChecks.js'
import { GUIDE_RULES, answersDisagree, mathUnbalanced, normaliseAnswer, personalData, questionMissing, stepsOutOfRange, unbalancedMaths } from './guide.js'

const step = (n: number) => ({ goal: `Goal ${n}`, hint: `Hint ${n}: look at the signs.`, worked: `Step ${n}: $x^2 - 5x + 6 = (x - 2)(x - 3)$` })
const good = (overrides: Partial<GuideOutput> = {}): GuideOutput => ({
  question_md: 'Solve for $x$: $$x^2 - 5x + 6 = 0$$',
  subject: 'Mathematics',
  topic: 'Quadratic equations',
  steps: [step(1), step(2), step(3)],
  final_answer: '$x = 2$ or $x = 3$',
  confidence: 'high',
  ...overrides,
})

describe('QUESTION_MISSING', () => {
  it('passes a read-back and fails a blank or wordless one', () => {
    expect(questionMissing(good()).passed).toBe(true)
    expect(questionMissing(good({ question_md: '   ' })).passed).toBe(false)
    expect(questionMissing(good({ question_md: '$$ $$' })).passed).toBe(false)
  })
})

describe('STEPS_OUT_OF_RANGE', () => {
  it('wants two to eight steps', () => {
    expect(stepsOutOfRange(good()).passed).toBe(true)
    expect(stepsOutOfRange(good({ steps: [step(1)] })).passed).toBe(false)
    expect(stepsOutOfRange(good({ steps: [] })).detail).toContain('between 2 and 8')
    expect(stepsOutOfRange(good({ steps: Array.from({ length: 8 }, (_, i) => step(i + 1)) })).passed).toBe(true)
  })
})

describe('MATH_UNBALANCED', () => {
  it('accepts balanced $…$, $$…$$, braces and \\left … \\right', () => {
    expect(unbalancedMaths('Find $\\frac{1}{4}$ and $$\\left(\\frac{7}{8}\\right)$$')).toBeNull()
    expect(unbalancedMaths('It costs \\$5 and \\$10')).toBeNull()
    expect(unbalancedMaths('no maths')).toBeNull()
    expect(mathUnbalanced(good()).passed).toBe(true)
  })
  it('names the problem: an odd $, an open $$, an open brace, \\( delimiters', () => {
    expect(unbalancedMaths('Solve $x^2 = 4')).toContain('odd number of $')
    expect(unbalancedMaths('$$x^2 = 4')).toContain('$$ block')
    expect(unbalancedMaths('$\\frac{1}{4$')).toContain('never closed')
    expect(unbalancedMaths('$\\left( x \\right) \\left( y$')).toContain('do not pair')
    expect(unbalancedMaths('between \\(\\frac{1}{4}\\) and')).toContain('\\( \\)')
    const result = mathUnbalanced(good({ steps: [step(1), { ...step(2), worked: 'Now $x = 2' }] }))
    expect(result.passed).toBe(false)
    expect(result.detail).toContain('$.steps[1].worked')
  })
})

describe('PERSONAL_DATA', () => {
  it('fails an email address or a phone number anywhere in the output', () => {
    expect(personalData(good()).passed).toBe(true)
    expect(personalData(good({ steps: [step(1), { ...step(2), hint: 'Mail lerato@example.com for help' }] })).detail).toContain('email')
    expect(personalData(good({ question_md: 'Call 082 123 4567 89 for the answer' })).detail).toContain('phone')
  })
  it('does not mistake a long decimal for a phone number', () => {
    expect(personalData(good({ final_answer: '$0.333333333$' })).passed).toBe(true)
  })
})

describe('normaliseAnswer', () => {
  it('equates the same answer written differently', () => {
    expect(normaliseAnswer('$x = 2$ or $x = 3$')).toBe(normaliseAnswer('x=3, x = 2'))
    expect(normaliseAnswer('$\\frac{1}{2}$ and $\\frac{3}{4}$')).toBe(normaliseAnswer('3/4 and 1/2'))
    expect(normaliseAnswer('$x = -3$')).toBe(normaliseAnswer('x = −3.'))
    expect(normaliseAnswer('$2 \\times 3 = 6$')).toBe(normaliseAnswer('2*3=6'))
  })
  it('keeps different answers apart', () => {
    expect(normaliseAnswer('x = 2 or x = 3')).not.toBe(normaliseAnswer('x = 2 or x = 5'))
    expect(normaliseAnswer('1/2')).not.toBe(normaliseAnswer('1/3'))
  })
})

describe('ANSWERS_DISAGREE', () => {
  it('passes until the second read is in, then compares normalised answers', () => {
    expect(answersDisagree(good(), { otherFinalAnswer: null }).passed).toBe(true)
    expect(answersDisagree(good(), { otherFinalAnswer: 'x=3 or x=2' }).passed).toBe(true)
    const result = answersDisagree(good(), { otherFinalAnswer: '$x = 2$ or $x = 5$' })
    expect(result.passed).toBe(false)
    expect(result.detail).toContain('different final answers')
    expect(answersDisagree(good({ final_answer: '' }), { otherFinalAnswer: 'x = 2' }).passed).toBe(false)
  })
  it('is the one guide rule that is not re-asked', () => {
    expect(GUIDE_RULES.find((rule) => rule.code === 'ANSWERS_DISAGREE')?.retryable).toBe(false)
    expect(GUIDE_RULES.filter((rule) => rule.retryable).map((rule) => rule.code)).toEqual(['QUESTION_MISSING', 'STEPS_OUT_OF_RANGE', 'MATH_UNBALANCED', 'PERSONAL_DATA'])
  })
})

describe('runChecks(guide)', () => {
  it('accepts a sound guide and names every failed code at once', () => {
    expect(runChecks('guide', good(), { otherFinalAnswer: null }).passed).toBe(true)
    const result = runChecks('guide', good({ question_md: '', steps: [step(1)] }), { otherFinalAnswer: 'x = 9' })
    expect(result.passed).toBe(false)
    expect(result.failed.map((check) => check.code)).toEqual(['QUESTION_MISSING', 'STEPS_OUT_OF_RANGE', 'ANSWERS_DISAGREE'])
    expect(result.abstain).toBe(true)
  })
  it('fails SCHEMA_INVALID on an unknown key', () => {
    const result = runChecks('guide', { ...good(), marks: 4 }, { otherFinalAnswer: null })
    expect(result.checks[0]?.code).toBe('SCHEMA_INVALID')
    expect(result.passed).toBe(false)
  })
})
