import { useEffect, useState } from 'react'
import type { MeResponse } from '@guardian-book/shared'
import { ApiRequestError } from '../../api/client'
import { guardianNotes, type GuardianNote } from '../../api/guardian'
import { RequireRole } from '../../app/RequireRole'
import { FormError } from '../../components/Form'
import { shortDate } from '../../lib/dates'
import { GuardianShell } from './GuardianShell'

/** G2 · Notes (spec 05 §4.3): sent teacher notes, newest first; nothing before `sent`. The route is B07's. */
export function GuardianNotes() {
  return <RequireRole roles={['guardian']}>{(me) => <NotesScreen me={me} />}</RequireRole>
}

function NotesScreen({ me }: { me: MeResponse }) {
  const [notes, setNotes] = useState<GuardianNote[] | null>(null)
  const [error, setError] = useState<unknown>(null)

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
  }, [])

  return (
    <GuardianShell me={me}>
      <h1 className="text-display font-semibold text-balance">Notes</h1>
      {notes === null && !error ? <p className="text-fg-muted">Loading…</p> : null}
      {notes && notes.length === 0 ? <p className="text-fg-muted">No notes yet. When the teacher sends one, it appears here with her name or “Teacher-reviewed”.</p> : null}
      {notes && notes.length > 0 ? (
        <ul className="m-0 flex list-none flex-col gap-2 p-0">
          {notes.map((note) => (
            <li key={note.id} className="flex flex-col gap-1 rounded-card bg-surface p-4">
              <span className="inline-flex w-fit items-center rounded-full bg-green px-2.5 py-0.5 text-xs font-medium text-white">{note.label}</span>
              <p className="m-0">{note.text}</p>
              <span className="text-xs text-fg-muted">
                {note.teacher.nickname} · about {note.learner.nickname} · {shortDate(note.sentAt)}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
      <FormError error={error} />
    </GuardianShell>
  )
}
