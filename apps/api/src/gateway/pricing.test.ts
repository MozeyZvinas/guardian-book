import { describe, expect, it } from 'vitest'
import { PRICE_TABLE, PRICE_TABLE_DATE, costUsd, priceFor } from './pricing.js'

describe('pricing', () => {
  it('holds the Standard-tier Muse Spark 1.3 prices from the pricing page, dated', () => {
    expect(PRICE_TABLE_DATE).toBe('2026-11-03')
    expect(PRICE_TABLE['muse-spark-1.3']).toEqual({ inputPerM: 1.25, cachedInputPerM: 0.15, outputPerM: 4.25 })
  })

  it('has no Contributor rows at all (D24)', () => {
    expect(Object.keys(PRICE_TABLE).some((id) => id.endsWith('-contributor'))).toBe(false)
    expect(priceFor('muse-spark-1.3-contributor')).toBeNull()
  })

  it('prices uncached, cached and output tokens separately', () => {
    const price = priceFor('muse-spark-1.3')
    expect(price).not.toBeNull()
    if (!price) return
    expect(costUsd(price, { inputTokens: 1_000_000, cachedInputTokens: 0, outputTokens: 0 })).toBe(1.25)
    expect(costUsd(price, { inputTokens: 1_000_000, cachedInputTokens: 1_000_000, outputTokens: 0 })).toBe(0.15)
    expect(costUsd(price, { inputTokens: 0, cachedInputTokens: 0, outputTokens: 1_000_000 })).toBe(4.25)
    expect(costUsd(price, { inputTokens: 2000, cachedInputTokens: 500, outputTokens: 300 })).toBeCloseTo((1500 * 1.25 + 500 * 0.15 + 300 * 4.25) / 1e6, 10)
  })

  it('never lets cached tokens exceed input tokens or negatives reduce cost', () => {
    const price = priceFor('muse-spark-1.3')
    if (!price) throw new Error('missing price')
    expect(costUsd(price, { inputTokens: 100, cachedInputTokens: 500, outputTokens: 0 })).toBe(costUsd(price, { inputTokens: 100, cachedInputTokens: 100, outputTokens: 0 }))
    expect(costUsd(price, { inputTokens: -5, cachedInputTokens: -5, outputTokens: -5 })).toBe(0)
  })
})
