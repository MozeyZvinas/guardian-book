import { describe, expect, it } from 'vitest'
import {
  CI_LABEL,
  evidenceFileSchema,
  formatCount,
  formatDate,
  formatDateRange,
  formatInterval,
  formatLatency,
  formatMs,
  formatPercent,
  formatRatio,
  formatUsd,
  type EvidenceFile,
  type EvidenceRatio,
} from './evidence.js'

const nine: EvidenceRatio = { n: 9, d: 12, rate: 0.75, ci95: [0.468, 0.911] }
const none: EvidenceRatio = { n: 0, d: 0, rate: null, ci95: null }

export function sampleEvidence(n = 12): EvidenceFile {
  const metric = (key: string) => ({ key, label: key, definition: `${key} ÷ cases`, ratio: { ...nine, d: n } })
  return {
    schema_version: 1,
    generated_at: '2026-11-03T12:00:00.000Z',
    models: [{ id: 'muse-spark-1.3', tier: 'standard', used_for: 'work check' }],
    prompt_versions: ['work-check-v1'],
    dataset: { label: 'development set, synthetic typed answers, implementer-scored', mocked: false, held_out: false },
    suites: [
      {
        key: 'work_check',
        label: 'Work check',
        source: 'pnpm eval:dev',
        n,
        metric: metric('exact_total'),
        metrics: [metric('within_one')],
        confidently_wrong: { n: 0, d: n, rate: 0, ci95: [0, 0.24] },
        abstained: { n: 1, d: n, rate: 1 / n, ci95: [0.01, 0.35] },
        checks_blocked_by_code: { HINT_LEAKS_ANSWER: 2 },
        latency_ms: { p50: 14200, p95: 23100 },
        cost: { per_attempt_usd: 0.0123, per_learner_week_usd: 0.0615, assumption: 'five pieces of work a week' },
      },
    ],
    not_yet: ['Handwriting photos: no photo cases in this run.'],
    built: { from: '2026-10-26', to: '2026-11-04', steps: [{ id: 'B01', title: 'Scaffold' }] },
  }
}

describe('evidence file schema', () => {
  it('accepts a well-formed file and refuses any tier but standard', () => {
    expect(evidenceFileSchema.safeParse(sampleEvidence()).success).toBe(true)
    const contributor = sampleEvidence()
    contributor.models[0] = { ...contributor.models[0]!, tier: 'contributor' as 'standard' }
    expect(evidenceFileSchema.safeParse(contributor).success).toBe(false)
  })

  it('refuses unknown keys, out-of-range rates and an empty suite list', () => {
    expect(evidenceFileSchema.safeParse({ ...sampleEvidence(), extra: 1 }).success).toBe(false)
    const bad = sampleEvidence()
    bad.suites[0]!.metric.ratio = { n: 13, d: 12, rate: 1.08, ci95: [0.9, 1] }
    expect(evidenceFileSchema.safeParse(bad).success).toBe(false)
    expect(evidenceFileSchema.safeParse({ ...sampleEvidence(), suites: [] }).success).toBe(false)
  })
})

describe('formatters', () => {
  it('shows counts with their denominator and the interval', () => {
    expect(formatCount(nine)).toBe('9 of 12')
    expect(formatInterval(nine)).toBe('47–91%')
    expect(formatRatio(nine)).toBe(`9 of 12 (75%; ${CI_LABEL} 47–91%)`)
    expect(formatRatio(none)).toBe('0 of 0 (no cases)')
    expect(formatInterval(none)).toBeNull()
  })

  it('keeps one decimal below ten percent, as in "0.6–16%"', () => {
    expect(formatPercent(0.006)).toBe('0.6%')
    expect(formatPercent(0.16)).toBe('16%')
    expect(formatPercent(0)).toBe('0%')
    expect(formatPercent(1)).toBe('100%')
  })

  it('formats latency, money and dates', () => {
    expect(formatMs(850)).toBe('850 ms')
    expect(formatMs(14200)).toBe('14.2 s')
    expect(formatLatency({ p50: 14200, p95: 23100 })).toBe('p50 14.2 s · p95 23.1 s')
    expect(formatUsd(0.0042)).toBe('$0.0042')
    expect(formatUsd(0.0615)).toBe('$0.062')
    expect(formatUsd(1.5)).toBe('$1.50')
    expect(formatDate('2026-11-03T23:30:00.000Z')).toBe('3 Nov 2026')
    expect(formatDateRange('2026-10-26', '2026-11-04')).toBe('26 Oct – 4 Nov 2026')
    expect(formatDateRange('2025-12-30', '2026-01-02')).toBe('30 Dec 2025 – 2 Jan 2026')
  })
})
