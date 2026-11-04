import { useState, type FormEvent } from 'react'
import { Link, useParams } from 'react-router'
import { skillLabel, type FeedbackKind, type MeResponse, type NoteAudience, type ProposalStep, type ReviewAttemptResponse } from '@guardian-book/shared'
import { ApiRequestError } from '../../../api/client'
import { attemptImageUrl } from '../../../api/practice'
import { addFeedback, confirmReview, releaseAttempt, reviewAttempt } from '../../../api/teacher'
import { RequireRole } from '../../../app/RequireRole'
import { Button, Card, FormError } from '../../../components/Form'
import { MathText } from '../../../components/MathText'
import { CONFIDENCE_LABEL } from '../../../components/StepMap'
import { WorkViewer } from '../../../components/WorkViewer'
import { ChecksList, OriginChip } from '../shell/ChecksList'
import { ClassEyebrow, TeacherShell, formatWhen, useLoad } from '../shell/TeacherShell'

/**
 * T3a · Review (spec 05 §4.4, §9; spec 03 §2, §4; brief B07 §3). Two panes from 1024 px:
 * the learner's work on the left; on the right the model's per-step proposal with
 * evidence and confidence, the checks list, the adjust controls, Confirm, then Release.
 * The proposal is never overwritten: the review is its own record with a version, and a
 * stale version says so. Feedback controls: Agree, Correct, Add, with an audience.
 */
export function TeacherReview() {
  return <RequireRole roles={['teacher']}>{(me) => <ReviewScreen me={me} />}</RequireRole>
}

const AUDIENCE_LABEL: Record<NoteAudience, string> = { learner: 'Learner', guardian: 'Guardian', teacher_only: 'Only me' }
const KIND_LABEL: Record<FeedbackKind, string> = { agree: 'Agree', correct: 'Correct', add: 'Add' }
export const STALE_SENTENCE = 'Someone changed this; reload to see the latest.'

function ReviewScreen({ me }: { me: MeResponse }) {
  const { id: attemptId = '' } = useParams()
  const { data, error, reload } = useLoad(() => reviewAttempt(attemptId), attemptId)
  if (!data) {
    return (
      <TeacherShell me={me} title="Review">
        {error ? <FormError error={error} /> : <p className="text-fg-muted">Loading…</p>}
      </TeacherShell>
    )
  }
  return <Loaded me={me} data={data} reload={reload} key={`${data.review?.version ?? 0}:${data.feedback.length}`} />
}

function Loaded({ me, data, reload }: { me: MeResponse; data: ReviewAttemptResponse; reload: () => void }) {
  const { attempt, steps, assessment, runs, review, feedback } = data
  const cls = me.classes.find((c) => c.id === attempt.classId)
  const released = review?.state === 'released'
  const [awards, setAwards] = useState<Record<string, number>>(() =>
    Object.fromEntries(steps.map((step) => [step.stepId, review?.steps.find((s) => s.stepId === step.stepId)?.awarded ?? step.proposed?.awarded ?? 0])),
  )
  const [comment, setComment] = useState(review?.comment ?? '')
  const [busy, setBusy] = useState<string | null>(null)
  const [actionError, setActionError] = useState<unknown>(null)
  const [stale, setStale] = useState(false)

  const firstLost = steps.find((step) => step.proposed && step.proposed.awarded < step.marks) ?? null
  const [kind, setKind] = useState<FeedbackKind>('agree')
  const [audience, setAudience] = useState<NoteAudience>('learner')
  const [text, setText] = useState(firstLost?.proposed?.feedback ?? '')

  const total = steps.reduce((acc, step) => acc + (awards[step.stepId] ?? 0), 0)
  const lostBoxes = steps.flatMap((step) => (step.proposed?.box ? [{ box: step.proposed.box, label: step.stepId, lost: (step.proposed?.awarded ?? 0) < step.marks }] : []))

  async function run(label: string, work: () => Promise<unknown>) {
    setBusy(label)
    setActionError(null)
    setStale(false)
    try {
      await work()
      reload()
    } catch (err) {
      if (err instanceof ApiRequestError && err.status === 409 && err.code === 'stale_version') setStale(true)
      else setActionError(err)
    } finally {
      setBusy(null)
    }
  }

  const confirm = () =>
    run('confirm', () =>
      confirmReview(attempt.id, {
        steps: steps.map((step) => ({ stepId: step.stepId, awarded: awards[step.stepId] ?? 0 })),
        comment: comment.trim() === '' ? null : comment.trim(),
        ...(review ? { version: review.version } : {}),
      }),
    )
  const release = () => run('release', () => releaseAttempt(attempt.id, review?.version ?? 0))

  function chooseKind(next: FeedbackKind) {
    setKind(next)
    if (next === 'add') setText('')
    else setText(firstLost?.proposed?.feedback ?? '')
  }

  async function submitFeedback(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!review) return
    const trimmed = text.trim()
    await run('feedback', () => addFeedback(review.id, { kind, audience, ...(trimmed ? { text: trimmed } : {}) }))
  }

  return (
    <TeacherShell me={me} classId={attempt.classId ?? undefined} title={`${attempt.learner.nickname}’s work`} eyebrow={cls ? <ClassEyebrow classId={cls.id} name={cls.name} /> : attempt.itemTopic} wide>
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Left: the work */}
        <section aria-labelledby="work-heading" className="flex min-w-0 flex-col gap-3">
          <h2 id="work-heading" className="text-lg font-semibold">
            The work
          </h2>
          <p className="m-0 text-sm text-fg-muted">
            {attempt.itemTopic} · {attempt.itemSlug} · {attempt.kind === 'photo' ? 'photo' : 'typed'} · {attempt.mode} · {formatWhen(attempt.createdAt)}
          </p>
          <MathText as="p" text={attempt.itemPromptMd} className="m-0 font-serif whitespace-pre-wrap" />
          <WorkViewer imageUrl={attempt.hasImage ? attemptImageUrl(attempt.id) : null} text={attempt.answerText} boxes={lostBoxes} alt={`${attempt.learner.nickname}’s working`} />
          <p className="m-0 text-sm text-fg-muted">
            <Link to={`/teacher/learners/${attempt.learner.id}`}>{attempt.learner.nickname}’s profile</Link>
          </p>
        </section>

        {/* Right: the proposal, the checks, the decision */}
        <section aria-labelledby="proposal-heading" className="flex min-w-0 flex-col gap-4">
          <h2 id="proposal-heading" className="text-lg font-semibold">
            The model’s proposal
          </h2>
          {assessment === null ? <p className="m-0 text-fg-muted">The check has not finished yet.</p> : null}
          {assessment?.status === 'uncertain' ? (
            <p role="status" className="m-0 rounded-card bg-surface p-3 text-sm">
              <span aria-hidden="true">◯ </span>The model was not sure ({assessment.ambiguityReasons.join(', ') || 'no reason given'}). No mark was shown to the learner; you decide.
            </p>
          ) : null}
          <ol className="m-0 flex list-none flex-col gap-2 p-0" aria-label="Steps">
            {steps.map((step) => (
              <StepRow key={step.stepId} step={step} award={awards[step.stepId] ?? 0} locked={released} onAward={(value) => setAwards((current) => ({ ...current, [step.stepId]: value }))} />
            ))}
          </ol>
          <p className="m-0 text-sm tnum">
            {assessment?.status === 'proposed' ? `Proposed ${assessment.total ?? 0}/${attempt.maxMarks} · ` : ''}
            Your total <span className="font-medium">{total}</span>/{attempt.maxMarks}
          </p>

          <Card title="Checks the model cannot skip">
            <ChecksList runs={runs} />
          </Card>

          <Card title="Your decision">
            <label className="flex flex-col gap-1 text-sm font-medium">
              Comment (optional)
              <textarea value={comment} onChange={(e) => setComment(e.target.value)} rows={2} maxLength={600} disabled={released} className="w-full rounded-card border border-fg-muted/50 bg-ground px-3 py-2 text-base font-normal text-fg placeholder:text-fg-muted focus-visible:border-action" />
            </label>
            <p className="m-0 text-sm text-fg-muted" role="status">
              {review ? (review.state === 'released' ? `Released ${formatWhen(review.releasedAt ?? review.confirmedAt)} · version ${review.version}` : `Confirmed ${formatWhen(review.confirmedAt)} · version ${review.version} · not yet released`) : 'Not confirmed yet. The learner sees the proposal; nothing is official until you release.'}
            </p>
            {stale ? (
              <p role="alert" className="m-0 text-sm font-medium">
                {STALE_SENTENCE}{' '}
                <button type="button" onClick={reload} className="underline">
                  Reload
                </button>
              </p>
            ) : null}
            <div className="flex flex-wrap gap-2">
              <Button type="button" onClick={confirm} disabled={busy !== null || released || assessment === null} variant={review ? 'quiet' : 'primary'}>
                {busy === 'confirm' ? 'Confirming…' : review ? 'Confirm again' : 'Confirm'}
              </Button>
              <Button type="button" onClick={release} disabled={busy !== null || !review || released}>
                {busy === 'release' ? 'Releasing…' : released ? 'Released' : 'Release'}
              </Button>
            </div>
          </Card>

          <Card title="Your words on this result">
            {!review ? <p className="m-0 text-sm text-fg-muted">Confirm first, then agree with, correct or add to what the learner sees.</p> : null}
            {feedback.length > 0 ? (
              <ul className="m-0 flex list-none flex-col gap-2 p-0" aria-label="Feedback">
                {feedback.map((f) => (
                  <li key={f.id} className="flex flex-col gap-1 rounded-card bg-ground p-3 text-sm">
                    <span className="flex flex-wrap items-center gap-2 text-xs text-fg-muted">
                      <OriginChip origin={f.origin} />
                      <span>{KIND_LABEL[f.kind]}</span>
                      <span>· {AUDIENCE_LABEL[f.audience]}</span>
                      <span className="tnum">· {formatWhen(f.createdAt)}</span>
                    </span>
                    {f.text ? <span>{f.text}</span> : <span className="text-fg-muted">(agreed with the explanation)</span>}
                  </li>
                ))}
              </ul>
            ) : null}
            {review ? (
              <form onSubmit={submitFeedback} className="flex flex-col gap-3">
                <div role="radiogroup" aria-label="What are you doing" className="flex flex-wrap gap-2">
                  {(Object.keys(KIND_LABEL) as FeedbackKind[]).map((k) => (
                    <button key={k} type="button" role="radio" aria-checked={kind === k} onClick={() => chooseKind(k)} className={['min-h-11 rounded-full px-4 text-sm font-medium', kind === k ? 'bg-fg text-ground' : 'bg-surface text-fg ring-1 ring-fg-muted/40'].join(' ')}>
                      {kind === k ? '● ' : ''}
                      {KIND_LABEL[k]}
                    </button>
                  ))}
                </div>
                <label className="flex flex-col gap-1 text-sm font-medium">
                  {kind === 'agree' ? 'The explanation you agree with' : kind === 'correct' ? 'The explanation, corrected' : 'Your own note'}
                  <textarea value={text} onChange={(e) => setText(e.target.value)} rows={3} maxLength={600} required={kind !== 'agree'} className="w-full rounded-card border border-fg-muted/50 bg-ground px-3 py-2 text-base font-normal text-fg placeholder:text-fg-muted focus-visible:border-action" />
                </label>
                <fieldset className="m-0 flex flex-wrap items-center gap-3 border-0 p-0 text-sm">
                  <legend className="float-left mr-2 font-medium">Who sees it</legend>
                  {(Object.keys(AUDIENCE_LABEL) as NoteAudience[]).map((a) => (
                    <label key={a} className="inline-flex min-h-11 items-center gap-1.5">
                      <input type="radio" name="audience" value={a} checked={audience === a} onChange={() => setAudience(a)} />
                      {AUDIENCE_LABEL[a]}
                    </label>
                  ))}
                </fieldset>
                <div>
                  <Button type="submit" variant="quiet" disabled={busy !== null}>
                    {busy === 'feedback' ? 'Saving…' : `Save (${KIND_LABEL[kind].toLowerCase()})`}
                  </Button>
                </div>
              </form>
            ) : null}
          </Card>
          <FormError error={actionError} />
        </section>
      </div>
    </TeacherShell>
  )
}

function StepRow({ step, award, locked, onAward }: { step: ProposalStep; award: number; locked: boolean; onAward: (value: number) => void }) {
  const p = step.proposed
  const earned = award >= step.marks
  return (
    <li className={['flex flex-col gap-2 rounded-card bg-surface p-3', earned ? '' : 'ring-1 ring-fg/40'].join(' ')}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="m-0 text-sm font-medium">
            <span aria-hidden="true" className={earned ? 'text-progress' : 'text-fg'}>
              {earned ? '✓' : award > 0 ? '◐' : '✗'}{' '}
            </span>
            Step {step.stepNo} · {step.stepType} · {skillLabel(step.skillTag, 'teacher')}
          </p>
          <MathText as="p" text={step.criterion} className="m-0 font-serif text-sm" />
        </div>
        <label className="flex items-center gap-2 text-sm tnum">
          <span className="sr-only">Marks for step {step.stepNo}</span>
          <select value={award} disabled={locked} onChange={(e) => onAward(Number(e.target.value))} aria-label={`Marks for step ${step.stepNo}`} className="min-h-11 rounded-card border border-fg-muted/50 bg-ground px-2 text-base text-fg">
            {Array.from({ length: step.marks + 1 }, (_, n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
          <span>/ {step.marks}</span>
        </label>
      </div>
      {p ? (
        <div className="flex flex-col gap-1 text-sm">
          <p className="m-0 text-fg-muted tnum">
            Model: {p.awarded}/{step.marks} · {CONFIDENCE_LABEL[p.confidence]}
            {p.misconceptionTag ? ` · ${p.misconceptionTag.replace(/_/g, ' ')}` : ''}
          </p>
          <blockquote className="m-0 border-l-2 border-fg-muted/50 pl-3 text-fg-muted">“{p.evidence}”</blockquote>
          <p className="m-0">{p.feedback}</p>
          {p.hint ? <p className="m-0 text-fg-muted">Hint shown: {p.hint}</p> : null}
        </div>
      ) : (
        <p className="m-0 text-sm text-fg-muted">The model gave no proposal for this step.</p>
      )}
    </li>
  )
}
