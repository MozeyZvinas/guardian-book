import { useState, type FormEvent } from 'react'
import { Link, useParams } from 'react-router'
import { skillLabel, type GapView, type InterventionOutcome, type InterventionView, type MeResponse, type PictureResponse } from '@guardian-book/shared'
import { createIntervention, interventions as fetchInterventions, picture as fetchPicture, patchIntervention } from '../../../api/teacher'
import { RequireRole } from '../../../app/RequireRole'
import { Button, Card, Field, FormError, TextInput } from '../../../components/Form'
import { NotMine, TeacherShell, datePlus, formatDate, formatWhen, useLoad } from '../shell/TeacherShell'

/**
 * T2 · Class picture (spec 05 §4.4, §9; brief B07 §2): shared gaps ("6 of 14 lost the mark
 * at step 2 of factorising"), who needs you, the counts behind the queue and draft notes,
 * the notice, and the Interventions panel: Assign from a gap (learners, one line, a
 * follow-up date) and Close (an outcome, shown with the follow-up check as evidence).
 */
export function TeacherPicture() {
  return <RequireRole roles={['teacher']}>{(me) => <PictureScreen me={me} />}</RequireRole>
}

const OUTCOME_LABEL: Record<InterventionOutcome, string> = { improved: 'Improved', no_change: 'No change', needs_more: 'Needs more' }

function PictureScreen({ me }: { me: MeResponse }) {
  const { id: classId = '' } = useParams()
  const cls = me.classes.find((c) => c.id === classId)
  const pictureLoad = useLoad(() => fetchPicture(classId), classId)
  const interventionsLoad = useLoad(() => fetchInterventions(classId), classId)
  const reloadAll = () => {
    pictureLoad.reload()
    interventionsLoad.reload()
  }
  if (!cls) {
    return (
      <TeacherShell me={me} title="Class picture">
        <NotMine />
      </TeacherShell>
    )
  }
  const data = pictureLoad.data
  return (
    <TeacherShell me={me} classId={classId} title={`${cls.name} · class picture`} eyebrow="Who needs you, and for what">
      {pictureLoad.error ? <FormError error={pictureLoad.error} /> : null}
      {!data && !pictureLoad.error ? <p className="text-fg-muted">Loading…</p> : null}
      {data ? (
        <>
          <nav aria-label="Class" className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
            <Link to={`/teacher/classes/${classId}/queue`} className="tnum">
              Confirm queue · {data.counts.queue} waiting
            </Link>
            <Link to={`/teacher/classes/${classId}/notes`} className="tnum">
              Notes home · {data.counts.draftNotes} {data.counts.draftNotes === 1 ? 'draft' : 'drafts'}
            </Link>
            <Link to={`/teacher/classes/${classId}/guidelines`}>Guidelines</Link>
            <Link to={`/teacher/classes/${classId}/notice`}>Upload a notice</Link>
          </nav>

          <div className="grid gap-6 lg:grid-cols-2">
            <Card title="Shared gaps">
              {data.gaps.length === 0 ? <p className="m-0 text-sm text-fg-muted">{data.class.learnerCount === 0 ? 'No learners have joined yet.' : 'No shared gap yet. Gaps appear once results are confirmed or the model is sure.'}</p> : null}
              <ul className="m-0 flex list-none flex-col gap-3 p-0">
                {data.gaps.map((gap) => (
                  <GapRow key={gap.skillTag} gap={gap} picture={data} classId={classId} onChanged={reloadAll} />
                ))}
              </ul>
            </Card>

            <Card title="Needs you">
              {data.needsYou.length === 0 ? <p className="m-0 text-sm text-fg-muted">Nobody is waiting on you. Everything is confirmed.</p> : null}
              <ul className="m-0 flex list-none flex-col gap-2 p-0">
                {data.needsYou.map((row) => (
                  <li key={row.learner.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                    <Link to={`/teacher/learners/${row.learner.id}`} className="font-medium">
                      {row.learner.nickname}
                    </Link>
                    <span className="text-fg-muted tnum">
                      {row.uncertain > 0 ? `${row.uncertain} not sure` : ''}
                      {row.uncertain > 0 && row.repeatedSkills.length > 0 ? ' · ' : ''}
                      {row.repeatedSkills.length > 0 ? `repeated: ${row.repeatedSkills.map((tag) => skillLabel(tag, 'teacher')).join(', ')}` : ''}
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
          </div>

          <InterventionsPanel rows={interventionsLoad.data?.interventions ?? null} error={interventionsLoad.error} onChanged={reloadAll} />

          <Card title={`Learners · ${data.class.learnerCount}`}>
            {data.members.length === 0 ? <p className="m-0 text-sm text-fg-muted">Share the class code and learners appear here.</p> : null}
            <ul className="m-0 flex list-none flex-wrap gap-x-4 gap-y-1 p-0 text-sm">
              {data.members.map((m) => (
                <li key={m.id}>
                  <Link to={`/teacher/learners/${m.id}`}>{m.nickname}</Link>
                </li>
              ))}
            </ul>
          </Card>
        </>
      ) : null}
    </TeacherShell>
  )
}

function GapRow({ gap, picture, classId, onChanged }: { gap: GapView; picture: PictureResponse; classId: string; onChanged: () => void }) {
  const [open, setOpen] = useState(false)
  const [chosen, setChosen] = useState<Set<string>>(() => new Set(gap.learnerIds))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const [done, setDone] = useState<number | null>(null)

  async function assign(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const action = String(form.get('action') ?? '').trim()
    const followUpOn = String(form.get('followUpOn') ?? '')
    if (chosen.size === 0) {
      setError(new Error('Choose at least one learner.'))
      return
    }
    setBusy(true)
    setError(null)
    try {
      for (const learnerId of chosen) await createIntervention({ learnerId, classId, skillTag: gap.skillTag, action, followUpOn })
      setDone(chosen.size)
      setOpen(false)
      onChanged()
    } catch (err) {
      setError(err)
    } finally {
      setBusy(false)
    }
  }

  const words = skillLabel(gap.skillTag, 'teacher')
  return (
    <li className="flex flex-col gap-2 rounded-card bg-ground p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="m-0 font-medium tnum">
            {gap.learners} of {gap.of} lost the mark{gap.example ? ` at step ${gap.example.stepNo} of ${words.toLowerCase()}` : ` on ${words.toLowerCase()}`}
          </p>
          {gap.example ? <p className="m-0 font-serif text-sm text-fg-muted">{gap.example.criterion}</p> : null}
          <p className="m-0 text-sm text-fg-muted">{picture.members.filter((m) => gap.learnerIds.includes(m.id)).map((m) => m.nickname).join(', ')}</p>
        </div>
        <Button type="button" variant={open ? 'quiet' : 'primary'} onClick={() => setOpen((v) => !v)}>
          {open ? 'Cancel' : 'Assign'}
        </Button>
      </div>
      {done !== null && !open ? (
        <p role="status" className="m-0 text-sm">
          <span aria-hidden="true" className="text-progress">
            ●{' '}
          </span>
          Assigned to {done} {done === 1 ? 'learner' : 'learners'}. The check-in lands on their Today on the follow-up date.
        </p>
      ) : null}
      {open ? (
        <form onSubmit={assign} className="flex flex-col gap-3 border-t border-fg-muted/20 pt-3">
          <fieldset className="m-0 border-0 p-0">
            <legend className="mb-1 text-sm font-medium">Learners</legend>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
              {picture.members.map((m) => (
                <label key={m.id} className="inline-flex min-h-11 items-center gap-1.5">
                  <input
                    type="checkbox"
                    checked={chosen.has(m.id)}
                    onChange={(e) =>
                      setChosen((current) => {
                        const next = new Set(current)
                        if (e.target.checked) next.add(m.id)
                        else next.delete(m.id)
                        return next
                      })
                    }
                  />
                  {m.nickname}
                </label>
              ))}
            </div>
          </fieldset>
          <Field label="One line: what you will do" htmlFor={`action-${gap.skillTag}`}>
            <TextInput id={`action-${gap.skillTag}`} name="action" maxLength={300} required placeholder={`Redo one ${words.toLowerCase()} question with me at break.`} />
          </Field>
          <Field label="Follow-up check on" htmlFor={`follow-${gap.skillTag}`} hint="The learner gets a check-in on that day: one question, no hints.">
            <TextInput id={`follow-${gap.skillTag}`} name="followUpOn" type="date" defaultValue={datePlus(2)} required />
          </Field>
          <FormError error={error} />
          <div>
            <Button type="submit" disabled={busy}>
              {busy ? 'Assigning…' : `Assign to ${chosen.size} ${chosen.size === 1 ? 'learner' : 'learners'}`}
            </Button>
          </div>
        </form>
      ) : null}
    </li>
  )
}

function InterventionsPanel({ rows, error, onChanged }: { rows: InterventionView[] | null; error: unknown; onChanged: () => void }) {
  return (
    <Card title="Interventions">
      <p className="m-0 text-sm text-fg-muted">Open first, by follow-up date. Closing asks how it went and shows the follow-up check as evidence.</p>
      {error ? <FormError error={error} /> : null}
      {rows && rows.length === 0 ? <p className="m-0 text-sm text-fg-muted">None yet. Assign one from a shared gap.</p> : null}
      <ul className="m-0 flex list-none flex-col gap-2 p-0" aria-label="Interventions">
        {(rows ?? []).map((row) => (
          <InterventionRow key={row.id} row={row} onChanged={onChanged} />
        ))}
      </ul>
    </Card>
  )
}

function InterventionRow({ row, onChanged }: { row: InterventionView; onChanged: () => void }) {
  const [closing, setClosing] = useState(false)
  const [outcome, setOutcome] = useState<InterventionOutcome | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const closed = row.status === 'closed'

  async function close(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!outcome) {
      setError(new Error('Say how it went.'))
      return
    }
    setBusy(true)
    setError(null)
    try {
      await patchIntervention(row.id, { status: 'closed', outcome })
      setClosing(false)
      onChanged()
    } catch (err) {
      setError(err)
    } finally {
      setBusy(false)
    }
  }

  return (
    <li className={['flex flex-col gap-2 rounded-card bg-ground p-3 text-sm', closed ? 'text-fg-muted' : ''].join(' ')}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="m-0 font-medium text-fg">
            <Link to={`/teacher/learners/${row.learner.id}`}>{row.learner.nickname}</Link> · {skillLabel(row.skillTag, 'teacher')}
          </p>
          <p className="m-0">{row.action}</p>
          <p className="m-0 text-fg-muted tnum">
            {row.owner.nickname} · follow-up {formatDate(row.followUpOn)} · <span aria-hidden="true">{closed ? '● ' : '◯ '}</span>
            {closed ? `closed · ${row.outcome ? OUTCOME_LABEL[row.outcome] : ''}` : row.status}
          </p>
        </div>
        {!closed ? (
          <Button type="button" variant="quiet" onClick={() => setClosing((v) => !v)}>
            {closing ? 'Cancel' : 'Close'}
          </Button>
        ) : null}
      </div>
      {closing ? (
        <form onSubmit={close} className="flex flex-col gap-3 border-t border-fg-muted/20 pt-3">
          <div>
            <p className="m-0 mb-1 font-medium text-fg">Evidence since you assigned it</p>
            {row.evidence.length === 0 ? (
              <p className="m-0 text-fg-muted">No follow-up check on this skill yet. Closing needs one.</p>
            ) : (
              <ul className="m-0 flex list-none flex-col gap-1 p-0">
                {row.evidence.map((e) => (
                  <li key={e.eventId} className="tnum">
                    <span aria-hidden="true" className={e.correct ? 'text-progress' : 'text-fg'}>
                      {e.correct ? '✓ ' : '✗ '}
                    </span>
                    {e.kind.replace(/_/g, ' ')}
                    {e.mode ? ` · ${e.mode}` : ''} · {e.correct ? 'correct' : 'not yet'} · {formatWhen(e.occurredAt)}
                  </li>
                ))}
              </ul>
            )}
          </div>
          <fieldset className="m-0 flex flex-wrap items-center gap-3 border-0 p-0">
            <legend className="float-left mr-2 font-medium text-fg">How did it go?</legend>
            {(Object.keys(OUTCOME_LABEL) as InterventionOutcome[]).map((o) => (
              <label key={o} className="inline-flex min-h-11 items-center gap-1.5 text-fg">
                <input type="radio" name={`outcome-${row.id}`} value={o} checked={outcome === o} onChange={() => setOutcome(o)} />
                {OUTCOME_LABEL[o]}
              </label>
            ))}
          </fieldset>
          <FormError error={error} />
          <div>
            <Button type="submit" disabled={busy || row.evidence.length === 0}>
              {busy ? 'Closing…' : 'Close intervention'}
            </Button>
          </div>
        </form>
      ) : null}
    </li>
  )
}
