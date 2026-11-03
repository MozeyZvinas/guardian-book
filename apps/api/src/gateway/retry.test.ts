import { describe, expect, it } from 'vitest'
import { MAX_RETRIES, MAX_RETRY_AFTER_MS, isRetryableStatus, parseRetryAfterMs, retryDelayMs } from './retry.js'

describe('retry policy', () => {
  it('allows at most two retries', () => {
    expect(MAX_RETRIES).toBe(2)
  })

  it('retries only on 429 and 5xx', () => {
    expect(isRetryableStatus(429)).toBe(true)
    expect(isRetryableStatus(500)).toBe(true)
    expect(isRetryableStatus(503)).toBe(true)
    for (const status of [200, 400, 401, 403, 404, 408, 422, null]) expect(isRetryableStatus(status), String(status)).toBe(false)
  })

  it('parses Retry-After as seconds or as an HTTP date', () => {
    const now = Date.parse('2026-11-03T10:00:00Z')
    expect(parseRetryAfterMs('2', now)).toBe(2000)
    expect(parseRetryAfterMs(' 7 ', now)).toBe(7000)
    expect(parseRetryAfterMs('Tue, 03 Nov 2026 10:00:05 GMT', now)).toBe(5000)
    expect(parseRetryAfterMs('Tue, 03 Nov 2026 09:59:00 GMT', now)).toBe(0)
    expect(parseRetryAfterMs('soon', now)).toBeNull()
    expect(parseRetryAfterMs(null, now)).toBeNull()
    expect(parseRetryAfterMs('', now)).toBeNull()
  })

  it('waits at least Retry-After, plus a little jitter', () => {
    expect(retryDelayMs({ retryIndex: 0, retryAfterHeader: '3', nowMs: 0, random: () => 0 })).toBe(3000)
    expect(retryDelayMs({ retryIndex: 0, retryAfterHeader: '3', nowMs: 0, random: () => 0.999 })).toBe(3249)
  })

  it('refuses to honour a Retry-After beyond the cap', () => {
    expect(retryDelayMs({ retryIndex: 0, retryAfterHeader: String(MAX_RETRY_AFTER_MS / 1000 + 1), nowMs: 0, random: () => 0 })).toBeNull()
  })

  it('backs off exponentially with jitter when there is no header', () => {
    expect(retryDelayMs({ retryIndex: 0, retryAfterHeader: null, nowMs: 0, random: () => 0 })).toBe(500)
    expect(retryDelayMs({ retryIndex: 1, retryAfterHeader: null, nowMs: 0, random: () => 0 })).toBe(1000)
    expect(retryDelayMs({ retryIndex: 1, retryAfterHeader: null, nowMs: 0, random: () => 0.5 })).toBe(1250)
    expect(retryDelayMs({ retryIndex: 10, retryAfterHeader: null, nowMs: 0, random: () => 0 })).toBe(8000)
  })
})
