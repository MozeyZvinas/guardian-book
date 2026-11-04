import { Link, useParams } from 'react-router'
import { skillLabel, type MeResponse } from '@guardian-book/shared'
import { learnerProfile } from '../../../api/teacher'
import { RequireRole } from '../../../app/RequireRole'
import { Card, FormError } from '../../../components/Form'
import { MARK_LABELS, Mark, SkillStateBadge } from '../../../components/SkillChip'
import { TeacherShell, formatDate, formatWhen, useLoad } from '../shell/TeacherShell'

/**
 * T6 · Learner profile (spec 05 §4.4; brief B07 §5): skill chips from the Brain's projection
 * (B05: three marks, teacher wording), recent attempts and their status, subjects and the
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
  const evidenced = data.skills.filter((skill) => skill.evidenceCount > 0)
  const unseen = data.skills.length - evidenced.length
  return (
    <TeacherShell me={me} classId={firstClass?.id} title={data.learner.nickname} eyebrow={data.classes.map((c) => c.name).join(', ')}>
      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Skills">
          <p className="m-0 text-sm text-fg-muted">From the Brain: with help, on their own, and later. Your confirmed results override the model’s for the same attempt.</p>
          {evidenced.length === 0 ? <p className="m-0 text-sm text-fg-muted">No evidence yet.</p> : null}
          <ul className="m-0 flex list-none flex-col gap-2 p-0" aria-label="Skills">
            {evidenced.map((skill) => (
              <li key={skill.tag} className="flex flex-col gap-2 rounded-card bg-ground p-3">
                <span className="flex items-start justify-between gap-3">
                  <span className="font-medium">{skill.label}</span>
                  <SkillStateBadge state={skill.state} />
                </span>
                <span className="flex flex-wrap gap-x-4 gap-y-1">
                  <Mark label={MARK_LABELS.assisted} mark={skill.assisted} />
                  <Mark label={MARK_LABELS.independent} mark={skill.independent} />
                  <Mark label={MARK_LABELS.retained} mark={skill.retained} />
                </span>
              </li>
            ))}
          </ul>
          {unseen > 0 ? <p className="m-0 text-xs text-fg-muted tnum">{unseen} more skills in the pack with no evidence yet.</p> : null}
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
              <span className="font-medium">{skillLabel(i.skillTag, 'teacher')}</span> · {i.action} <span className="text-fg-muted tnum">· follow-up {formatDate(i.followUpOn)}</span>
            </li>
          ))}
        </ul>
      </Card>
    </TeacherShell>
  )
}
