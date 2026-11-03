import { describe, expect, it } from 'vitest'
import { QUADRATIC_WORKING, goodOutput, partialOutput, quadraticContext, step } from '../fixtures.js'
import {
  WORK_CHECK_RULES,
  caInconsistent,
  clampBoxes,
  confidenceLow,
  evidenceMissing,
  guardedValues,
  hintLeaksAnswer,
  marksOverMax,
  stepDuplicate,
  stepMissing,
  stepUnknown,
  totalMismatch,
  workInferenceForbidden,
} from './work.js'

const context = quadraticContext()
const partialContext = quadraticContext({ answerText: 'x^2 - 5x + 6 = 0\n(x - 2)(x - 3) = 0\nx = 2 or x = 5' })

describe('STEP_UNKNOWN', () => {
  it('passes when every step_id is in the guideline', () => {
    expect(stepUnknown(goodOutput(), context).passed).toBe(true)
  })
  it('fails on a step not in the guideline and lists the allowed IDs', () => {
    const out = goodOutput({ steps: [...goodOutput().steps, step({ step_id: 'S9' })] })
    const result = stepUnknown(out, context)
    expect(result.passed).toBe(false)
    expect(result.detail).toContain('"S9"')
    expect(result.detail).toContain('S1, S2, S3')
  })
})

describe('STEP_MISSING', () => {
  it('fails when a guideline step has no entry', () => {
    const out = goodOutput({ steps: goodOutput().steps.slice(0, 2), total: 2 })
    const result = stepMissing(out, context)
    expect(result.passed).toBe(false)
    expect(result.detail).toContain('S3')
  })
  it('passes when all are present', () => {
    expect(stepMissing(goodOutput(), context).passed).toBe(true)
  })
})

describe('STEP_DUPLICATE', () => {
  it('fails when a step appears twice', () => {
    const out = goodOutput({ steps: [...goodOutput().steps, step({ step_id: 'S1' })] })
    const result = stepDuplicate(out)
    expect(result.passed).toBe(false)
    expect(result.detail).toContain('S1')
  })
  it('passes otherwise', () => {
    expect(stepDuplicate(goodOutput()).passed).toBe(true)
  })
})

describe('MARKS_OVER_MAX', () => {
  it('fails when awarded exceeds the step maximum', () => {
    const out = goodOutput({ steps: [step({ step_id: 'S1', awarded: 2 }), ...goodOutput().steps.slice(1)] })
    const result = marksOverMax(out, context)
    expect(result.passed).toBe(false)
    expect(result.detail).toContain('S1: awarded 2 of a possible 1')
  })
  it('fails when available does not match the guideline', () => {
    const out = goodOutput({ steps: [step({ step_id: 'S1', available: 2 }), ...goodOutput().steps.slice(1)] })
    expect(marksOverMax(out, context).passed).toBe(false)
  })
  it('ignores unknown steps (another rule reports them) and passes a good output', () => {
    expect(marksOverMax(goodOutput(), context).passed).toBe(true)
    const out = goodOutput({ steps: [...goodOutput().steps, step({ step_id: 'S9', awarded: 99 })] })
    expect(marksOverMax(out, context).passed).toBe(true)
  })
})

describe('TOTAL_MISMATCH', () => {
  it('fails when total is not the sum of awarded', () => {
    const result = totalMismatch(goodOutput({ total: 2 }))
    expect(result.passed).toBe(false)
    expect(result.detail).toContain('total is 2')
    expect(result.detail).toContain('sum to 3')
  })
  it('passes when it is', () => {
    expect(totalMismatch(goodOutput()).passed).toBe(true)
    expect(totalMismatch(partialOutput()).passed).toBe(true)
  })
})

describe('EVIDENCE_MISSING', () => {
  it('passes when every awarded step quotes the working, whatever the spacing', () => {
    expect(evidenceMissing(goodOutput(), context).passed).toBe(true)
    const spaced = goodOutput({ steps: [step({ step_id: 'S1', evidence: '(x-2)(x-3)=0 shows the factors' }), ...goodOutput().steps.slice(1)] })
    expect(evidenceMissing(spaced, context).passed).toBe(true)
  })
  it('fails when an awarded step does not quote the working', () => {
    const out = goodOutput({ steps: [step({ step_id: 'S1', evidence: 'The learner factorised nicely.' }), ...goodOutput().steps.slice(1)] })
    const result = evidenceMissing(out, context)
    expect(result.passed).toBe(false)
    expect(result.detail).toContain('S1')
    expect(result.detail).toContain('8 characters')
  })
  it('does not require evidence quotes on a step awarded 0', () => {
    expect(evidenceMissing(partialOutput(), partialContext).passed).toBe(true)
  })
  it('uses the typed answer, not the model transcription, for typed work', () => {
    const out = goodOutput({ transcription: 'something the model made up entirely' })
    expect(evidenceMissing(out, context).passed).toBe(true)
  })
  it('uses the model transcription for photos', () => {
    const photoContext = quadraticContext({ answerKind: 'photo', answerText: null })
    expect(evidenceMissing(goodOutput(), photoContext).passed).toBe(true)
    expect(evidenceMissing(goodOutput({ transcription: 'unrelated' }), photoContext).passed).toBe(false)
  })
  it('lowers the bar to the whole working when the working is shorter than 8 characters', () => {
    const short = quadraticContext({ answerText: 'x = 3', guideline: [{ step_id: 'S1', kind: 'A', marks: 1, expected: null }], maxMarks: 1 })
    const out = goodOutput({ steps: [step({ step_id: 'S1', evidence: 'x=3' })], total: 1, transcription: 'x = 3' })
    expect(evidenceMissing(out, short).passed).toBe(true)
    const wrong = goodOutput({ steps: [step({ step_id: 'S1', evidence: 'x=4' })], total: 1, transcription: 'x = 3' })
    expect(evidenceMissing(wrong, short).passed).toBe(false)
  })
  it('counts a short quote as missing even when its words are in the working', () => {
    const out = goodOutput({ steps: [step({ step_id: 'S1', evidence: 'x = 2' }), ...goodOutput().steps.slice(1)] })
    expect(evidenceMissing(out, context).passed).toBe(false)
  })
})

describe('CA_INCONSISTENT', () => {
  it('fails when a CA step is docked while its feedback says the method was right', () => {
    const out = goodOutput({
      steps: [
        step({ step_id: 'S1' }),
        step({ step_id: 'S2', awarded: 0, evidence: 'x = 3 or x = 4', feedback: 'Wrong first root.' }),
        step({ step_id: 'S3', awarded: 0, evidence: 'x = 3 or x = 4', feedback: 'The method is correct but it uses the earlier wrong value, so no mark.' }),
      ],
      total: 1,
    })
    const result = caInconsistent(out, context)
    expect(result.passed).toBe(false)
    expect(result.detail).toContain('S3 (CA)')
  })
  it('fails for a method step whose feedback says the error was carried forward', () => {
    const out = goodOutput({ steps: [step({ step_id: 'S1', awarded: 0, feedback: 'Carried forward from a previous error.' }), ...goodOutput().steps.slice(1)], total: 2 })
    expect(caInconsistent(out, context).passed).toBe(false)
  })
  it('ignores accuracy steps and full-mark steps', () => {
    const out = goodOutput({ steps: [step({ step_id: 'S1' }), step({ step_id: 'S2', awarded: 0, feedback: 'The method is correct but the value is wrong.' }), step({ step_id: 'S3' })], total: 2 })
    expect(caInconsistent(out, context).passed).toBe(true)
    expect(caInconsistent(goodOutput(), context).passed).toBe(true)
  })
  it('passes an ordinary lost step', () => {
    expect(caInconsistent(partialOutput(), partialContext).passed).toBe(true)
  })
})

describe('HINT_LEAKS_ANSWER', () => {
  const withHint = (hint: string | null) =>
    goodOutput({ steps: [step({ step_id: 'S1' }), step({ step_id: 'S2', evidence: 'x = 2 or x = 3' }), step({ step_id: 'S3', awarded: 0, hint })], total: 2 })

  it('guards the final answer, its numbers, memo values and expected working', () => {
    expect(guardedValues(context)).toEqual(['x=2 or x=3', '2', '3', '(x-2)(x-3)=0', 'x=2', 'x=3'])
  })
  it('fails when the hint contains the final answer', () => {
    const result = hintLeaksAnswer(withHint('The answer is x = 3.'), context)
    expect(result.passed).toBe(false)
    expect(result.detail).toContain('S3')
  })
  it('fails when the hint contains a memo value, with or without spaces', () => {
    expect(hintLeaksAnswer(withHint('Try x=3 in the second bracket'), context).passed).toBe(false)
    expect(hintLeaksAnswer(withHint('the second root is 3'), context).passed).toBe(false)
    expect(hintLeaksAnswer(withHint('the factors are (x−2)(x−3)'), context).passed).toBe(false)
  })
  it('fails when the hint repeats 60% or more of a memo step', () => {
    const memo = quadraticContext({ guideline: [{ step_id: 'S3', kind: 'CA', marks: 1, expected: 'subtract six from both sides then divide by two' }], finalAnswer: null })
    expect(hintLeaksAnswer(withHint('You should subtract six from both sides then divide'), memo).passed).toBe(false)
    expect(hintLeaksAnswer(withHint('Look again at what you did to both sides'), memo).passed).toBe(true)
  })
  it('allows step and mark references, zero and one, and a null hint', () => {
    expect(hintLeaksAnswer(withHint('Check your sign in step 3, worth 1 mark.'), context).passed).toBe(true)
    expect(hintLeaksAnswer(withHint('Set each bracket equal to 0 and solve each one.'), quadraticContext({ finalAnswer: 'x = 0 or x = 1' })).passed).toBe(true)
    expect(hintLeaksAnswer(withHint(null), context).passed).toBe(true)
    expect(hintLeaksAnswer(withHint('Look at the sign of 30 in your constant'), context).passed).toBe(true)
  })
})

describe('CONFIDENCE_LOW', () => {
  it('fails when any step is low confidence', () => {
    const out = goodOutput({ steps: [step({ step_id: 'S1', confidence: 'low' }), ...goodOutput().steps.slice(1)] })
    const result = confidenceLow(out, context)
    expect(result.passed).toBe(false)
    expect(result.detail).toContain('S1')
  })
  it('fails when a photo transcription is low confidence, but not for typed answers', () => {
    const out = goodOutput({ transcription_confidence: 'low' })
    expect(confidenceLow(out, quadraticContext({ answerKind: 'photo', answerText: null })).passed).toBe(false)
    expect(confidenceLow(out, context).passed).toBe(true)
  })
  it('is not retryable: a low-confidence result abstains instead of re-asking', () => {
    const rule = WORK_CHECK_RULES.find((r) => r.code === 'CONFIDENCE_LOW')
    expect(rule?.retryable).toBe(false)
  })
})

describe('INFERENCE_FORBIDDEN (work)', () => {
  it('fails on mood, ability or learning-style words in feedback or hints', () => {
    const out = goodOutput({ steps: [step({ step_id: 'S1', feedback: 'You seem anxious about factorising.' }), ...goodOutput().steps.slice(1)] })
    const result = workInferenceForbidden(out)
    expect(result.passed).toBe(false)
    expect(result.detail).toContain('anxious')
  })
  it('allows ordinary maths words', () => {
    const out = goodOutput({ steps: [step({ step_id: 'S1', feedback: 'Add the two terms, then check the sign.' }), ...goodOutput().steps.slice(1)] })
    expect(workInferenceForbidden(out).passed).toBe(true)
  })
})

describe('clampBoxes', () => {
  it('clamps every box to 0–1000 and rounds, leaving null alone', () => {
    const out = goodOutput({ steps: [step({ step_id: 'S1', box: [-5, 0, 1001, 500.4] }), step({ step_id: 'S2', box: null }), step({ step_id: 'S3', box: [10, 20, 30, 40] })] })
    const clamped = clampBoxes(out)
    expect(clamped.steps[0]?.box).toEqual([0, 0, 1000, 500])
    expect(clamped.steps[1]?.box).toBeNull()
    expect(clamped.steps[2]?.box).toEqual([10, 20, 30, 40])
    expect(out.steps[0]?.box).toEqual([-5, 0, 1001, 500.4]) // pure
    expect(clamped.transcription).toBe(QUADRATIC_WORKING)
  })
})
