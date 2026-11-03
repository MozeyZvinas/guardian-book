import { Link, useParams } from 'react-router'
import type { MeResponse } from '@guardian-book/shared'
import { learnerProfile } from '../../../api/teacher'
import { RequireRole } from '../../../app/RequireRole'
import { Card, FormError } from '../../../components/Form'
import { StatusChip } from '../../../components/StatusChip'
import { TeacherShell, formatDate, formatWhen, useLoad } from '../shell/TeacherShell'
import { skillWords } from '../shell/skillWords'

/**
 * T6 · Learner profile (spec 05 §4.4; brief B07 §5): skill chips from trusted results (raw
 * counts until B05's projection lands), recent attempts and their status, subjects and the
 * hardest subject (never the dream or the raw text), open interventions.
 */
export function TeacherLearner() {
  return <RequireRole roles={['teacher']}>{(me) => <LearnerScreen me={me} />}</RequireRole>
}

function LearnerScreen({ me }: { me: MeResponse }) {
  const { id: learnerId = '' } = useParams()
  const { data, error } = useLoad(() => learnerProfile(learnerId), learnerId)
  if (!data) {
    return (
      <TeacherShell me={me} title="Learner">
        {error ? <FormError error={error} /> : <p className="text-fg-muted">Loading…</p>}
      </TeacherShell>
    )
  }
  const firstClass = data.classes[0]
  return (
    <TeacherShell me={me} classId={firstClass?.id} title={data.learner.nickname} eyebrow={data.classes.map((c) => c.name).join(', ')}>
      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Skills">
          <p className="m-0 text-sm text-fg-muted">
            Steps lost and found across confirmed results and sure proposals. Labels in three levels arrive with the Brain. <StatusChip status="PROTOTYPE" />
          </p>
          {data.skills.length === 0 ? <p className="m-0 text-sm text-fg-muted">No trusted result yet.</p> : null}
          <ul className="m-0 flex list-none flex-wrap gap-2 p-0" aria-label="Skills">
            {data.skills.map((skill) => (
              <li key={skill.skillTag} className={['inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-sm', skill.latest === 'lost' ? 'bg-surface ring-1 ring-fg/40' : 'bg-[color-mix(in_srgb,var(--color-progress)_14%,var(--color-ground))]'].join(' ')}>
                <span aria-hidden="true" className={skill.latest === 'lost' ? 'text-fg' : 'text-progress'}>
                  {skill.latest === 'lost' ? '✗' : '✓'}
                </span>
                <span className="font-medium">{skillWords(skill.skillTag)}</span>
                <span className="text-fg-muted tnum">
                  {skill.found} found · {skill.lost} lost
                </span>
              </li>
            ))}
          </ul>
        </Card>

        <Card title="About">
          {data.cards ? (
            <dl className="m-0 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
              <dt className="text-fg-muted">Subjects</dt>
              <dd className="m-0">{data.cards.subjects.join(', ') || '–'}</dd>
              <dt className="text-fg-muted">Hardest</dt>
              <dd className="m-0">{data.cards.hardestSubject ?? '–'}</dd>
            </dl>
          ) : (
            <p className="m-0 text-sm text-fg-muted">No profile cards yet.</p>
          )}
          <p className="m-0 text-xs text-fg-muted">You see subjects and the hardest subject only; the learner’s own words stay theirs.</p>
        </Card>
      </div>

      <Card title="Recent work">
        {data.attempts.length === 0 ? <p className="m-0 text-sm text-fg-muted">Nothing brought yet.</p> : null}
        <ul className="m-0 flex list-none flex-col gap-2 p-0">
          {data.attempts.map((a) => (
            <li key={a.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-sm">
              <Link to={`/teacher/attempts/${a.id}`}>{a.itemTopic}</Link>
              <span className="text-fg-muted tnum">
                {a.review ? `${a.review.state} · ${a.review.total}/${a.maxMarks}` : a.status === 'proposed' ? `${a.proposedTotal ?? '–'}/${a.maxMarks} proposed` : a.status}
                {a.mode !== 'assisted' ? ` · ${a.mode}` : ''} · {formatWhen(a.createdAt)}
              </span>
            </li>
          ))}
        </ul>
      </Card>

      <Card title="Open interventions">
        {data.interventions.length === 0 ? <p className="m-0 text-sm text-fg-muted">None open.</p> : null}
        <ul className="m-0 flex list-none flex-col gap-2 p-0">
          {data.interventions.map((i) => (
            <li key={i.id} className="text-sm">
              <span className="font-medium">{skillWords(i.skillTag)}</span> · {i.action} <span className="text-fg-muted tnum">· follow-up {formatDate(i.followUpOn)}</span>
            </li>
          ))}
        </ul>
      </Card>
    </TeacherShell>
  )
}
