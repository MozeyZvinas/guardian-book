import { useEffect, useState } from 'react'
import { Link, Navigate, useNavigate, useParams } from 'react-router'
import { checkAlone } from '../../../api/loop'
import type { AttemptResponse } from '@guardian-book/shared'
import { ApiRequestError } from '../../../api/client'
import { assess, attemptImageUrl, getAttempt } from '../../../api/practice'
import { RequireRole } from '../../../app/RequireRole'
import { Button, Card, FormError } from '../../../components/Form'
import { HintCard } from '../../../components/HintCard'
import { LearnerShell } from '../../../components/LearnerShell'
import { MathText } from '../../../components/MathText'
import { ConfidenceLabel, StepMap } from '../../../components/StepMap'
import { WorkViewer } from '../../../components/WorkViewer'

/**
 * L3 · Feedback (spec 05 §4.2, §7, §9): the learner's own work as the hero, the step map,
 * where it slipped, the hint, confidence. Polls every 2 s while the check runs, with
 * skeleton rows. Uncertain: one sentence, no marks. Fix it opens L4 (B06); an independent
 * or follow-up check reads "You did it on your own" or "Not yet; here's a hint for next time".
 */
export function Attempt() {
  return <RequireRole roles={['learner', 'teacher']}>{() => <AttemptScreen />}</RequireRole>
}

const POLL_MS = 2_000
export const UNCERTAIN_SENTENCE = 'We’re not sure about this one. Your teacher will check it.'

function AttemptScreen() {
  const { id = '' } = useParams()
  const [data, setData] = useState<AttemptResponse | null>(null)
  const [error, setError] = useState<unknown>(null)
  const [paused, setPaused] = useState<string | null>(null)
  const [tick, setTick] = useState(0)
  const [busy, setBusy] = useState(false)
  const navigate = useNavigate()

  useEffect(() => {
    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | null = null
    async function load() {
      try {
        const next = await getAttempt(id)
        if (cancelled) return
        setData(next)
        setError(null)
        if (next.attempt.status === 'submitted') {
          try {
            await assess(id)
          } catch (err) {
            if (err instanceof ApiRequestError && (err.status === 429 || err.status === 503)) setPaused(err.message)
            else throw err
          }
        }
        if (next.attempt.status === 'assessing' || (next.attempt.status === 'submitted' && !paused)) {
          timer = setTimeout(() => setTick((n) => n + 1), POLL_MS)
        }
      } catch (err) {
        if (!cancelled) setError(err)
      }
    }
    void load()
    return () => {
      cancelled = true
      if (timer) clearTimeout(timer)
    }
    // `tick` drives the poll; `paused` stops it.
  }, [id, tick, paused])

  if (!data) {
    return (
      <LearnerShell>
        <h1 className="text-display font-semibold text-balance">Your work</h1>
        {error ? <FormError error={error} /> : <p className="text-fg-muted" aria-live="polite">Loading…</p>}
      </LearnerShell>
    )
  }

  const { attempt, assessment, guideline, hintsVisible } = data
  // A retry lives on its parent's fix-it page.
  if (attempt.parentAttemptId) return <Navigate to={`/attempts/${attempt.parentAttemptId}/fix?retry=${attempt.id}`} replace />
  const assessing = attempt.status === 'assessing' || attempt.status === 'submitted'
  const proposed = assessment?.status === 'proposed' ? assessment : null
  const lost = proposed?.steps.find((step) => step.awarded < step.available) ?? null
  const lostName = lost ? guideline.find((step) => step.id === lost.stepId) : null
  const boxes = proposed?.steps.flatMap((step) => (step.box ? [{ box: step.box, label: step.stepId, lost: step.awarded < step.available }] : [])) ?? []
  const independent = attempt.mode !== 'assisted'

  async function checkAgain(skill: string) {
    setBusy(true)
    try {
      const match = await checkAlone(skill, 'independent', attempt.id)
      if (!match.item) {
        setError(new Error('No new question for this skill yet. Your teacher can add one.'))
        return
      }
      void navigate(`/items/${match.item.id}?from=${attempt.id}&mode=independent&skill=${encodeURIComponent(skill)}`, { state: { why: match.why } })
    } catch (err) {
      setError(err)
    } finally {
      setBusy(false)
    }
  }

  return (
    <LearnerShell>
      <div className="flex flex-col gap-1">
        <p className="m-0 text-sm text-fg-muted">{attempt.itemTopic}</p>
        <h1 className="text-display font-semibold text-balance">Your work</h1>
        <MathText as="p" text={attempt.itemPromptMd} className="m-0 font-serif whitespace-pre-wrap" />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <WorkViewer imageUrl={attempt.hasImage ? attemptImageUrl(attempt.id) : null} text={attempt.answerText} boxes={boxes} alt="Your working" />
        <div className="flex flex-col gap-3">
          {assessing ? (
            <p role="status" aria-live="polite" className="m-0 flex items-center gap-2 text-fg-muted">
              <span aria-hidden="true" className="inline-block h-2 w-2 animate-pulse rounded-full bg-progress" />
              Reading your work…
            </p>
          ) : null}
          {paused ? (
            <p role="status" className="m-0 rounded-card bg-surface p-3 text-sm">
              {paused}
            </p>
          ) : null}
          <StepMap guideline={guideline} steps={proposed?.steps ?? null} assessing={assessing} />
          {proposed ? (
            <p className="m-0 text-sm tnum" aria-live="polite">
              <span className="font-medium">{proposed.total}</span> of {attempt.maxMarks} marks proposed · your teacher confirms
            </p>
          ) : null}
        </div>
      </div>

      {attempt.status === 'uncertain' ? (
        <Card>
          <p className="m-0 font-medium">{UNCERTAIN_SENTENCE}</p>
          <p className="m-0 text-sm text-fg-muted">Nothing is marked until a person has looked. Your work is saved.</p>
        </Card>
      ) : null}

      {attempt.status === 'failed' ? (
        <Card>
          <p className="m-0 font-medium">The check did not finish.</p>
          <div>
            <Button type="button" onClick={() => setTick((n) => n + 1)}>
              Try again
            </Button>
          </div>
        </Card>
      ) : null}

      {proposed && independent ? (
        <Card>
          <p className="m-0 font-medium">
            <span aria-hidden="true">{lost ? '◐ ' : '✓ '}</span>
            {lost ? 'Not yet; here’s a hint for next time.' : 'You did it on your own.'}
          </p>
          <p className="m-0 text-sm text-fg-muted">
            {attempt.mode === 'retention' ? 'A follow-up check, no hints: this is what moves a skill to secure.' : 'Checked alone, no hints. A follow-up check in two days shows if it stuck.'}
          </p>
        </Card>
      ) : null}

      {proposed && lost && lostName ? (
        <Card title={`Where it slipped: step ${lostName.stepNo}`}>
          <MathText as="p" text={lostName.criterion} className="m-0" />
          <blockquote className="m-0 border-l-2 border-fg-muted/50 pl-3 text-sm text-fg-muted">“{lost.evidence}”</blockquote>
          <p className="m-0 text-sm">{lost.feedback}</p>
        </Card>
      ) : null}
      {proposed && !lost && !independent ? (
        <Card>
          <p className="m-0 font-medium">
            <span aria-hidden="true">✓ </span>Every step found. Your teacher confirms the marks.
          </p>
        </Card>
      ) : null}

      {proposed && lost?.hint && hintsVisible ? <HintCard hint={lost.hint} stepNo={lostName?.stepNo ?? 0} /> : null}
      {proposed ? <ConfidenceLabel steps={proposed.steps} /> : null}

      {proposed && lost && !independent ? (
        <div className="flex flex-wrap items-center gap-3">
          <Link to={`/attempts/${attempt.id}/fix`} className="inline-flex min-h-11 items-center justify-center rounded-card bg-action px-5 font-medium text-ground no-underline">
            Fix it
          </Link>
          <span className="text-sm text-fg-muted">Redo step {lostName?.stepNo}, then check it alone.</span>
        </div>
      ) : null}
      {proposed && lost && independent && lost.skillTag ? (
        <div>
          <Button type="button" variant="quiet" onClick={() => void checkAgain(lost.skillTag)} disabled={busy}>
            {busy ? 'Finding a question…' : 'Try one more alone'}
          </Button>
        </div>
      ) : null}

      <FormError error={error} />
      <p className="text-sm text-fg-muted">
        <Link to="/bring">Bring something else</Link> · <Link to="/today">Today</Link>
        {independent ? ` · ${attempt.mode === 'independent' ? 'Independent' : 'Follow-up check'}` : ''}
      </p>
    </LearnerShell>
  )
}
