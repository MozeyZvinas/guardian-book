import type { LearningEventKind, TimelineEvent } from '@guardian-book/shared'
import { TIME_ZONE, shortDate } from '../../../lib/dates'

/**
 * The evidence behind a skill chip in plain words (B16 §3): "Tuesday: fixed it yourself ·
 * Wednesday: checked it alone, no hints". The wire shape (`timelineEventSchema`) carries
 * what happened and when, not the mark per event, so the line says what the learner did.
 */

const PLAIN_WORDS: Record<LearningEventKind, string> = {
  attempt_submitted: 'brought work',
  assessed: 'your work was checked',
  retried: 'tried again',
  review_confirmed: 'your teacher confirmed it',
  review_released: 'your teacher released the result',
  fixed_independently: 'fixed it yourself',
  support_given: 'help at home',
  notice_confirmed: 'a notice was confirmed',
  plan_issued: 'a step was planned',
  note_sent: 'a note went home',
  profile_set: 'you told us about you',
  independent_check_completed: 'checked it alone, no hints',
  retention_check_completed: 'checked it again, days later',
  guideline_approved: 'your teacher approved the marking guideline',
  feedback_teacher_added: 'your teacher added a note',
  intervention_assigned: 'your teacher planned a check-in',
  intervention_closed: 'the check-in was closed',
}

export function plainWords(kind: LearningEventKind): string {
  return PLAIN_WORDS[kind]
}

const DAY_MS = 24 * 60 * 60 * 1000

/** The calendar day in Africa/Johannesburg as `YYYY-MM-DD`. */
function dayIn(date: Date): string {
  return date.toLocaleDateString('en-CA', { timeZone: TIME_ZONE })
}

/** "Today", "Yesterday", the weekday within the last week, else "28 Oct". */
export function dayWord(iso: string, now: Date): string {
  const then = new Date(iso)
  const days = Math.round((Date.parse(`${dayIn(now)}T00:00:00Z`) - Date.parse(`${dayIn(then)}T00:00:00Z`)) / DAY_MS)
  if (days === 0) return 'Today'
  if (days === 1) return 'Yesterday'
  if (days > 1 && days < 7) return then.toLocaleDateString('en-ZA', { weekday: 'long', timeZone: TIME_ZONE })
  return shortDate(iso)
}

const TIMES = ['', '', 'twice', '3 times', '4 times', '5 times']

/** Oldest first: "Tuesday: fixed it yourself"; the same thing on the same day is said once, with a count. */
export function plainEvidence(events: TimelineEvent[], now: Date): string[] {
  const lines = [...events].sort((a, b) => a.occurredAt.localeCompare(b.occurredAt)).map((event) => `${dayWord(event.occurredAt, now)}: ${plainWords(event.kind)}`)
  const out: Array<{ line: string; count: number }> = []
  for (const line of lines) {
    const last = out[out.length - 1]
    if (last && last.line === line) last.count += 1
    else out.push({ line, count: 1 })
  }
  return out.map(({ line, count }) => (count === 1 ? line : `${line} (${TIMES[count] ?? `${count} times`})`))
}
