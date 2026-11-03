import type { CalendarEventView } from '@guardian-book/shared'
import { Button } from './Form'

/** Dates on the phone, South African style. */
export function formatDay(onDate: string): string {
  const date = new Date(`${onDate}T00:00:00`)
  return date.toLocaleDateString('en-ZA', { weekday: 'short', day: 'numeric', month: 'short' })
}

/** CalendarEventRow (spec 05 §5): the event, its source line, and Confirm / Reject for the person who must decide. */
export function CalendarEventRow({
  event,
  busy,
  onDecide,
}: {
  event: CalendarEventView
  busy?: boolean
  onDecide?: (decision: 'confirm' | 'reject') => void
}) {
  const proposed = event.status === 'proposed'
  return (
    <li className={['flex flex-col gap-2 rounded-card bg-surface p-4', proposed ? 'ring-1 ring-fg/40' : ''].join(' ')}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="m-0 font-medium">{event.title}</p>
          <p className="m-0 text-sm text-fg-muted">
            {[event.subject, event.paper].filter(Boolean).join(' · ')}
            {event.subject || event.paper ? ' · ' : ''}
            {event.scopeType === 'class' ? 'class' : 'mine'}
          </p>
        </div>
        <p className="m-0 shrink-0 text-right text-sm tnum">
          <span className="block font-medium">{formatDay(event.onDate)}</span>
          <span className="block text-fg-muted">
            {proposed ? '◯ please confirm' : event.status === 'confirmed' ? '● confirmed' : '✕ rejected'}
          </span>
        </p>
      </div>
      <blockquote className="m-0 border-l-2 border-fg-muted/50 pl-3 text-sm text-fg-muted">“{event.sourceLine}”</blockquote>
      {event.canDecide && onDecide ? (
        <div className="flex flex-wrap gap-2">
          {event.status !== 'confirmed' ? (
            <Button type="button" onClick={() => onDecide('confirm')} disabled={busy}>
              Confirm
            </Button>
          ) : null}
          {event.status !== 'rejected' ? (
            <Button type="button" variant="quiet" onClick={() => onDecide('reject')} disabled={busy}>
              {event.status === 'confirmed' ? 'Remove' : 'Reject'}
            </Button>
          ) : null}
        </div>
      ) : null}
    </li>
  )
}
