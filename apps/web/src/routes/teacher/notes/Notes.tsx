import { useState, type FormEvent } from 'react'
import { useParams } from 'react-router'
import type { DraftNotesResponse, MeResponse, NoteStatus, NoteView } from '@guardian-book/shared'
import { approveNote, createNote, draftNotes, notes as fetchNotes, picture as fetchPicture, sendNote } from '../../../api/teacher'
import { RequireRole } from '../../../app/RequireRole'
import { Button, Card, Field, FormError, Select } from '../../../components/Form'
import { OriginChip } from '../shell/ChecksList'
import { ClassEyebrow, NotMine, TeacherShell, formatWhen, useLoad } from '../shell/TeacherShell'

/**
 * T4 · Notes home (spec 05 §4.4; brief B07 §4): one drafted note per guardian of a learner
 * with a lost step this week; Edit → Approve → Send. The origin label stays internal; a
 * guardian sees nothing before `sent`, and then "Teacher-reviewed" or the teacher's name.
 */
export function TeacherNotes() {
  return <RequireRole roles={['teacher']}>{(me) => <NotesScreen me={me} />}</RequireRole>
}

const SKIP_WORDS: Record<DraftNotesResponse['skipped'][number]['reason'], string> = {
  no_guardian: 'no parent linked',
  no_lost_step: 'nothing slipped this week',
  already_drafted: 'already has a note this week',
  model_not_configured: 'model not configured; write one yourself',
  uncertain: 'the draft did not pass the checks; write one yourself',
  budget_exhausted: 'today’s model budget is used up',
}

const FILTERS: Array<{ key: 'all' | NoteStatus; label: string }> = [
  { key: 'all', label: 'All' },
  { key: 'draft', label: 'Draft' },
  { key: 'approved', label: 'Approved' },
  { key: 'sent', label: 'Sent' },
]

function NotesScreen({ me }: { me: MeResponse }) {
  const { id: classId = '' } = useParams()
  const cls = me.classes.find((c) => c.id === classId)
  const notesLoad = useLoad(() => fetchNotes(classId), classId)
  const pictureLoad = useLoad(() => fetchPicture(classId), classId)
  const [filter, setFilter] = useState<'all' | NoteStatus>('all')
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<unknown>(null)
  const [drafted, setDrafted] = useState<DraftNotesResponse | null>(null)

  async function run(label: string, work: () => Promise<unknown>) {
    setBusy(label)
    setError(null)
    try {
      await work()
      notesLoad.reload()
    } catch (err) {
      setError(err)
    } finally {
      setBusy(null)
    }
  }

  async function onWrite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget
    const data = new FormData(form)
    const learnerId = String(data.get('learnerId') ?? '')
    const text = String(data.get('text') ?? '').trim()
    await run('write', async () => {
      await createNote({ learnerId, text })
      form.reset()
    })
  }

  if (!cls) {
    return (
      <TeacherShell me={me} title="Notes home">
        <NotMine />
      </TeacherShell>
    )
  }
  const list = (notesLoad.data?.notes ?? []).filter((note) => filter === 'all' || note.status === filter)
  return (
    <TeacherShell me={me} classId={classId} title="Notes home" eyebrow={<ClassEyebrow classId={classId} name={cls.name} />}>
      <p className="m-0 text-fg-muted">A short note to each parent about their own child’s week. Drafts are suggestions; nothing reaches a parent until you approve it and send it.</p>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" onClick={() => run('draft', async () => setDrafted(await draftNotes(classId)))} disabled={busy !== null}>
          {busy === 'draft' ? 'Drafting…' : 'Draft notes for this week'}
        </Button>
        {drafted ? (
          <p role="status" className="m-0 text-sm text-fg-muted tnum">
            {drafted.notes.length} {drafted.notes.length === 1 ? 'draft' : 'drafts'} written
            {drafted.skipped.length > 0 ? ` · skipped: ${drafted.skipped.map((s) => `${s.learner.nickname} (${SKIP_WORDS[s.reason]})`).join('; ')}` : ''}
          </p>
        ) : null}
      </div>

      <Card title="Write a note yourself">
        <form onSubmit={onWrite} className="flex flex-col gap-3">
          <Field label="About" htmlFor="note-learner">
            <Select id="note-learner" name="learnerId" required defaultValue="">
              <option value="" disabled>
                Choose a learner
              </option>
              {(pictureLoad.data?.members ?? []).map((m) => (
                <option key={m.id} value={m.id}>
                  {m.nickname}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Your note to the parent" htmlFor="note-text" hint="Up to 600 characters. It goes to every parent linked to this learner.">
            <textarea id="note-text" name="text" rows={3} maxLength={600} required className="w-full rounded-card border border-fg-muted/50 bg-ground px-3 py-2 text-base text-fg placeholder:text-fg-muted focus-visible:border-action" />
          </Field>
          <div>
            <Button type="submit" variant="quiet" disabled={busy !== null}>
              {busy === 'write' ? 'Saving…' : 'Save as draft'}
            </Button>
          </div>
        </form>
      </Card>

      <div role="radiogroup" aria-label="Show" className="flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <button key={f.key} type="button" role="radio" aria-checked={filter === f.key} onClick={() => setFilter(f.key)} className={['min-h-11 rounded-full px-4 text-sm font-medium', filter === f.key ? 'bg-fg text-ground' : 'bg-surface text-fg ring-1 ring-fg-muted/40'].join(' ')}>
            {f.label}
          </button>
        ))}
      </div>
      {notesLoad.error ? <FormError error={notesLoad.error} /> : null}
      {notesLoad.data && list.length === 0 ? <p className="text-fg-muted">No notes {filter === 'all' ? 'yet' : `in “${filter}”`}.</p> : null}
      <ul className="m-0 flex list-none flex-col gap-3 p-0" aria-label="Notes">
        {list.map((note) => (
          <NoteCard key={`${note.id}:${note.status}:${note.origin}`} note={note} busy={busy} onApprove={(text) => run(`approve:${note.id}`, () => approveNote(note.id, text))} onSend={() => run(`send:${note.id}`, () => sendNote(note.id))} />
        ))}
      </ul>
      <FormError error={error} />
    </TeacherShell>
  )
}

function NoteCard({ note, busy, onApprove, onSend }: { note: NoteView; busy: string | null; onApprove: (text: string) => void; onSend: () => void }) {
  const [text, setText] = useState(note.finalText ?? note.draftText)
  const editable = note.status !== 'sent'
  const edited = text.trim() !== (note.finalText ?? note.draftText).trim()
  return (
    <li className="flex flex-col gap-3 rounded-card bg-surface p-4">
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <p className="m-0">
          <span className="font-medium">{note.learner.nickname}</span> <span className="text-fg-muted">→ {note.guardian.nickname}</span>
        </p>
        <span className="flex flex-wrap items-center gap-2 text-fg-muted tnum">
          <OriginChip origin={note.origin} />
          <span>
            <span aria-hidden="true">{note.status === 'sent' ? '● ' : note.status === 'approved' ? '◐ ' : '◯ '}</span>
            {note.status === 'sent' && note.sentAt ? `sent ${formatWhen(note.sentAt)}` : note.status === 'approved' ? 'approved · not sent' : 'draft'}
          </span>
        </span>
      </div>
      {editable ? (
        <label className="flex flex-col gap-1 text-sm font-medium">
          <span className="sr-only">The note to {note.guardian.nickname}</span>
          <textarea value={text} onChange={(e) => setText(e.target.value)} rows={4} maxLength={600} aria-label={`Note for ${note.learner.nickname}`} className="w-full rounded-card border border-fg-muted/50 bg-ground px-3 py-2 text-base font-normal text-fg focus-visible:border-action" />
        </label>
      ) : (
        <p className="m-0 whitespace-pre-wrap">{note.finalText ?? note.draftText}</p>
      )}
      {editable ? (
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" variant={note.status === 'approved' && !edited ? 'quiet' : 'primary'} onClick={() => onApprove(text.trim())} disabled={busy !== null || text.trim().length === 0}>
            {busy === `approve:${note.id}` ? 'Approving…' : note.status === 'approved' && !edited ? 'Approved' : edited ? 'Approve my edit' : 'Approve'}
          </Button>
          <Button type="button" variant={note.status === 'approved' && !edited ? 'primary' : 'quiet'} onClick={onSend} disabled={busy !== null || note.status !== 'approved' || edited}>
            {busy === `send:${note.id}` ? 'Sending…' : 'Send'}
          </Button>
          {note.status === 'draft' && note.origin === 'ai_suggested' ? <span className="text-sm text-fg-muted">A suggestion. Read it as the parent would before you approve it.</span> : null}
        </div>
      ) : null}
    </li>
  )
}
