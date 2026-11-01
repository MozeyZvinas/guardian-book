/**
 * Status labels (spec 05 §4): what is really built. Each chip pairs a glyph with the word,
 * so the meaning never rests on colour alone (A7). Teal marks LIVE; the others are ink.
 */
export const STATUSES = ['LIVE', 'SYNTHETIC', 'PROTOTYPE', 'PLANNED'] as const
export type Status = (typeof STATUSES)[number]

export const STATUS_MEANING: Record<Status, string> = {
  LIVE: 'works with real data',
  SYNTHETIC: 'works with demo data',
  PROTOTYPE: 'partly built',
  PLANNED: 'not built yet',
}

const GLYPH: Record<Status, string> = {
  LIVE: '●',
  SYNTHETIC: '◐',
  PROTOTYPE: '◯',
  PLANNED: '◌',
}

export function StatusChip({ status }: { status: Status }) {
  const live = status === 'LIVE'
  return (
    <span
      className={[
        'inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium tracking-wide tnum',
        live
          ? 'bg-[color-mix(in_srgb,var(--color-progress)_14%,var(--color-ground))] text-fg'
          : 'bg-surface text-fg-muted',
      ].join(' ')}
      title={`${status}: ${STATUS_MEANING[status]}`}
    >
      <span aria-hidden="true" className={live ? 'text-progress' : 'text-fg-muted'}>
        {GLYPH[status]}
      </span>
      {status}
    </span>
  )
}
