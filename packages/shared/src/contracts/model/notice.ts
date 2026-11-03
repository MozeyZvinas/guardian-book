import { z } from 'zod'
import { binaryConfidenceSchema, isoDateSchema, shortText } from './common.js'

/**
 * Notice to plan (P0-06): a school notice or timetable extracted into dated events.
 * Every event cites the line it came from; low confidence means "please confirm".
 */

export const MAX_NOTICE_EVENTS = 40

export const noticeEventSchema = z.strictObject({
  title: shortText(120),
  subject: shortText(80).nullable(),
  /** "Paper 1", "P2", or null when the notice names no paper. */
  paper: shortText(40).nullable(),
  /** YYYY-MM-DD; must fall within ±120 days of today (DATE_OUT_OF_RANGE). */
  on_date: isoDateSchema,
  /** The line of the notice this event was read from, verbatim (SOURCE_LINE_MISSING). ≤ 300. */
  source_line: shortText(300),
  confidence: binaryConfidenceSchema,
})
export type NoticeEvent = z.infer<typeof noticeEventSchema>

export const noticeOutputSchema = z.strictObject({
  events: z.array(noticeEventSchema).max(MAX_NOTICE_EVENTS),
  /** True when the input did not look like a notice or timetable at all. */
  not_a_notice: z.boolean(),
})
export type NoticeOutput = z.infer<typeof noticeOutputSchema>
