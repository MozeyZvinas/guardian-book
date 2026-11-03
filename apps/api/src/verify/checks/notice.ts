import type { NoticeOutput } from '@guardian-book/shared'
import { squash } from '../text.js'
import { fail, pass, type CheckOutcome, type CheckRule, type NoticeContext } from '../types.js'

/** Rules for notice extraction (P0-06). */

export const DATE_WINDOW_DAYS = 120
const DAY_MS = 86_400_000

/** Parses YYYY-MM-DD as a real calendar date (UTC), or null. */
export function parseIsoDate(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) return null
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])]
  const date = new Date(Date.UTC(year, month - 1, day))
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null
  return date
}

export function dateOutOfRange(output: NoticeOutput, context: NoticeContext): CheckOutcome {
  const today = parseIsoDate(context.today)
  if (!today) return fail(`the server's "today" (${context.today}) is not a valid date`)
  const problems: string[] = []
  output.events.forEach((event, index) => {
    const date = parseIsoDate(event.on_date)
    if (!date) {
      problems.push(`events[${index}] "${event.title}": on_date "${event.on_date}" is not a real date (YYYY-MM-DD)`)
      return
    }
    const days = Math.round((date.getTime() - today.getTime()) / DAY_MS)
    if (Math.abs(days) > DATE_WINDOW_DAYS) {
      problems.push(`events[${index}] "${event.title}": ${event.on_date} is ${Math.abs(days)} days from today (${context.today}); the window is ±${DATE_WINDOW_DAYS} days`)
    }
  })
  if (problems.length === 0) return pass(`every date is within ±${DATE_WINDOW_DAYS} days of ${context.today}`)
  return fail(problems.join('; '))
}

export function sourceLineMissing(output: NoticeOutput, context: NoticeContext): CheckOutcome {
  const source = context.sourceText === null ? null : squash(context.sourceText)
  const problems: string[] = []
  output.events.forEach((event, index) => {
    const line = event.source_line.trim()
    if (line.length === 0) {
      problems.push(`events[${index}] "${event.title}": source_line is empty; quote the line of the notice this came from`)
      return
    }
    if (source !== null && !source.includes(squash(line))) {
      problems.push(`events[${index}] "${event.title}": source_line is not a line of the notice; quote it verbatim`)
    }
  })
  if (problems.length === 0) return pass('every event cites its source line')
  return fail(problems.join('; '))
}

export const NOTICE_RULES: CheckRule<NoticeOutput, NoticeContext>[] = [
  { code: 'DATE_OUT_OF_RANGE', retryable: true, run: dateOutOfRange },
  { code: 'SOURCE_LINE_MISSING', retryable: true, run: sourceLineMissing },
]
