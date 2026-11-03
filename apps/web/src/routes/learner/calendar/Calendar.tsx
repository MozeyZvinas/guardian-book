import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import type { CalendarEventView, NoticeState } from '@guardian-book/shared'
import { calendar as fetchCalendar, decideEvent, getInput } from '../../../api/practice'
import { RequireRole } from '../../../app/RequireRole'
import { CalendarEventRow } from '../../../components/CalendarEventRow'
import { FormError } from '../../../components/Form'
import { LearnerLinks } from '../../../components/LearnerLinks'
import { Page } from '../../../components/Page'
import { StatusChip } from '../../../components/StatusChip'

/**
 * L7 · Calendar (spec 05 §4.2): confirmed events (class and own) with their source line;
 * proposed learner-scope events with Confirm / Reject. After bringing a notice the page
 * follows the extraction until it settles.
 */
export function Calendar() {
  return <RequireRole roles={['learner']}>{() => <CalendarScreen />}</RequireRole>
}

export const NOTICE_MESSAGE: Record<NoticeState, string> = {
  none: '',
  extracting: 'Reading the notice…',
  extracted: 'Dates found. Anything marked “please confirm” needs a tap.',
  not_a_notice: 'That did not look like a notice or timetable. Nothing was added.',
  uncertain: 'The dates could not be read with confidence. Nothing was added; try a clearer photo.',
  failed: 'The notice could not be read right now. Nothing was added; try again in a minute.',
  unsupported_pdf: 'The PDF is saved. Reading PDFs is not built yet; snap a photo of the notice to get the dates.',
}

export function useNoticeFollow(inputId: string | null, onSettled: () => void) {
  const [state, setState] = useState<NoticeState | null>(null)
  useEffect(() => {
    if (!inputId) return
    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | null = null
    async function poll() {
      try {
        const result = await getInput(inputId ?? '')
        if (cancelled) return
        setState(result.input.notice.state)
        if (result.input.notice.state === 'extracting') timer = setTimeout(poll, 2_000)
        else onSettled()
      } catch {
        if (!cancelled) setState('failed')
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
    <Page footer={<LearnerLinks />}>
      <h1 className="text-display font-semibold text-balance">Calendar</h1>
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
    </Page>
  )
}
