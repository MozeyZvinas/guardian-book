import type { NoticeOutput } from '@guardian-book/shared'
import { describe, expect, it } from 'vitest'
import { dateOutOfRange, parseIsoDate, sourceLineMissing } from './notice.js'

const NOTICE = 'Grade 12 exam timetable\nMaths Paper 1: Friday 20 November 2026, 09:00\nMaths Paper 2: 24 Nov 2026'
const event = (overrides: Partial<NoticeOutput['events'][number]> = {}): NoticeOutput['events'][number] => ({
  title: 'Maths Paper 1',
  subject: 'Mathematics',
  paper: 'P1',
  on_date: '2026-11-20',
  source_line: 'Maths Paper 1: Friday 20 November 2026, 09:00',
  confidence: 'high',
  ...overrides,
})
const output = (...events: NoticeOutput['events']): NoticeOutput => ({ events, not_a_notice: false })
const context = { today: '2026-11-03', sourceText: NOTICE }

describe('parseIsoDate', () => {
  it('accepts real dates only', () => {
    expect(parseIsoDate('2026-11-03')?.toISOString()).toBe('2026-11-03T00:00:00.000Z')
    expect(parseIsoDate('2026-02-30')).toBeNull()
    expect(parseIsoDate('2026-13-01')).toBeNull()
    expect(parseIsoDate('3 Nov 2026')).toBeNull()
  })
})

describe('DATE_OUT_OF_RANGE', () => {
  it('passes dates within ±120 days of today, inclusive', () => {
    expect(dateOutOfRange(output(event({ on_date: '2026-07-06' }), event({ on_date: '2027-03-03' })), context).passed).toBe(true)
  })
  it('fails dates outside the window or not real', () => {
    const result = dateOutOfRange(output(event({ on_date: '2026-07-05' }), event({ on_date: '2026-02-30' })), context)
    expect(result.passed).toBe(false)
    expect(result.detail).toContain('121 days')
    expect(result.detail).toContain('not a real date')
  })
  it('fails when the server date is broken rather than passing everything', () => {
    expect(dateOutOfRange(output(event()), { today: 'today', sourceText: null }).passed).toBe(false)
  })
})

describe('SOURCE_LINE_MISSING', () => {
  it('passes when every event quotes a line of the notice, ignoring spacing and case', () => {
    expect(sourceLineMissing(output(event(), event({ source_line: 'maths paper 2: 24 nov 2026' })), context).passed).toBe(true)
  })
  it('fails on an empty source line', () => {
    const result = sourceLineMissing(output(event({ source_line: '   ' })), context)
    expect(result.passed).toBe(false)
    expect(result.detail).toContain('empty')
  })
  it('fails on a line that is not in the notice', () => {
    const result = sourceLineMissing(output(event({ source_line: 'Physics P1: 20 November' })), context)
    expect(result.passed).toBe(false)
    expect(result.detail).toContain('not a line of the notice')
  })
  it('checks only for emptiness when the server has no source text (a photo)', () => {
    expect(sourceLineMissing(output(event({ source_line: 'anything legible' })), { today: '2026-11-03', sourceText: null }).passed).toBe(true)
  })
})
