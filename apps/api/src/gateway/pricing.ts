/**
 * List prices, in USD per 1M tokens, for the Standard-tier models this build may call.
 *
 * Source: Meta, "Pricing and rate limits" (https://dev.meta.ai/docs/pricing-rate-limits),
 * read 3 Nov 2026. Table "Usage | Standard mode (per 1M tokens) | Contributor mode":
 *   Muse Spark (`muse-spark-1.3`, `muse-spark-1.2`, `muse-spark-1.1`):
 *     "Cached input | $0.15 | $0.002"
 *     "Input | $1.25 | $0.10"
 *     "Output | $4.25 | $0.20"
 *   Muse Wonder (`muse-wonder-1.0`, Standard only):
 *     "Cached input | $0.20 | Not available"
 *     "Input | $4.00 | Not available"
 *     "Output | $20.00 | Not available"
 *   "In Standard mode, you pay standard prices and your content is not used to train
 *   Meta models."
 *
 * Contributor-mode prices are deliberately absent: those model IDs are refused (D24).
 * An unknown model ID has no row, and the gateway refuses to call it rather than log a
 * guessed cost.
 */

export interface ModelPrice {
  /** USD per 1M uncached input tokens. */
  inputPerM: number
  /** USD per 1M cached input tokens. */
  cachedInputPerM: number
  /** USD per 1M output tokens. */
  outputPerM: number
}

export const PRICE_TABLE_DATE = '2026-11-03'

export const PRICE_TABLE: Readonly<Record<string, ModelPrice>> = {
  'muse-spark-1.3': { inputPerM: 1.25, cachedInputPerM: 0.15, outputPerM: 4.25 },
  'muse-spark-1.2': { inputPerM: 1.25, cachedInputPerM: 0.15, outputPerM: 4.25 },
  'muse-spark-1.1': { inputPerM: 1.25, cachedInputPerM: 0.15, outputPerM: 4.25 },
  'muse-wonder-1.0': { inputPerM: 4.0, cachedInputPerM: 0.2, outputPerM: 20.0 },
}

export interface TokenUsage {
  /** Prompt tokens in total, including the cached ones. */
  inputTokens: number
  /** The part of `inputTokens` served from the prompt cache. */
  cachedInputTokens: number
  outputTokens: number
}

export function priceFor(model: string): ModelPrice | null {
  return PRICE_TABLE[model] ?? null
}

/** Cost in USD, rounded to 8 places (a 1-token call is about $0.000001). */
export function costUsd(price: ModelPrice, usage: TokenUsage): number {
  const cached = Math.min(Math.max(usage.cachedInputTokens, 0), Math.max(usage.inputTokens, 0))
  const uncached = Math.max(usage.inputTokens, 0) - cached
  const raw =
    (uncached * price.inputPerM + cached * price.cachedInputPerM + Math.max(usage.outputTokens, 0) * price.outputPerM) /
    1_000_000
  return Math.round(raw * 1e8) / 1e8
}
