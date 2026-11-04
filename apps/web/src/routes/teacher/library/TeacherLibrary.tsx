import { useState, type FormEvent } from 'react'
import { Link, useParams } from 'react-router'
import { skillLabel, type ClassPracticeView, type LibraryPaper, type MeResponse, type WhatComesUpEntry } from '@guardian-book/shared'
import { approvePaper, approveTopic, classPractice as fetchPractice, createClassPractice, libraryPapers, whatComesUp as fetchWhatComesUp } from '../../../api/library'
import { RequireRole } from '../../../app/RequireRole'
import { Button, Card, Field, FormError, TextInput } from '../../../components/Form'
import { ClassEyebrow, NotMine, TeacherShell, datePlus, formatDate, useLoad } from '../shell/TeacherShell'

/**
 * T8 · Past papers for a class (brief B17 phase B §2): approve a whole paper's guidelines
 * for the class in one action (each question is still listed in the paper view and on T7),
 * and set a paper or a topic set as class practice with a due date. It lands on learners'
 * Today and on parents' "What's coming". "What comes up" names the weight of each skill.
 */
export function TeacherLibrary() {
  return <RequireRole roles={['teacher']}>{(me) => <TeacherLibraryScreen me={me} />}</RequireRole>
}

function TeacherLibraryScreen({ me }: { me: MeResponse }) {
  const { id: classId = '' } = useParams()
  const cls = me.classes.find((c) => c.id === classId)
  const papers = useLoad(() => libraryPapers(), classId)
  const practice = useLoad(() => fetchPractice(classId), classId)
  const comesUp = useLoad(() => fetchWhatComesUp(), classId)
  if (!cls) {
    return (
      <TeacherShell me={me} title="Past papers">
        <NotMine />
      </TeacherShell>
    )
  }
  return (
    <TeacherShell me={me} classId={classId} title="Past papers" eyebrow={<ClassEyebrow classId={classId} name={cls.name} />}>
      <p className="m-0 text-fg-muted">
        Approve a whole paper for {cls.name} in one go (every question stays listed under <Link to={`/teacher/classes/${classId}/guidelines`}>Guidelines</Link>), then set it, or a topic, as class practice by a date. Practice lands on learners’ Today and parents’ “What’s coming”.
      </p>
      {papers.error ? <FormError error={papers.error} /> : null}
      {papers.data?.papers.length === 0 ? <p className="text-fg-muted">No past papers loaded yet.</p> : null}
      <ul className="m-0 flex list-none flex-col gap-3 p-0" aria-label="Papers">
        {(papers.data?.papers ?? []).map((paper) => (
          <PaperRow key={paper.path} paper={paper} classId={classId} className={cls.name} onChanged={practice.reload} />
        ))}
      </ul>

      <TopicSet classId={classId} className={cls.name} entries={comesUp.data?.entries ?? []} onChanged={practice.reload} />

      <Card title="Class practice">
        {practice.error ? <FormError error={practice.error} /> : null}
        {practice.data?.practice.length === 0 ? <p className="m-0 text-sm text-fg-muted">Nothing set yet. Approve a paper above, then set it as practice.</p> : null}
        <ul className="m-0 flex list-none flex-col gap-2 p-0" aria-label="Class practice">
          {(practice.data?.practice ?? []).map((row) => (
            <PracticeRow key={row.id} row={row} />
          ))}
        </ul>
      </Card>
    </TeacherShell>
  )
}

function PaperRow({ paper, classId, className, onChanged }: { paper: LibraryPaper; classId: string; className: string; onChanged: () => void }) {
  const [busy, setBusy] = useState<'approve' | 'practice' | null>(null)
  const [error, setError] = useState<unknown>(null)
  const [status, setStatus] = useState<string | null>(null)

  async function approve() {
    setBusy('approve')
    setError(null)
    try {
      const result = await approvePaper(classId, { subject: paper.subject, grade: paper.grade, year: paper.year, session: paper.session, paper: paper.paper })
      setStatus(result.approved > 0 ? `Approved ${result.approved} ${result.approved === 1 ? 'question' : 'questions'} for ${className}${result.alreadyApproved > 0 ? ` (${result.alreadyApproved} already were)` : ''}.` : `All ${result.alreadyApproved} questions were already approved for ${className}.`)
    } catch (err) {
      setError(err)
    } finally {
      setBusy(null)
    }
  }

  async function setPractice(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const dueOn = String(new FormData(event.currentTarget).get('dueOn') ?? '')
    setBusy('practice')
    setError(null)
    try {
      const result = await createClassPractice(classId, { kind: 'paper', paper: { subject: paper.subject, grade: paper.grade, year: paper.year, session: paper.session, paper: paper.paper }, dueOn })
      setStatus(`Set as class practice for ${className}: ${result.practice.questions} questions by ${formatDate(result.practice.dueOn)}.`)
      onChanged()
    } catch (err) {
      setError(err)
    } finally {
      setBusy(null)
    }
  }

  return (
    <li className="flex flex-col gap-3 rounded-card bg-surface p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="m-0 text-lg font-semibold">{paper.title}</h2>
          <p className="m-0 text-sm text-fg-muted tnum">
            Grade {paper.grade} · {paper.questions} {paper.questions === 1 ? 'question' : 'questions'} · {paper.marks} marks · <Link to={`/library/${paper.path}`}>Open the paper</Link>
          </p>
        </div>
        <Button type="button" onClick={() => void approve()} disabled={busy !== null}>
          {busy === 'approve' ? 'Approving…' : `Approve all for ${className}`}
        </Button>
      </div>
      <form onSubmit={setPractice} className="flex flex-wrap items-end gap-3">
        <Field label="Set as class practice, due on" htmlFor={`due-${paper.path}`}>
          <TextInput id={`due-${paper.path}`} name="dueOn" type="date" defaultValue={datePlus(7)} required className="w-auto" />
        </Field>
        <Button type="submit" variant="quiet" disabled={busy !== null}>
          {busy === 'practice' ? 'Setting…' : 'Set as practice'}
        </Button>
      </form>
      {status ? (
        <p role="status" className="m-0 text-sm">
          <span aria-hidden="true" className="text-progress">
            ●{' '}
          </span>
          {status}
        </p>
      ) : null}
      <FormError error={error} />
    </li>
  )
}

function TopicSet({ classId, className, entries, onChanged }: { classId: string; className: string; entries: WhatComesUpEntry[]; onChanged: () => void }) {
  const [skillTag, setSkillTag] = useState('')
  const [busy, setBusy] = useState<'approve' | 'practice' | null>(null)
  const [error, setError] = useState<unknown>(null)
  const [status, setStatus] = useState<string | null>(null)
  const chosen = entries.find((entry) => entry.skillTag === skillTag) ?? null

  async function approve() {
    if (!skillTag) return
    setBusy('approve')
    setError(null)
    try {
      const result = await approveTopic(classId, skillTag)
      setStatus(`${result.approved + result.alreadyApproved} ${result.title.toLowerCase()} ${result.questions === 1 ? 'question' : 'questions'} approved for ${className}.`)
    } catch (err) {
      setError(err)
    } finally {
      setBusy(null)
    }
  }

  async function setPractice(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!skillTag) return
    const dueOn = String(new FormData(event.currentTarget).get('dueOn') ?? '')
    setBusy('practice')
    setError(null)
    try {
      const result = await createClassPractice(classId, { kind: 'topic', skillTag, dueOn })
      setStatus(`Set as class practice: ${result.practice.title}, ${result.practice.questions} questions by ${formatDate(result.practice.dueOn)}.`)
      onChanged()
    } catch (err) {
      setError(err)
    } finally {
      setBusy(null)
    }
  }

  return (
    <Card title="A topic as practice">
      <p className="m-0 text-sm text-fg-muted">Every loaded past-paper question on one skill. What comes up says how much it is worth in the exam.</p>
      {entries.length === 0 ? <p className="m-0 text-sm text-fg-muted">Loads once past papers are in.</p> : null}
      <form onSubmit={setPractice} className="flex flex-col gap-3" aria-label="A topic as practice">
        <fieldset className="m-0 border-0 p-0">
          <legend className="mb-1 text-sm font-medium">Skill</legend>
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Skill">
            {entries.map((entry) => (
              <button
                key={entry.skillTag}
                type="button"
                role="radio"
                aria-checked={entry.skillTag === skillTag}
                className={['min-h-11 rounded-full px-4 text-sm font-medium', entry.skillTag === skillTag ? 'bg-fg text-ground' : 'bg-surface text-fg ring-1 ring-fg-muted/40'].join(' ')}
                onClick={() => setSkillTag(entry.skillTag)}
              >
                {entry.skillTag === skillTag ? '● ' : ''}
                {skillLabel(entry.skillTag, 'teacher')}
              </button>
            ))}
          </div>
        </fieldset>
        {chosen ? (
          <p className="m-0 text-sm text-fg-muted">
            What comes up: {chosen.sentence}. {chosen.papers} {chosen.papers === 1 ? 'paper' : 'papers'}.
          </p>
        ) : null}
        <div className="flex flex-wrap items-end gap-3">
          <Button type="button" variant="quiet" onClick={() => void approve()} disabled={busy !== null || !skillTag}>
            {busy === 'approve' ? 'Approving…' : `Approve its questions for ${className}`}
          </Button>
          <Field label="Due on" htmlFor="topic-due">
            <TextInput id="topic-due" name="dueOn" type="date" defaultValue={datePlus(7)} required className="w-auto" />
          </Field>
          <Button type="submit" disabled={busy !== null || !skillTag}>
            {busy === 'practice' ? 'Setting…' : 'Set as practice'}
          </Button>
        </div>
      </form>
      {status ? (
        <p role="status" className="m-0 text-sm">
          <span aria-hidden="true" className="text-progress">
            ●{' '}
          </span>
          {status}
        </p>
      ) : null}
      <FormError error={error} />
    </Card>
  )
}

function PracticeRow({ row }: { row: ClassPracticeView }) {
  return (
    <li className="flex flex-wrap items-center justify-between gap-2 rounded-card bg-ground p-3 text-sm">
      <span className="flex flex-col">
        <span className="font-medium">{row.title}</span>
        <span className="text-fg-muted tnum">
          {row.kind === 'paper' ? 'Paper' : 'Topic'} · {row.questions} {row.questions === 1 ? 'question' : 'questions'} · set by {row.assignedBy.nickname}
        </span>
      </span>
      <span className="tnum">Due {formatDate(row.dueOn)}</span>
    </li>
  )
}
