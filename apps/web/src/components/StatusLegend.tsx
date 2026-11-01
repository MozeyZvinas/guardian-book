import { STATUSES, STATUS_MEANING, StatusChip } from './StatusChip'

export function StatusLegend() {
  return (
    <section aria-labelledby="status-legend-heading" className="flex flex-col gap-3">
      <h2 id="status-legend-heading" className="text-sm font-medium text-fg-muted">
        Status legend
      </h2>
      <ul className="m-0 flex list-none flex-wrap gap-2 p-0">
        {STATUSES.map((status) => (
          <li key={status}>
            <StatusChip status={status} />
          </li>
        ))}
      </ul>
      <p className="text-sm text-fg-muted">
        {STATUSES.map((status, index) => (
          <span key={status}>
            {index > 0 ? ' · ' : ''}
            <span className="font-medium text-fg">{status}</span> {STATUS_MEANING[status]}
          </span>
        ))}
        .
      </p>
    </section>
  )
}
