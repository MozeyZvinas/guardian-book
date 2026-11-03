import { describe, expect, it } from 'vitest'
import { addDays, daysBetween, dueRetentionChecks } from './checks.js'
import { evidencePayload, type BrainEvent } from './evidence.js'

let n = 0
const id = () => `00000000-0000-7000-8000-${String(++n).padStart(12, '0')}`
const DAY = 24 * 60 * 60 * 1000
const passedAt = new Date('2026-11-01T10:00:00Z')

function check(kind: BrainEvent['kind'], correct: boolean, at: Date): BrainEvent {
  return { id: id(), kind, attemptId: id(), itemId: null, skillTag: 'algebra.factorising', basis: 'model_high', payload: evidencePayload({ correct }), occurredAt: at }
}

describe('dueRetentionChecks', () => {
  it('is due two days after a correct independent check and stays due until a retention check is recorded', () => {
    const events = [check('independent_check_completed', true, passedAt)]
    expect(dueRetentionChecks(events, addDays(passedAt, 1))).toEqual([])
    const due = dueRetentionChecks(events, addDays(passedAt, 2))
    expect(due).toEqual([{ skillTag: 'algebra.factorising', sinceEventId: events[0]?.id, passedAt, dueOn: '2026-11-03', overdueDays: 0 }])
    expect(dueRetentionChecks(events, addDays(passedAt, 5))[0]?.overdueDays).toBe(3)

    const done = [...events, check('retention_check_completed', false, addDays(passedAt, 3))]
    expect(dueRetentionChecks(done, addDays(passedAt, 9))).toEqual([])
  })

  it('a failed independent check schedules nothing; a later pass schedules again after an earlier retention check', () => {
    expect(dueRetentionChecks([check('independent_check_completed', false, passedAt)], addDays(passedAt, 9))).toEqual([])
    const events = [
      check('independent_check_completed', true, passedAt),
      check('retention_check_completed', true, addDays(passedAt, 2)),
      check('independent_check_completed', true, addDays(passedAt, 4)),
    ]
    expect(dueRetentionChecks(events, addDays(passedAt, 6)).map((c) => c.dueOn)).toEqual(['2026-11-07'])
  })

  it('ignores basis none and honours a custom gap', () => {
    const none: BrainEvent = { ...check('independent_check_completed', true, passedAt), basis: 'none' }
    expect(dueRetentionChecks([none], addDays(passedAt, 9))).toEqual([])
    expect(dueRetentionChecks([check('independent_check_completed', true, passedAt)], addDays(passedAt, 1), { days: 1 })).toHaveLength(1)
  })

  it('date helpers', () => {
    expect(daysBetween('2026-11-01', '2026-11-03')).toBe(2)
    expect(daysBetween('2026-11-03', '2026-11-01')).toBe(-2)
    expect(addDays(passedAt, 1).getTime() - passedAt.getTime()).toBe(DAY)
  })
})
