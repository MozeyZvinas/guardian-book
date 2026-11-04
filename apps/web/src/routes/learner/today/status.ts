import type { CheckIn, RecentInput, RecentInputStatus, TodayResponse } from '@guardian-book/shared'

/**
 * Today's words (B16 §2): one clear next action, and plain statuses for recent work.
 * Pure functions so the mapping is tested without a screen.
 */

export const KIND_WORD = { work: 'Homework', notice: 'Notice', question: 'Question' } as const

export interface StatusWords {
  glyph: string
  text: string
  /** True when the piece is settled and good (the glyph is shown in the progress colour). */
  done: boolean
}

/** Never a raw state: each one says what the learner can expect. */
export const STATUS_WORDS: Record<RecentInputStatus, StatusWords> = {
  reading: { glyph: '◌', text: 'Being read…', done: false },
  feedback_ready: { glyph: '●', text: 'Marked', done: true },
  teacher_checking: { glyph: '◐', text: 'Waiting for your teacher', done: false },
  fixed: { glyph: '✓', text: 'Fixed', done: true },
  failed: { glyph: '!', text: 'Couldn’t read it: try again', done: false },
  read: { glyph: '●', text: 'Dates added to your calendar', done: true },
  asked: { glyph: '?', text: 'Asked', done: false },
}

export function statusWords(status: RecentInputStatus): StatusWords {
  return STATUS_WORDS[status]
}

export const STALE_AFTER_MS = 24 * 60 * 60 * 1000

/** Failed, or still "being read" (abandoned), and older than a day: hidden until "Show all". */
export function isStale(input: Pick<RecentInput, 'status' | 'createdAt'>, now: Date): boolean {
  if (input.status !== 'failed' && input.status !== 'reading') return false
  return now.getTime() - new Date(input.createdAt).getTime() > STALE_AFTER_MS
}

export function splitRecent(recent: RecentInput[], now: Date): { shown: RecentInput[]; hidden: RecentInput[] } {
  const shown: RecentInput[] = []
  const hidden: RecentInput[] = []
  for (const input of recent) (isStale(input, now) ? hidden : shown).push(input)
  return { shown, hidden }
}

export type NextAction =
  | { kind: 'check_alone'; check: CheckIn }
  | { kind: 'follow_up'; check: CheckIn }
  | { kind: 'fix'; attemptId: string; step: string; why: string }
  | { kind: 'bring'; step: string | null; why: string | null }

export const NEXT_ACTION_TITLE: Record<NextAction['kind'], string> = {
  check_alone: 'Check it alone',
  follow_up: 'Your follow-up check',
  fix: 'Fix your step',
  bring: 'Bring something',
}

/**
 * The one thing to do now. A check-in due outranks tonight's step (spec 05 §9); a plan with
 * the attempt it came from is "fix your step"; a plan with no attempt still shows its step
 * under "bring something"; nothing at all is "bring something".
 */
export function nextAction(today: Pick<TodayResponse, 'checkIns' | 'tonight'>): NextAction {
  const check = today.checkIns[0]
  if (check) return { kind: check.kind === 'retention' ? 'check_alone' : 'follow_up', check }
  if (today.tonight.kind === 'plan') {
    const { attemptId, step, why } = today.tonight
    if (attemptId) return { kind: 'fix', attemptId, step, why }
    return { kind: 'bring', step, why }
  }
  return { kind: 'bring', step: null, why: null }
}
