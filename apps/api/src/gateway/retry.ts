/**
 * Retry policy for one model call. Pure, so the tests can pin every branch.
 *
 * Meta, "Pricing and rate limits" (https://dev.meta.ai/docs/pricing-rate-limits), read
 * 3 Nov 2026: "When you exceed a limit, the API rejects the request." Over the cap,
 * requests return "HTTP 429 Too Many Requests" with a "Retry-After" header; "Use
 * exponential backoff with jitter", and if Retry-After is present "wait at least that long."
 *
 * The brief (B03): retry only on 429 and 5xx, at most 2 retries, never on 400/401/403/404.
 */

export const MAX_RETRIES = 2
export const BACKOFF_BASE_MS = 500
export const BACKOFF_CAP_MS = 8_000
/** A Retry-After longer than this is not worth holding a request for; fail instead. */
export const MAX_RETRY_AFTER_MS = 30_000

export function isRetryableStatus(status: number | null): boolean {
  return status === 429 || (status !== null && status >= 500 && status <= 599)
}

/** Parses a Retry-After header (delay-seconds or an HTTP date) into milliseconds, or null. */
export function parseRetryAfterMs(header: string | null | undefined, nowMs: number): number | null {
  if (!header) return null
  const trimmed = header.trim()
  if (/^\d+$/.test(trimmed)) return Number(trimmed) * 1000
  const date = Date.parse(trimmed)
  if (Number.isNaN(date)) return null
  return Math.max(0, date - nowMs)
}

export interface RetryDelayInput {
  /** 0 for the first retry, 1 for the second. */
  retryIndex: number
  retryAfterHeader: string | null | undefined
  nowMs: number
  /** [0, 1); injected for determinism. */
  random: () => number
}

/**
 * Milliseconds to wait before the next attempt, or null when the Retry-After is too long
 * to honour (the caller then fails with `rate_limited`).
 */
export function retryDelayMs(input: RetryDelayInput): number | null {
  const fromHeader = parseRetryAfterMs(input.retryAfterHeader, input.nowMs)
  if (fromHeader !== null) {
    if (fromHeader > MAX_RETRY_AFTER_MS) return null
    // "wait at least that long": the header is a floor, plus a little jitter.
    return fromHeader + Math.floor(input.random() * 250)
  }
  const exponential = Math.min(BACKOFF_CAP_MS, BACKOFF_BASE_MS * 2 ** input.retryIndex)
  const jitter = Math.floor(input.random() * exponential * 0.5)
  return exponential + jitter
}
