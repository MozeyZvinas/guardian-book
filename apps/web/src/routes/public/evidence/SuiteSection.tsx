import {
  CI_LABEL,
  formatCount,
  formatInterval,
  formatLatency,
  formatPercent,
  formatUsd,
  type EvidenceMetric,
  type EvidenceSuite,
} from '@guardian-book/shared'

/**
 * One evaluation suite: its own dataset when it has one (B17's held-out NSC suites), the
 * metrics table (a table from the tablet breakpoint up, a stack of cards on a phone), then
 * the run facts. Every figure comes from the suite object and
 * is formatted by the shared helpers; nothing numeric lives in this file.
 */

const CONFIDENTLY_WRONG: Omit<EvidenceMetric, 'ratio'> = {
  key: 'confidently_wrong',
  label: 'Confidently wrong',
  definition: 'accepted cases at all-high confidence whose total is wrong ÷ accepted cases at all-high confidence',
}

const ABSTAINED: Omit<EvidenceMetric, 'ratio'> = {
  key: 'abstained',
  label: 'Sent to the teacher as uncertain',
  definition: 'cases the checks would not accept ÷ cases',
}

function rowsOf(suite: EvidenceSuite): Array<EvidenceMetric & { headline: boolean }> {
  const rows: Array<EvidenceMetric & { headline: boolean }> = [{ ...suite.metric, headline: true }]
  for (const item of suite.metrics) rows.push({ ...item, headline: false })
  if (suite.confidently_wrong) rows.push({ ...CONFIDENTLY_WRONG, ratio: suite.confidently_wrong, headline: false })
  if (suite.abstained) rows.push({ ...ABSTAINED, ratio: suite.abstained, headline: false })
  return rows
}

const NONE = '—'

function rateOf(row: EvidenceMetric): string {
  return row.ratio.rate === null ? NONE : formatPercent(row.ratio.rate)
}

function intervalOf(row: EvidenceMetric): string {
  return formatInterval(row.ratio) ?? NONE
}

export function SuiteSection({ suite }: { suite: EvidenceSuite }) {
  const rows = rowsOf(suite)
  const blocked = Object.entries(suite.checks_blocked_by_code).sort(([a], [b]) => a.localeCompare(b))
  const headingId = `suite-${suite.key}`

  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 id={headingId} className="text-xl font-semibold text-balance">
          {suite.label}
        </h2>
        <p className="text-sm text-fg-muted tnum">
          n = {suite.n} · {suite.source}
        </p>
        {suite.dataset ? (
          <p className="text-sm">
            Dataset: {suite.dataset.label}.{' '}
            <span className="text-fg-muted">
              {suite.dataset.held_out ? 'Held out: these questions were never offered as practice.' : 'Not a held-out set.'}
            </span>
          </p>
        ) : null}
      </div>

      {/* Tablet and up: a table with the denominator and the interval on every row. */}
      <table className="hidden w-full border-collapse text-left md:table">
        <thead>
          <tr className="text-sm text-fg-muted">
            <th scope="col" className="py-2 pr-4 font-medium">
              Metric
            </th>
            <th scope="col" className="py-2 pr-4 font-medium">
              Count
            </th>
            <th scope="col" className="py-2 pr-4 font-medium">
              Rate
            </th>
            <th scope="col" className="py-2 font-medium">
              {CI_LABEL}
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.key} className="border-t border-[color-mix(in_srgb,var(--color-fg)_15%,transparent)] align-top">
              <th scope="row" className="py-3 pr-4 font-normal">
                <span className={row.headline ? 'font-semibold' : 'font-medium'}>{row.label}</span>
                <span className="block text-sm text-fg-muted">{row.definition}</span>
              </th>
              <td className="py-3 pr-4 whitespace-nowrap tnum">{formatCount(row.ratio)}</td>
              <td className="py-3 pr-4 whitespace-nowrap tnum">{rateOf(row)}</td>
              <td className="py-3 whitespace-nowrap tnum">{intervalOf(row)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Phone: the same rows as cards. */}
      <ul className="m-0 flex list-none flex-col gap-3 p-0 md:hidden">
        {rows.map((row) => (
          <li key={row.key} className="flex flex-col gap-1 rounded-card bg-surface p-4">
            <span className={row.headline ? 'font-semibold' : 'font-medium'}>{row.label}</span>
            <span className="text-sm text-fg-muted">{row.definition}</span>
            <span className="tnum">
              {formatCount(row.ratio)} · {rateOf(row)} · {CI_LABEL} {intervalOf(row)}
            </span>
          </li>
        ))}
      </ul>

      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
        <dt className="text-fg-muted">Checks blocked</dt>
        <dd className="m-0 tnum">
          {blocked.length ? blocked.map(([code, count]) => `${code} × ${count}`).join(' · ') : 'none'}
        </dd>
        {suite.latency_ms ? (
          <>
            <dt className="text-fg-muted">Latency</dt>
            <dd className="m-0 tnum">{formatLatency(suite.latency_ms)}</dd>
          </>
        ) : null}
        {suite.cost ? (
          <>
            <dt className="text-fg-muted">Cost</dt>
            <dd className="m-0 tnum">
              {suite.cost.per_attempt_usd === null ? NONE : `${formatUsd(suite.cost.per_attempt_usd)} per attempt`}
              {suite.cost.per_learner_week_usd === null ? '' : ` · ${formatUsd(suite.cost.per_learner_week_usd)} per learner-week`}
              <span className="block text-fg-muted">Assumes {suite.cost.assumption}.</span>
            </dd>
          </>
        ) : null}
      </dl>
    </section>
  )
}
