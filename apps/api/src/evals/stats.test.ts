import { describe, expect, it } from 'vitest'
import { percentile, ratio, wilson } from './stats.js'

describe('stats', () => {
  it('wilson gives the textbook interval for 1 of 31', () => {
    const interval = wilson(1, 31)
    expect(interval).not.toBeNull()
    if (!interval) return
    // Spec 04 §5.3 example: "1 of 31 (95% CI 0.6–16%)".
    expect(interval[0]).toBeCloseTo(0.006, 2)
    expect(interval[1]).toBeCloseTo(0.16, 2)
  })

  it('wilson stays within [0, 1] and is null with no denominator', () => {
    expect(wilson(0, 10)?.[0]).toBeCloseTo(0, 12)
    expect(wilson(10, 10)?.[1]).toBeCloseTo(1, 12)
    expect(wilson(0, 0)).toBeNull()
  })

  it('ratio carries the counts and the rate', () => {
    expect(ratio(3, 4)).toEqual({ n: 3, d: 4, rate: 0.75, ci95: wilson(3, 4) })
    expect(ratio(0, 0)).toEqual({ n: 0, d: 0, rate: null, ci95: null })
  })

  it('percentile uses nearest rank', () => {
    expect(percentile([], 50)).toBe(0)
    expect(percentile([5], 95)).toBe(5)
    expect(percentile([10, 20, 30, 40], 50)).toBe(20)
    expect(percentile([10, 20, 30, 40], 95)).toBe(40)
  })
})
