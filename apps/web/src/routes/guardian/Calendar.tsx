import { useEffect, useState } from 'react'
import type { CalendarEventView, MeResponse } from '@guardian-book/shared'
import { calendar as fetchCalendar } from '../../api/practice'
import { RequireRole } from '../../app/RequireRole'
import { CalendarEventRow } from '../../components/CalendarEventRow'
import { FormError } from '../../components/Form'
import { GuardianShell } from './GuardianShell'

/** G3 · Calendar (spec 05 §4.3): confirmed events for linked learners (the API serves guardians `confirmed` only). */
export function GuardianCalendar() {
  return <RequireRole roles={['guardian']}>{(me) => <CalendarScreen me={me} />}</RequireRole>
}

function CalendarScreen({ me }: { me: MeResponse }) {
  const [events, setEvents] = useState<CalendarEventView[] | null>(null)
  const [error, setError] = useState<unknown>(null)

  useEffect(() => {
    let cancelled = false
    fetchCalendar()
      .then((result) => {
        if (!cancelled) setEvents(result.events)
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err)
      })
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <GuardianShell me={me}>
      <h1 className="text-display font-semibold text-balance">Calendar</h1>
      {events === null && !error ? <p className="text-fg-muted">Loading…</p> : null}
      {events && events.length === 0 ? <p className="text-fg-muted">No confirmed dates yet. They appear here once the school or the learner confirms them.</p> : null}
      {events && events.length > 0 ? (
        <ul className="m-0 flex list-none flex-col gap-2 p-0">
          {events.map((event) => (
            <CalendarEventRow key={event.id} event={event} />
          ))}
        </ul>
      ) : null}
      <FormError error={error} />
    </GuardianShell>
  )
}
