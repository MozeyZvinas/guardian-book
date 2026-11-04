/**
 * "This week" for notes home and the class picture (brief B07 §4): from Monday 00:00 in
 * South Africa (SAST, UTC+2, no daylight saving) to now. Pure, so it has a unit test.
 */

const SAST_OFFSET_MS = 2 * 60 * 60 * 1000
const DAY_MS = 24 * 60 * 60 * 1000

/** Monday 00:00 SAST of the week containing `now`, as an instant. */
export function weekStartSast(now: Date): Date {
  const shifted = new Date(now.getTime() + SAST_OFFSET_MS)
  const daysSinceMonday = (shifted.getUTCDay() + 6) % 7
  const mondayMidnightShifted = Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate()) - daysSinceMonday * DAY_MS
  return new Date(mondayMidnightShifted - SAST_OFFSET_MS)
}

/** YYYY-MM-DD in SAST, `days` days after `now`. */
export function sastDatePlus(now: Date, days: number): string {
  return new Date(now.getTime() + SAST_OFFSET_MS + days * DAY_MS).toISOString().slice(0, 10)
}
