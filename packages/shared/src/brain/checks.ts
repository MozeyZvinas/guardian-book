import type { BrainEvent } from './evidence.js'
import { countedOutcomes, dayOf, DEFAULT_TIME_ZONE } from './reduce.js'

/**
 * Scheduled retention checks (P0-05; spec 03 §9.1), derived from events: after a correct
 * independent check on a skill, a follow-up check is due `RETENTION_CHECK_DAYS` later and
 * stays due until a retention-mode outcome for that skill is recorded after it. Pure; the
 * API adds interventions' follow-up dates (`GET /api/me/checks`).
 */

export const RETENTION_CHECK_DAYS = 2

export interface DueRetentionCheck {
  skillTag: string
  /** The independent check that scheduled this one. */
  sinceEventId: string
  passedAt: Date
  /** `YYYY-MM-DD` in the learner's time zone. */
  dueOn: string
  /** 0 on the due day; grows afterwards. */
  overdueDays: number
}

export interface RetentionCheckOptions {
  days?: number
  timeZone?: string
}

export function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000)
}

/** Whole days between two `YYYY-MM-DD` strings (b − a); negative when b is earlier. */
export function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / (24 * 60 * 60 * 1000))
}

/** Retention checks due on or before `now`, one per skill, soonest due first. */
export function dueRetentionChecks(events: readonly BrainEvent[], now: Date, options: RetentionCheckOptions = {}): DueRetentionCheck[] {
  const days = options.days ?? RETENTION_CHECK_DAYS
  const timeZone = options.timeZone ?? DEFAULT_TIME_ZONE
  const today = dayOf(now, timeZone)

  const latestIndependentPass = new Map<string, { eventId: string; at: Date }>()
  const latestRetention = new Map<string, Date>()
  for (const outcome of countedOutcomes(events)) {
    if (outcome.mode === 'independent' && outcome.correct) {
      const current = latestIndependentPass.get(outcome.skillTag)
      if (!current || outcome.occurredAt > current.at) latestIndependentPass.set(outcome.skillTag, { eventId: outcome.eventId, at: outcome.occurredAt })
    }
    if (outcome.mode === 'retention') {
      const current = latestRetention.get(outcome.skillTag)
      if (!current || outcome.occurredAt > current) latestRetention.set(outcome.skillTag, outcome.occurredAt)
    }
  }

  const due: DueRetentionCheck[] = []
  for (const [skillTag, pass] of latestIndependentPass) {
    const retention = latestRetention.get(skillTag)
    if (retention && retention > pass.at) continue
    const dueOn = dayOf(addDays(pass.at, days), timeZone)
    const overdueDays = daysBetween(dueOn, today)
    if (overdueDays < 0) continue
    due.push({ skillTag, sinceEventId: pass.eventId, passedAt: pass.at, dueOn, overdueDays })
  }
  return due.sort((a, b) => (a.dueOn !== b.dueOn ? (a.dueOn < b.dueOn ? -1 : 1) : a.skillTag < b.skillTag ? -1 : a.skillTag > b.skillTag ? 1 : 0))
}
