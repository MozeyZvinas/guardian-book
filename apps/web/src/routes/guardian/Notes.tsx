import { useEffect, useState } from 'react'
import type { MeResponse } from '@guardian-book/shared'
import { ApiRequestError } from '../../api/client'
import { guardianNotes, type GuardianNote } from '../../api/guardian'
import { RequireRole } from '../../app/RequireRole'
import { FormError } from '../../components/Form'
import { shortDate } from '../../lib/dates'
import { GuardianShell } from './GuardianShell'
import { ShareRow } from './ShareRow'
import { TranslatedText, isPending, shownText } from './TranslatedText'

/**
 * G2 · Notes (spec 05 §4.3; B12): sent teacher notes, newest first; nothing before `sent`.
 * Each note in the parent's language with the AI label and Show English, and Share to
 * WhatsApp. While a translation is on its way the list refreshes a few times.
 */
export function GuardianNotes() {
  return <RequireRole roles={['guardian']}>{(me) => <NotesScreen me={me} />}</RequireRole>
}

const POLL_MS = 3000
const POLL_LIMIT = 8

function NotesScreen({ me }: { me: MeResponse }) {
  const [notes, setNotes] = useState<GuardianNote[] | null>(null)
  const [error, setError] = useState<unknown>(null)
  const [version, setVersion] = useState(0)
  const [polls, setPolls] = useState(0)

  useEffect(() => {
    let cancelled = false
    guardianNotes()
      .then((result) => {
        if (!cancelled) setNotes(result.notes)
      })
      .catch((err: unknown) => {
        if (cancelled) return
        // Until the notes home lands (B07) the route answers 404: an empty list, not an error.
        if (err instanceof ApiRequestError && err.status === 404) setNotes([])
        else setError(err)
      })
    return () => {
      cancelled = true
    }
  }, [version])

  const pending = notes?.some((note) => isPending(note.translation)) ?? false
  useEffect(() => {
    if (!pending || polls >= POLL_LIMIT) return
    const timer = setTimeout(() => {
      setPolls((count) => count + 1)
      setVersion((count) => count + 1)
    }, POLL_MS)
    return () => clearTimeout(timer)
  }, [pending, polls])

  return (
    <GuardianShell me={me}>
      <h1 className="text-display font-semibold text-balance">Notes</h1>
      {notes === null && !error ? <p className="text-fg-muted">Loading…</p> : null}
      {notes && notes.length === 0 ? <p className="text-fg-muted">No notes yet. When the teacher sends one, it appears here with her name or “Teacher-reviewed”.</p> : null}
      {notes && notes.length > 0 ? (
        <ul className="m-0 flex list-none flex-col gap-2 p-0">
          {notes.map((note) => (
            <li key={note.id} className="flex flex-col gap-2 rounded-card bg-surface p-4">
              <span className="inline-flex w-fit items-center rounded-full bg-green px-2.5 py-0.5 text-xs font-medium text-white">{note.label}</span>
              <TranslatedText english={note.text} translation={note.translation} />
              <span className="text-xs text-fg-muted">
                {note.teacher.nickname} · about {note.learner.nickname} · {shortDate(note.sentAt)}
              </span>
              <ShareRow nickname={note.learner.nickname} message={shownText(note.text, note.translation)} />
            </li>
          ))}
        </ul>
      ) : null}
      <FormError error={error} />
    </GuardianShell>
  )
}
