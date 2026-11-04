import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import type { CalendarEventView, NoticeState } from '@guardian-book/shared'
import { calendar as fetchCalendar, decideEvent, getInput } from '../../../api/practice'
import { RequireRole } from '../../../app/RequireRole'
import { CalendarEventRow } from '../../../components/CalendarEventRow'
import { FormError } from '../../../components/Form'
import { LearnerShell } from '../../../components/LearnerShell'
import { StatusChip } from '../../../components/StatusChip'

/**
 * L7 · Calendar (spec 05 §4.2; B16 §5, §7): confirmed events (class and own) with their
 * source line; proposed learner-scope events with Confirm / Reject. After bringing a notice
 * the page follows the extraction until it settles; a notice with no dates says so, and the
 * failure message is kept for real failures.
 */
export function Calendar() {
  return <RequireRole roles={['learner']}>{() => <CalendarScreen />}</RequireRole>
}

export const NOTICE_MESSAGE: Record<NoticeState, string> = {
  none: '',
  extracting: 'Reading the notice…',
  extracted: 'Dates found. Anything marked “please confirm” needs a tap.',
  not_a_notice: 'I couldn’t find any dates on this. Is it a school notice?',
  uncertain: 'The dates could not be read with confidence. Nothing was added; try a clearer photo.',
  failed: 'The notice could not be read right now. Nothing was added; try again in a minute.',
  unsupported_pdf: 'The PDF is saved. Reading PDFs is not built yet; snap a photo of the notice to get the dates.',
}

/** How many polls in a row may fail (a phone losing signal) before the page gives up. */
export const MAX_POLL_FAILURES = 5

export function useNoticeFollow(inputId: string | null, onSettled: () => void) {
  const [state, setState] = useState<NoticeState | null>(null)
  useEffect(() => {
    if (!inputId) return
    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | null = null
    let failures = 0
    async function poll() {
      try {
        const result = await getInput(inputId ?? '')
        if (cancelled) return
        failures = 0
        setState(result.input.notice.state)
        if (result.input.notice.state === 'extracting') timer = setTimeout(poll, 2_000)
        else onSettled()
      } catch {
        if (cancelled) return
        // A dropped request is not a failed read (B16 §5): keep polling a few times first.
        failures += 1
        if (failures < MAX_POLL_FAILURES) timer = setTimeout(poll, 2_000)
        else setState('failed')
      }
    }
    void poll()
    return () => {
      cancelled = true
      if (timer) clearTimeout(timer)
    }
    // onSettled is stable enough per mount; the input ID drives the follow.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inputId])
  return state
}

function CalendarScreen() {
  const [params] = useSearchParams()
  const inputId = params.get('input')
  const [events, setEvents] = useState<CalendarEventView[] | null>(null)
  const [error, setError] = useState<unknown>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [version, setVersion] = useState(0)
  const noticeState = useNoticeFollow(inputId, () => setVersion((n) => n + 1))

  useEffect(() => {
    fetchCalendar()
      .then((result) => setEvents(result.events))
      .catch((err: unknown) => setError(err))
  }, [version])

  async function decide(eventId: string, decision: 'confirm' | 'reject') {
    setBusy(eventId)
    setError(null)
    try {
      await decideEvent(eventId, decision)
      setVersion((n) => n + 1)
    } catch (err) {
      setError(err)
    } finally {
      setBusy(null)
    }
  }

  const proposed = (events ?? []).filter((event) => event.status === 'proposed')
  const confirmed = (events ?? []).filter((event) => event.status === 'confirmed')

  return (
    <LearnerShell>
      <div className="flex flex-col gap-2">
        <h1 className="text-display font-semibold text-balance">Calendar</h1>
        <p className="text-fg-muted">Dates read from notices you or your teacher bring. Confirm anything we were not sure about.</p>
      </div>
      {noticeState && NOTICE_MESSAGE[noticeState] ? (
        <p role="status" aria-live="polite" className="rounded-card bg-surface p-3">
          {noticeState === 'extracting' ? <span aria-hidden="true" className="mr-2 inline-block h-2 w-2 animate-pulse rounded-full bg-progress" /> : null}
          {NOTICE_MESSAGE[noticeState]}
          {noticeState === 'unsupported_pdf' ? (
            <>
              {' '}
              <StatusChip status="PLANNED" />
            </>
          ) : null}
        </p>
      ) : null}

      {events === null && !error ? <p className="text-fg-muted">Loading…</p> : null}

      {proposed.length > 0 ? (
        <section aria-labelledby="proposed-heading" className="flex flex-col gap-3">
          <h2 id="proposed-heading" className="text-lg font-semibold">
            Please confirm
          </h2>
          <ul className="m-0 flex list-none flex-col gap-2 p-0">
            {proposed.map((event) => (
              <CalendarEventRow key={event.id} event={event} busy={busy === event.id} onDecide={(decision) => decide(event.id, decision)} />
            ))}
          </ul>
        </section>
      ) : null}

      <section aria-labelledby="coming-heading" className="flex flex-col gap-3">
        <h2 id="coming-heading" className="text-lg font-semibold">
          Coming up
        </h2>
        {events !== null && confirmed.length === 0 ? (
          <p className="text-fg-muted">
            Nothing yet. <Link to="/bring">Bring a school notice</Link> and the dates appear here.
          </p>
        ) : null}
        <ul className="m-0 flex list-none flex-col gap-2 p-0">
          {confirmed.map((event) => (
            <CalendarEventRow key={event.id} event={event} busy={busy === event.id} onDecide={event.canDecide ? (decision) => decide(event.id, decision) : undefined} />
          ))}
        </ul>
      </section>
      <FormError error={error} />
    </LearnerShell>
  )
}
