import { describe, expect, it } from 'vitest'
import { fixIdempotencyKey, fixedOnFirstRetry, retryNoOf, targetStepNos } from './fix.js'

/** Fix it (P0-05): the lost steps are the targets; "fixed on their own" counts on the first retry only. */
const steps = [
  { step_no: 1, awarded: 1, available: 1 },
  { step_no: 2, awarded: 0, available: 1 },
  { step_no: 3, awarded: 1, available: 1 },
  { step_no: 4, awarded: 0, available: 2 },
]

describe('fix it helpers', () => {
  it('targets every step the original lost marks on', () => {
    expect(targetStepNos(steps)).toEqual([2, 4])
  })
  it('counts "fixed on their own" only on the first retry with every target earned', () => {
    const fixed = [
      { step_no: 2, awarded: 1, available: 1 },
      { step_no: 4, awarded: 2, available: 2 },
    ]
    expect(fixedOnFirstRetry(1, [2, 4], fixed)).toBe(true)
    expect(fixedOnFirstRetry(2, [2, 4], fixed)).toBe(false)
    expect(fixedOnFirstRetry(1, [2, 4], [{ step_no: 2, awarded: 1, available: 1 }, { step_no: 4, awarded: 1, available: 2 }])).toBe(false)
    expect(fixedOnFirstRetry(1, [], fixed)).toBe(false)
  })
  it('the retry number rides on the idempotency key', () => {
    const key = fixIdempotencyKey('019a0b02-0000-7000-8000-000000000101', 2)
    expect(retryNoOf(key)).toBe(2)
    expect(retryNoOf('input:019a0b02-0000-7000-8000-000000000101')).toBeNull()
  })
})
