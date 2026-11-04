import { describe, expect, it } from 'vitest'
import { dedupeEvents, failedCheckCodes } from './service.js'

/** B16 §5: the verifier codes a non-accepted notice run logs, per call. */
describe('failedCheckCodes', () => {
  it('lists the failed codes of each call in order, empty for a clean call', () => {
    const runs = [
      { checks: [{ code: 'SCHEMA_INVALID' as const, passed: true, detail: 'ok' }, { code: 'DATE_OUT_OF_RANGE' as const, passed: false, detail: '2027-09-01 is 300 days away' }] },
      { checks: [{ code: 'SCHEMA_INVALID' as const, passed: false, detail: 'events missing' }, { code: 'SOURCE_LINE_MISSING' as const, passed: false, detail: 'empty' }] },
      { checks: [] },
    ]
    expect(failedCheckCodes(runs)).toEqual([['DATE_OUT_OF_RANGE'], ['SCHEMA_INVALID', 'SOURCE_LINE_MISSING'], []])
  })
})

describe('dedupeEvents', () => {
  it('keeps the first of two events with the same day and title', () => {
    const event = (title: string) => ({ title, subject: null, paper: null, on_date: '2026-11-20', source_line: title, confidence: 'high' as const })
    expect(dedupeEvents([event('Maths P1'), event('maths  p1'), event('Maths P2')]).map((e) => e.title)).toEqual(['Maths P1', 'Maths P2'])
  })
})
