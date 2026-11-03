import { useEffect, useState, type ChangeEvent, type FormEvent } from 'react'
import { Link, useParams } from 'react-router'
import type { CalendarEventView, MeResponse } from '@guardian-book/shared'
import { calendar as fetchCalendar, createInput, decideEvent } from '../../../api/practice'
import { RequireRole } from '../../../app/RequireRole'
import { CalendarEventRow } from '../../../components/CalendarEventRow'
import { Button, Card, Field, FormError } from '../../../components/Form'
import { Page } from '../../../components/Page'
import { StatusChip } from '../../../components/StatusChip'
import { prepareUpload } from '../../../lib/imagePrep'
import { NOTICE_MESSAGE, useNoticeFollow } from '../../learner/calendar/Calendar'

/**
 * T5 · Class notice (spec 05 §4.4): upload a timetable or notice (photo or PDF), or paste
 * its text; the events appear with their source lines; Confirm / Reject each; then
 * "Published to n learners and m parents".
 */
export function TeacherNotice() {
  return <RequireRole roles={['teacher']}>{(me) => <NoticeScreen me={me} />}</RequireRole>
}

function NoticeScreen({ me }: { me: MeResponse }) {
  const { id: classId = '' } = useParams()
  const cls = me.classes.find((c) => c.id === classId)
  const [events, setEvents] = useState<CalendarEventView[] | null>(null)
  const [error, setError] = useState<unknown>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [version, setVersion] = useState(0)
  const [inputId, setInputId] = useState<string | null>(null)
  const [published, setPublished] = useState<{ learners: number; guardians: number } | null>(null)
  const [file, setFile] = useState<{ blob: Blob; filename: string } | null>(null)
  const noticeState = useNoticeFollow(inputId, () => setVersion((n) => n + 1))

  useEffect(() => {
    if (!classId) return
    fetchCalendar(`class:${classId}`)
      .then((result) => setEvents(result.events))
      .catch((err: unknown) => setError(err))
  }, [classId, version])

  async function onFile(event: ChangeEvent<HTMLInputElement>) {
    const chosen = event.target.files?.[0]
    if (!chosen) return
    setFile(await prepareUpload(chosen))
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const text = String(new FormData(event.currentTarget).get('text') ?? '').trim()
    if (!text && !file) {
      setError(new Error('Paste the notice, or choose a photo or PDF.'))
      return
    }
    setBusy('upload')
    setError(null)
    setPublished(null)
    try {
      const result = await createInput(
        { kind: 'notice', classId, idempotencyKey: crypto.randomUUID(), ...(text && !file ? { text } : {}) },
        file?.blob ?? null,
        file?.filename,
      )
      setInputId(result.input.id)
      setFile(null)
      event.currentTarget.reset()
    } catch (err) {
      setError(err)
    } finally {
      setBusy(null)
    }
  }

  async function decide(eventId: string, decision: 'confirm' | 'reject') {
    setBusy(eventId)
    setError(null)
    try {
      const result = await decideEvent(eventId, decision)
      if (result.published) setPublished(result.published)
      setVersion((n) => n + 1)
    } catch (err) {
      setError(err)
    } finally {
      setBusy(null)
    }
  }

  if (!cls) {
    return (
      <Page>
        <h1 className="text-display font-semibold text-balance">Class notice</h1>
        <p className="text-fg-muted">
          That class is not yours. <Link to="/teacher">My classes</Link>
        </p>
      </Page>
    )
  }

  const proposed = (events ?? []).filter((e) => e.status === 'proposed')
  const confirmed = (events ?? []).filter((e) => e.status === 'confirmed')

  return (
    <Page
      footer={
        <p>
          <Link to="/teacher">My classes</Link>
        </p>
      }
    >
      <p className="m-0 text-sm text-fg-muted">{cls.name}</p>
      <h1 className="text-display font-semibold text-balance">Class notice</h1>
      <p className="text-fg-muted">Upload a timetable or notice. The dates come out with the line they were read from; you confirm each one before anyone sees it.</p>

      <Card title="Upload a notice">
        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <Field label="Photo or PDF" htmlFor="notice-file" hint={file ? `Ready: ${file.filename}` : 'JPEG, PNG, WebP or PDF, up to 8 MB.'}>
            <input id="notice-file" type="file" accept="image/jpeg,image/png,image/webp,application/pdf" onChange={onFile} className="block w-full text-sm" />
          </Field>
          <Field label="Or paste the text" htmlFor="notice-text">
            <textarea id="notice-text" name="text" rows={5} maxLength={4000} className="w-full rounded-card border border-fg-muted/50 bg-ground px-3 py-2 text-base text-fg placeholder:text-fg-muted focus-visible:border-action" placeholder={'Grade 12 November timetable\nMathematics Paper 1: Friday 20 November, 09:00\n…'} />
          </Field>
          <div>
            <Button type="submit" disabled={busy === 'upload'}>
              {busy === 'upload' ? 'Uploading…' : 'Read the notice'}
            </Button>
          </div>
        </form>
        {noticeState && NOTICE_MESSAGE[noticeState] ? (
          <p role="status" aria-live="polite" className="m-0 text-sm">
            {NOTICE_MESSAGE[noticeState]}
            {noticeState === 'unsupported_pdf' ? (
              <>
                {' '}
                <StatusChip status="PLANNED" />
              </>
            ) : null}
          </p>
        ) : null}
      </Card>

      {published ? (
        <p role="status" className="rounded-card bg-[color-mix(in_srgb,var(--color-progress)_10%,var(--color-ground))] p-3 tnum">
          <span aria-hidden="true">● </span>Published to {published.learners} {published.learners === 1 ? 'learner' : 'learners'} and {published.guardians}{' '}
          {published.guardians === 1 ? 'parent' : 'parents'}.
        </p>
      ) : null}

      {proposed.length > 0 ? (
        <section aria-labelledby="t-proposed" className="flex flex-col gap-3">
          <h2 id="t-proposed" className="text-lg font-semibold">
            Please confirm
          </h2>
          <ul className="m-0 flex list-none flex-col gap-2 p-0">
            {proposed.map((event) => (
              <CalendarEventRow key={event.id} event={event} busy={busy === event.id} onDecide={(decision) => decide(event.id, decision)} />
            ))}
          </ul>
        </section>
      ) : null}

      <section aria-labelledby="t-published" className="flex flex-col gap-3">
        <h2 id="t-published" className="text-lg font-semibold">
          Published to the class
        </h2>
        {events !== null && confirmed.length === 0 ? <p className="text-fg-muted">Nothing yet.</p> : null}
        <ul className="m-0 flex list-none flex-col gap-2 p-0">
          {confirmed.map((event) => (
            <CalendarEventRow key={event.id} event={event} busy={busy === event.id} onDecide={(decision) => decide(event.id, decision)} />
          ))}
        </ul>
      </section>
      <FormError error={error} />
    </Page>
  )
}
