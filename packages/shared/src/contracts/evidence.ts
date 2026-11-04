import { z } from 'zod'

/**
 * The proof page's data (P0-12; spec 04 §5.3, §5.6; spec 05 §4.1 P4): the committed
 * summary `evals/results/latest.json`. Every rate is a count over a denominator with a 95%
 * Wilson interval. `GET /api/evidence` and the `/evidence` page read this file and nothing
 * else, so no number on the page is typed by hand.
 *
 * The file claims only what it says: the dataset label states who scored the cases and
 * whether they were held out; `mocked` marks a dry run against the mocked model. It is
 * written by `pnpm eval:dev` (B03's runner, B08's summary), validated on the way out and
 * again on the way in. Never edit it by hand.
 */

export const EVIDENCE_SCHEMA_VERSION = 1

/** The labels the formatter and the page share, so the page itself holds no numerals. */
export const CI_LABEL = '95% CI'
export const P50_LABEL = 'p50'
export const P95_LABEL = 'p95'

export const evidenceRatioSchema = z.strictObject({
  n: z.number().int().nonnegative(),
  d: z.number().int().nonnegative(),
  /** n ÷ d, or null when d is 0. */
  rate: z.number().min(0).max(1).nullable(),
  /** 95% Wilson score interval, [low, high] in [0, 1], or null when d is 0. */
  ci95: z.tuple([z.number().min(0).max(1), z.number().min(0).max(1)]).nullable(),
})
export type EvidenceRatio = z.infer<typeof evidenceRatioSchema>

// B17 phase C adds the held-out NSC suites: the guide against the memo's final answer, and the
// work check on memo working with one step perturbed.
export const EVIDENCE_SUITE_KEYS = ['work_check', 'pedagogy', 'privacy', 'nsc_guide', 'nsc_work_check'] as const
export const evidenceSuiteKeySchema = z.enum(EVIDENCE_SUITE_KEYS)
export type EvidenceSuiteKey = z.infer<typeof evidenceSuiteKeySchema>

export const evidenceMetricSchema = z.strictObject({
  key: z.string().min(1).max(64),
  label: z.string().min(1).max(120),
  /** Numerator ÷ denominator, in words: what was counted over what. */
  definition: z.string().min(1).max(400),
  ratio: evidenceRatioSchema,
})
export type EvidenceMetric = z.infer<typeof evidenceMetricSchema>

/** A suite's own dataset, when it differs from the file's (B17: held-out NSC questions, memos as truth). */
export const evidenceSuiteDatasetSchema = z.strictObject({
  /** Plain words: what the cases are and what counts as truth. */
  label: z.string().min(1).max(400),
  /** True when the questions were kept out of practice and of every prompt before this run. */
  held_out: z.boolean(),
})
export type EvidenceSuiteDataset = z.infer<typeof evidenceSuiteDatasetSchema>

export const evidenceSuiteSchema = z.strictObject({
  key: evidenceSuiteKeySchema,
  label: z.string().min(1).max(160),
  /** Set when the suite ran on another dataset than the file's `dataset`; absent otherwise. */
  dataset: evidenceSuiteDatasetSchema.optional(),
  /** Where the numbers came from: the command, the model and the run, or the test run. */
  source: z.string().min(1).max(300),
  /** The cases (or tests) in this suite. */
  n: z.number().int().nonnegative(),
  /** The headline metric. */
  metric: evidenceMetricSchema,
  /** Further metrics, each with its own denominator. */
  metrics: z.array(evidenceMetricSchema).max(20),
  /** Wrong total at all-high confidence ÷ accepted cases at all-high confidence; null when not applicable. */
  confidently_wrong: evidenceRatioSchema.nullable(),
  /** Cases sent to the teacher as uncertain ÷ cases; null when not applicable. */
  abstained: evidenceRatioSchema.nullable(),
  /** Verifier checks that failed, by code, across every call in the suite. */
  checks_blocked_by_code: z.record(z.string(), z.number().int().nonnegative()),
  latency_ms: z.strictObject({ p50: z.number().nonnegative(), p95: z.number().nonnegative() }).nullable(),
  cost: z
    .strictObject({
      per_attempt_usd: z.number().nonnegative().nullable(),
      per_learner_week_usd: z.number().nonnegative().nullable(),
      /** The stated assumption behind the learner-week figure. */
      assumption: z.string().min(1).max(300),
    })
    .nullable(),
})
export type EvidenceSuite = z.infer<typeof evidenceSuiteSchema>

export const evidenceFileSchema = z.strictObject({
  schema_version: z.literal(EVIDENCE_SCHEMA_VERSION),
  generated_at: z.iso.datetime(),
  /** Standard tier only (D24): the schema cannot express any other tier. */
  models: z.array(z.strictObject({ id: z.string().min(1), tier: z.literal('standard'), used_for: z.string().min(1).max(120) })).min(1),
  prompt_versions: z.array(z.string().min(1)).min(1),
  dataset: z.strictObject({
    /** Plain words: what the cases are, who scored them, whether they were held out. */
    label: z.string().min(1).max(400),
    /** True when the run used the mocked model (no spend; the numbers test the pipeline only). */
    mocked: z.boolean(),
    /** True only for the frozen, teacher-scored held-out set (spec 04 §5.2). */
    held_out: z.boolean(),
  }),
  suites: z.array(evidenceSuiteSchema).min(1),
  /** What doesn't work yet, in plain words. */
  not_yet: z.array(z.string().min(1).max(300)),
  built: z.strictObject({
    from: z.iso.date(),
    to: z.iso.date(),
    steps: z.array(z.strictObject({ id: z.string().min(1).max(8), title: z.string().min(1).max(160) })),
  }),
})
export type EvidenceFile = z.infer<typeof evidenceFileSchema>

export const evidenceResponseSchema = z.object({ evidence: evidenceFileSchema.nullable() })
export type EvidenceResponse = z.infer<typeof evidenceResponseSchema>

// ── Formatting (pure; the page shows numbers only through these) ────────────────────────

const PERCENT = 100
const ONE_DECIMAL_BELOW = 10
const MS_PER_SECOND = 1000
const CENT = 0.01

const fixedFormats = new Map<number, Intl.NumberFormat>()

/**
 * `value` to exactly `digits` decimals, rounded half up on the decimal value: `toFixed`
 * rounds the binary one, so 0.0615 would show as "0.061".
 */
function fixed(value: number, digits: number): string {
  let format = fixedFormats.get(digits)
  if (!format) {
    format = new Intl.NumberFormat('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits, useGrouping: false })
    fixedFormats.set(digits, format)
  }
  return format.format(value)
}

/** The number part of a percentage: one decimal below 10, whole numbers above. */
function percentNumber(fraction: number): string {
  const value = fraction * PERCENT
  if (value === 0 || value >= ONE_DECIMAL_BELOW) return fixed(value, 0)
  return fixed(value, 1)
}

/** A fraction in [0, 1] as a percentage: one decimal below 10%, whole numbers above. */
export function formatPercent(fraction: number): string {
  return `${percentNumber(fraction)}%`
}

/** "9 of 12". */
export function formatCount(ratio: EvidenceRatio): string {
  return `${ratio.n} of ${ratio.d}`
}

/** "47–91%" (one sign, on the high end), or null when there is no denominator. */
export function formatInterval(ratio: EvidenceRatio): string | null {
  if (!ratio.ci95) return null
  const [low, high] = ratio.ci95
  return `${percentNumber(low)}–${formatPercent(high)}`
}

/** "9 of 12 (75%; 95% CI 47–91%)", or "0 of 0 (no cases)". */
export function formatRatio(ratio: EvidenceRatio): string {
  const interval = formatInterval(ratio)
  if (ratio.rate === null || interval === null) return `${formatCount(ratio)} (no cases)`
  return `${formatCount(ratio)} (${formatPercent(ratio.rate)}; ${CI_LABEL} ${interval})`
}

/** "14.2 s" at a second or more, else "850 ms". */
export function formatMs(ms: number): string {
  if (ms >= MS_PER_SECOND) return `${fixed(ms / MS_PER_SECOND, 1)} s`
  return `${fixed(ms, 0)} ms`
}

/** "p50 14.2 s · p95 23.1 s": the page shows latency only through this, so it holds no numerals. */
export function formatLatency(latency: NonNullable<EvidenceSuite['latency_ms']>): string {
  return `${P50_LABEL} ${formatMs(latency.p50)} · ${P95_LABEL} ${formatMs(latency.p95)}`
}

/** "$0.0123" below a cent, "$0.123" below a dollar, "$1.23" above. */
export function formatUsd(usd: number): string {
  if (usd < CENT) return `$${fixed(usd, 4)}`
  if (usd < 1) return `$${fixed(usd, 3)}`
  return `$${fixed(usd, 2)}`
}

const DAY_MONTH = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' })
const DAY_MONTH_YEAR = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })

function utcDate(iso: string): Date {
  // A bare date is read as UTC midnight so the day never shifts with the viewer's zone.
  return new Date(/^\d{4}-\d{2}-\d{2}$/.test(iso) ? `${iso}T00:00:00Z` : iso)
}

/** "26 Oct 2026" from a date or date-time. */
export function formatDate(iso: string): string {
  return DAY_MONTH_YEAR.format(utcDate(iso))
}

/** "26 Oct – 4 Nov 2026" (the year once when both dates share it). */
export function formatDateRange(fromIso: string, toIso: string): string {
  const from = utcDate(fromIso)
  const to = utcDate(toIso)
  const first = from.getUTCFullYear() === to.getUTCFullYear() ? DAY_MONTH.format(from) : DAY_MONTH_YEAR.format(from)
  return `${first} – ${DAY_MONTH_YEAR.format(to)}`
}
