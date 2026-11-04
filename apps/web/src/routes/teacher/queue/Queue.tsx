import { Link, useParams } from 'react-router'
import type { MeResponse, QueueRow } from '@guardian-book/shared'
import { queue as fetchQueue } from '../../../api/teacher'
import { RequireRole } from '../../../app/RequireRole'
import { FormError } from '../../../components/Form'
import { ClassEyebrow, NotMine, TeacherShell, formatWhen, useLoad } from '../shell/TeacherShell'

/** T3 · Confirm queue (spec 05 §4.4): uncertain first, then proposed; each row opens the review. */
export function TeacherQueue() {
  return <RequireRole roles={['teacher']}>{(me) => <QueueScreen me={me} />}</RequireRole>
}

function statusWords(row: QueueRow): string {
  if (row.review?.state === 'released') return `Released · ${row.review.total}/${row.maxMarks}`
  if (row.review?.state === 'confirmed') return `Confirmed · ${row.review.total}/${row.maxMarks} · not released`
  switch (row.status) {
    case 'uncertain':
      return 'Not sure · needs you'
    case 'proposed':
      return `${row.proposedTotal ?? '–'}/${row.maxMarks} proposed · confirm`
    case 'failed':
      return 'The check did not finish'
    default:
      return 'Being read…'
  }
}

function Rows({ rows, label }: { rows: QueueRow[]; label: string }) {
  if (rows.length === 0) return null
  return (
    <section aria-labelledby={`q-${label}`} className="flex flex-col gap-2">
      <h2 id={`q-${label}`} className="text-lg font-semibold">
        {label}
      </h2>
      <ul className="m-0 flex list-none flex-col gap-2 p-0">
        {rows.map((row) => (
          <li key={row.attemptId} className={['rounded-card bg-surface', row.status === 'uncertain' && !row.review ? 'ring-1 ring-fg/40' : ''].join(' ')}>
            <Link to={`/teacher/attempts/${row.attemptId}`} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-3 text-fg no-underline">
              <span className="font-medium">{row.learner.nickname}</span>
              <span className="text-sm text-fg-muted">{row.itemTopic}</span>
              <span className="text-sm tnum">
                <span aria-hidden="true">{row.status === 'uncertain' && !row.review ? '◯ ' : row.review ? '● ' : '◐ '}</span>
                {statusWords(row)}
              </span>
              <span className="text-sm text-fg-muted tnum">{formatWhen(row.createdAt)}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}

function QueueScreen({ me }: { me: MeResponse }) {
  const { id: classId = '' } = useParams()
  const cls = me.classes.find((c) => c.id === classId)
  const { data, error } = useLoad(() => fetchQueue(classId), classId)
  if (!cls) {
    return (
      <TeacherShell me={me} title="Confirm queue">
        <NotMine />
      </TeacherShell>
    )
  }
  const rows = data?.rows ?? []
  const open = rows.filter((row) => !row.review && (row.status === 'uncertain' || row.status === 'proposed' || row.status === 'failed'))
  const running = rows.filter((row) => !row.review && (row.status === 'assessing' || row.status === 'submitted'))
  const confirmed = rows.filter((row) => row.review?.state === 'confirmed')
  const released = rows.filter((row) => row.review?.state === 'released')
  return (
    <TeacherShell me={me} classId={classId} title="Confirm queue" eyebrow={<ClassEyebrow classId={classId} name={cls.name} />}>
      {error ? <FormError error={error} /> : null}
      {!data && !error ? <p className="text-fg-muted">Loading…</p> : null}
      {data && rows.length === 0 ? <p className="text-fg-muted">No work from {cls.name} yet. When a learner brings something, it lands here.</p> : null}
      {data && rows.length > 0 && open.length === 0 ? <p className="text-fg-muted">Everything is confirmed. Nothing needs you right now.</p> : null}
      <Rows rows={open} label="Needs you" />
      <Rows rows={running} label="Being read" />
      <Rows rows={confirmed} label="Confirmed, not yet released" />
      <Rows rows={released} label="Released" />
    </TeacherShell>
  )
}
