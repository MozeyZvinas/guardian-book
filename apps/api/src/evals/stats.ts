/**
 * Counts with denominators and 95% Wilson intervals (spec 04 §5.3: "We publish counts
 * plus a 95% Wilson interval"). Pure.
 */

export interface Ratio {
  n: number
  d: number
  /** n ÷ d, or null when d is 0. */
  rate: number | null
  /** 95% Wilson score interval as [low, high] in [0, 1], or null when d is 0. */
  ci95: [number, number] | null
}

const Z = 1.959964

export function wilson(n: number, d: number): [number, number] | null {
  if (d <= 0) return null
  const p = n / d
  const z2 = Z * Z
  const denominator = 1 + z2 / d
  const centre = (p + z2 / (2 * d)) / denominator
  const half = (Z * Math.sqrt((p * (1 - p)) / d + z2 / (4 * d * d))) / denominator
  return [Math.max(0, centre - half), Math.min(1, centre + half)]
}

export function ratio(n: number, d: number): Ratio {
  return { n, d, rate: d > 0 ? n / d : null, ci95: wilson(n, d) }
}

/** Nearest-rank percentile, 0–100, of a list of numbers; 0 for an empty list. */
export function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const rank = Math.max(1, Math.ceil((p / 100) * sorted.length))
  return sorted[rank - 1] ?? 0
}
