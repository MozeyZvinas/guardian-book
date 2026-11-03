/** Dates as the learner reads them (spec 06 §2): Africa/Johannesburg, short and plain. */

export const TIME_ZONE = 'Africa/Johannesburg'

/** "3 Nov" from an ISO instant or a `YYYY-MM-DD` day. */
export function shortDate(value: string): string {
  const date = /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T12:00:00Z`) : new Date(value)
  return date.toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', timeZone: TIME_ZONE })
}

/** "3 Nov, 14:05" from an ISO instant. */
export function shortDateTime(value: string): string {
  const date = new Date(value)
  return `${shortDate(value)}, ${date.toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit', timeZone: TIME_ZONE })}`
}

/** "today", "tomorrow", "in 12 days", "3 days ago". */
export function daysWord(days: number): string {
  if (days === 0) return 'today'
  if (days === 1) return 'tomorrow'
  if (days === -1) return 'yesterday'
  if (days > 1) return `in ${days} days`
  return `${-days} days ago`
}
