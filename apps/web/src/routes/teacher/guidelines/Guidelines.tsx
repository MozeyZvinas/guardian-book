import { useState } from 'react'
import { Link, useParams } from 'react-router'
import { AI_DRAFTED_GUIDELINE_LABEL, skillLabel, type GuidelineItemView, type MeResponse } from '@guardian-book/shared'
import { approveGuideline, guidelines as fetchGuidelines } from '../../../api/teacher'
import { RequireRole } from '../../../app/RequireRole'
import { Button, FormError } from '../../../components/Form'
import { MathText } from '../../../components/MathText'
import { Attribution } from '../../library/LibraryFrame'
import { ClassEyebrow, NotMine, TeacherShell, formatWhen, useLoad } from '../shell/TeacherShell'

/**
 * T7 · Guidelines (spec 05 §9; brief B07 §1): the items the class will use, each with its
 * M/A/CA steps; "Approve for 12A" per item revision. An item the loader marked as drafted
 * by a model says so before the button. Unapproved items cannot be assessed for the class.
 */
export function TeacherGuidelines() {
  return <RequireRole roles={['teacher']}>{(me) => <GuidelinesScreen me={me} />}</RequireRole>
}

const STEP_TYPE: Record<'M' | 'A' | 'CA', string> = { M: 'Method', A: 'Accuracy', CA: 'Consistent accuracy' }

function GuidelinesScreen({ me }: { me: MeResponse }) {
  const { id: classId = '' } = useParams()
  const cls = me.classes.find((c) => c.id === classId)
  const { data, error, reload } = useLoad(() => fetchGuidelines(classId), classId)
  const [busy, setBusy] = useState<string | null>(null)
  const [actionError, setActionError] = useState<unknown>(null)

  async function approve(item: GuidelineItemView) {
    setBusy(item.id)
    setActionError(null)
    try {
      await approveGuideline(classId, item.id, item.revision)
      reload()
    } catch (err) {
      setActionError(err)
    } finally {
      setBusy(null)
    }
  }

  if (!cls) {
    return (
      <TeacherShell me={me} title="Guidelines">
        <NotMine />
      </TeacherShell>
    )
  }

  return (
    <TeacherShell me={me} classId={classId} title="Marking guidelines" eyebrow={<ClassEyebrow classId={classId} name={cls.name} />}>
      <p className="m-0 text-fg-muted">
        Each question is marked only against a guideline you have approved for {cls.name}. Approval is per revision; nothing is assessed for your class before it. To approve a whole past paper in one go, use <Link to={`/teacher/classes/${classId}/library`}>Past papers</Link>.
      </p>
      {error ? <FormError error={error} /> : null}
      {!data && !error ? <p className="text-fg-muted">Loading…</p> : null}
      {data?.items.length === 0 ? <p className="text-fg-muted">No approved questions are loaded yet.</p> : null}
      <ul className="m-0 flex list-none flex-col gap-4 p-0">
        {(data?.items ?? []).map((item) => (
          <li key={item.id} className="flex flex-col gap-3 rounded-card bg-surface p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="m-0 text-sm text-fg-muted">{item.topic}</p>
                <h2 className="m-0 text-lg font-semibold">{item.slug}</h2>
                <p className="m-0 text-sm text-fg-muted tnum">
                  {item.maxMarks} marks · revision {item.revision} · {item.skillTags.map((tag) => skillLabel(tag, 'teacher')).join(', ')}
                </p>
              </div>
              <div className="flex flex-col items-end gap-1">
                {item.approval ? (
                  <p className="m-0 text-sm">
                    <span aria-hidden="true" className="text-progress">
                      ●{' '}
                    </span>
                    Approved for {cls.name} · {formatWhen(item.approval.approvedAt)}
                  </p>
                ) : (
                  <Button type="button" onClick={() => approve(item)} disabled={busy === item.id}>
                    {busy === item.id ? 'Approving…' : `Approve for ${cls.name}`}
                  </Button>
                )}
                {item.aiDrafted ? (
                  <p className="m-0 text-sm font-medium">
                    <span aria-hidden="true">◌ </span>
                    {AI_DRAFTED_GUIDELINE_LABEL}
                  </p>
                ) : null}
              </div>
            </div>
            <MathText as="p" text={item.promptMd} className="m-0 font-serif whitespace-pre-wrap" />
            {item.attribution ? <Attribution text={item.attribution} /> : null}
            <table className="w-full border-collapse text-sm">
              <caption className="sr-only">Marking guideline for {item.slug}</caption>
              <thead>
                <tr className="text-left text-fg-muted">
                  <th scope="col" className="py-1 pr-3 font-medium">
                    Step
                  </th>
                  <th scope="col" className="py-1 pr-3 font-medium">
                    Type
                  </th>
                  <th scope="col" className="py-1 pr-3 font-medium tnum">
                    Marks
                  </th>
                  <th scope="col" className="py-1 pr-3 font-medium">
                    Criterion
                  </th>
                  <th scope="col" className="py-1 font-medium">
                    Skill
                  </th>
                </tr>
              </thead>
              <tbody>
                {item.steps.map((step) => (
                  <tr key={step.id} className="border-t border-fg-muted/20 align-top">
                    <td className="py-2 pr-3 tnum">{step.stepNo}</td>
                    <td className="py-2 pr-3">
                      <abbr title={STEP_TYPE[step.stepType]} className="no-underline">
                        {step.stepType}
                      </abbr>
                    </td>
                    <td className="py-2 pr-3 tnum">{step.marks}</td>
                    <td className="py-2 pr-3">
                      <MathText text={step.criterion} className="font-serif" />
                      {step.notes ? <span className="block text-fg-muted">{step.notes}</span> : null}
                    </td>
                    <td className="py-2">{skillLabel(step.skillTag, 'teacher')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </li>
        ))}
      </ul>
      <FormError error={actionError} />
    </TeacherShell>
  )
}
