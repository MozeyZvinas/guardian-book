import { describe, expect, it } from 'vitest'
import { RECENT_INPUT_STATUSES, type CheckIn, type RecentInput, type TodayResponse } from '@guardian-book/shared'
import { NEXT_ACTION_TITLE, isStale, nextAction, splitRecent, statusWords } from './status'

/** B16 §2: plain statuses, stale rows hidden after a day, one next action. */

const now = new Date('2026-11-04T12:00:00Z')
const at = (hoursAgo: number) => new Date(now.getTime() - hoursAgo * 60 * 60 * 1000).toISOString()
const input = (status: RecentInput['status'], hoursAgo: number, id: string = status): RecentInput => ({ id: `00000000-0000-7000-8000-${id.padEnd(12, '0').slice(0, 12)}`, kind: 'work', status, attemptId: null, createdAt: at(hoursAgo) })

describe('statusWords', () => {
  it('says each status in plain words, never the raw state', () => {
    expect(statusWords('feedback_ready').text).toBe('Marked')
    expect(statusWords('teacher_checking').text).toBe('Waiting for your teacher')
    expect(statusWords('failed').text).toBe('Couldn’t read it: try again')
    for (const status of RECENT_INPUT_STATUSES) {
      const words = statusWords(status)
      expect(words.text).toMatch(/^[A-Z]/) // a sentence, not a state
      expect(words.text).not.toMatch(/_/)
    }
  })
})

describe('isStale and splitRecent', () => {
  it('hides failed and abandoned (still reading) inputs older than a day only', () => {
    expect(isStale(input('failed', 30), now)).toBe(true)
    expect(isStale(input('reading', 30), now)).toBe(true)
    expect(isStale(input('failed', 2), now)).toBe(false)
    expect(isStale(input('reading', 23), now)).toBe(false)
    expect(isStale(input('feedback_ready', 100), now)).toBe(false)
    expect(isStale(input('fixed', 100), now)).toBe(false)
  })

  it('keeps the order and splits into shown and hidden', () => {
    const recent = [input('feedback_ready', 1, 'a'), input('failed', 48, 'b'), input('reading', 2, 'c'), input('reading', 72, 'd')]
    const { shown, hidden } = splitRecent(recent, now)
    expect(shown.map((r) => r.id)).toEqual([recent[0]?.id, recent[2]?.id])
    expect(hidden.map((r) => r.id)).toEqual([recent[1]?.id, recent[3]?.id])
  })
})

describe('nextAction', () => {
  const check = (kind: CheckIn['kind']): CheckIn => ({ kind, skillTag: 'factorise-trinomial', label: 'Factorise a trinomial', dueOn: '2026-11-04', overdueDays: 0, interventionId: null, action: null, sinceEventId: null })
  const plan = (attemptId: string | null): TodayResponse['tonight'] => ({ kind: 'plan', planId: '00000000-0000-7000-8000-000000000001', step: 'Finish the last line', hint: 'Both factors', why: 'Because you want to be an engineer', attemptId })

  it('a retention check-in is "check it alone"; a teacher check-in is "your follow-up check"; both outrank the plan', () => {
    expect(nextAction({ checkIns: [check('retention')], tonight: plan('a') })).toMatchObject({ kind: 'check_alone' })
    expect(nextAction({ checkIns: [check('intervention')], tonight: plan('a') })).toMatchObject({ kind: 'follow_up' })
  })

  it('a plan with its attempt is "fix your step"; without one it is "bring something" with the step shown', () => {
    expect(nextAction({ checkIns: [], tonight: plan('00000000-0000-7000-8000-000000000002') })).toEqual({ kind: 'fix', attemptId: '00000000-0000-7000-8000-000000000002', step: 'Finish the last line', why: 'Because you want to be an engineer' })
    expect(nextAction({ checkIns: [], tonight: plan(null) })).toEqual({ kind: 'bring', step: 'Finish the last line', why: 'Because you want to be an engineer' })
  })

  it('nothing yet is "bring something"', () => {
    expect(nextAction({ checkIns: [], tonight: { kind: 'none' } })).toEqual({ kind: 'bring', step: null, why: null })
    expect(NEXT_ACTION_TITLE.bring).toBe('Bring something')
  })
})
