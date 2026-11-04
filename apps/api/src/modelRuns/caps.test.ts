import { describe, expect, it } from 'vitest'
import { hashCode } from '../lib/codes.js'
import { capLimits, decideCaps, effectiveLimits } from './caps.js'

/** B09: the try-it cap is a tighter per-user cap for learners in the public class. */
describe('try-it cap (B09)', () => {
  const base = { userDailyCalls: 60, dailyBudgetUsd: 5 }

  it('capLimits carries the try-it class as a hash, never the code, only when configured', () => {
    expect(capLimits(base)).toEqual({ userDailyCalls: 60, dailyBudgetUsd: 5 })
    expect(capLimits(base, { classCode: null, userDailyCalls: 6 })).toEqual({ userDailyCalls: 60, dailyBudgetUsd: 5 })
    const withTry = capLimits(base, { classCode: 'ABCDEFGH', userDailyCalls: 6 })
    expect(withTry.tryIt).toEqual({ classCodeHash: hashCode('ABCDEFGH'), userDailyCalls: 6 })
    expect(JSON.stringify(withTry)).not.toContain('ABCDEFGH')
  })

  it('a try-it learner is capped at the try-it number; everyone else keeps the user cap', () => {
    const limits = capLimits(base, { classCode: 'ABCDEFGH', userDailyCalls: 6 })
    expect(effectiveLimits(limits, true).userDailyCalls).toBe(6)
    expect(effectiveLimits(limits, false).userDailyCalls).toBe(60)
    expect(effectiveLimits(capLimits(base), true).userDailyCalls).toBe(60)
    // The try cap never raises a lower user cap.
    expect(effectiveLimits(capLimits({ userDailyCalls: 2, dailyBudgetUsd: 5 }, { classCode: 'X', userDailyCalls: 6 }), true).userDailyCalls).toBe(2)
  })

  it('the sixth call of the day is the last one for a try-it learner', () => {
    const limits = effectiveLimits(capLimits(base, { classCode: 'ABCDEFGH', userDailyCalls: 6 }), true)
    expect(decideCaps({ userCalls: 5, globalCostUsd: 0 }, limits)).toEqual({ ok: true, remainingCalls: 1 })
    expect(decideCaps({ userCalls: 6, globalCostUsd: 0 }, limits)).toEqual({ ok: false, reason: 'user_calls' })
  })
})
