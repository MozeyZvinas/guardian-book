import { describe, expect, it } from 'vitest'
import type { TimelineEvent } from '@guardian-book/shared'
import { dayWord, plainEvidence } from './evidence'

/** B16 §3: the evidence behind a chip in plain words, by day. */

const now = new Date('2026-11-05T10:00:00Z') // Thursday 5 Nov, 12:00 SAST

const event = (kind: TimelineEvent['kind'], occurredAt: string, id: string): TimelineEvent => ({
  id: `00000000-0000-7000-8000-${id.padStart(12, '0')}`,
  kind,
  basis: 'model_high',
  skillTag: 'factorise-trinomial',
  skillLabel: 'Factorise a trinomial',
  attemptId: null,
  itemId: null,
  occurredAt,
  counted: true,
})

describe('dayWord', () => {
  it('says today, yesterday, a weekday within the week, else a short date', () => {
    expect(dayWord('2026-11-05T06:00:00Z', now)).toBe('Today')
    expect(dayWord('2026-11-04T20:00:00Z', now)).toBe('Yesterday')
    expect(dayWord('2026-11-03T08:00:00Z', now)).toBe('Tuesday')
    expect(dayWord('2026-10-28T08:00:00Z', now)).toBe('28 Oct')
  })

  it('counts days in Africa/Johannesburg, not UTC', () => {
    // 23:30 UTC on 4 Nov is 01:30 SAST on 5 Nov: today, not yesterday.
    expect(dayWord('2026-11-04T23:30:00Z', now)).toBe('Today')
  })
})

describe('plainEvidence', () => {
  it('lists events oldest first in plain words', () => {
    const events = [event('independent_check_completed', '2026-11-04T09:00:00Z', '3'), event('assessed', '2026-11-03T09:00:00Z', '1'), event('fixed_independently', '2026-11-04T08:00:00Z', '2')]
    expect(plainEvidence(events, now)).toEqual(['Tuesday: your work was checked', 'Yesterday: fixed it yourself', 'Yesterday: checked it alone, no hints'])
  })

  it('says the same thing on the same day once, with how many times', () => {
    const events = [event('assessed', '2026-11-05T06:00:00Z', '1'), event('assessed', '2026-11-05T07:00:00Z', '2'), event('assessed', '2026-11-05T08:00:00Z', '3'), event('fixed_independently', '2026-11-05T09:00:00Z', '4')]
    expect(plainEvidence(events, now)).toEqual(['Today: your work was checked (3 times)', 'Today: fixed it yourself'])
    expect(plainEvidence(events.slice(0, 2), now)).toEqual(['Today: your work was checked (twice)'])
  })
})
