import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router'
import type { AttemptResponse } from '@guardian-book/shared'
import { ApiRequestError } from '../../../api/client'
import { checkAlone, fixAttempt, fixAttemptPhoto } from '../../../api/loop'
import { getAttempt } from '../../../api/practice'
import { RequireRole } from '../../../app/RequireRole'
import type { Capture } from '../../../components/CaptureSheet'
import { CrestFan as Crest } from '../../../components/Crest'
import { Button, Card, FormError } from '../../../components/Form'
import { HintCard } from '../../../components/HintCard'
import { LearnerShell } from '../../../components/LearnerShell'
import { MathCapture } from './MathCapture'
import { MathText } from '../../../components/MathText'
import { AskAboutStep } from './AskAboutStep'

/**
 * L4 · Fix it (spec 05 §4.2, §9): the broken step restated, Type or Snap, Check. A pass
 * shows ✓ "Fixed on your own" with the crest fanning, and the primary button becomes
 * **Check it alone** (a matched question, no hints until you submit). Not yet: the next
 * hint and Try again (counted as "fixed on your own" only on the first try). Ask about
 * this step (B13): a question in the learner's words, typed or by voice, gets one hint.
 */
export function Fix() {
  return <RequireRole roles={['learner']}>{() => <FixScreen />}</RequireRole>
}

const POLL_MS = 2_000

function FixScreen() {
  const { id = '' } = useParams()
  const [params, setParams] = useSearchParams()
  const navigate = useNavigate()
  const retryId = params.get('retry')
  const [parent, setParent] = useState<AttemptResponse | null>(null)
  const [retry, setRetry] = useState<AttemptResponse | null>(null)
  const [error, setError] = useState<unknown>(null)
  const [busy, setBusy] = useState(false)
  const [tick, setTick] = useState(0)

  useEffect(() => {
    let cancelled = false
    getAttempt(id)
      .then((data) => {
        if (!cancelled) setParent(data)
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err)
      })
    return () => {
      cancelled = true
    }
  }, [id])

  // Follow the retry until it is assessed.
  useEffect(() => {
    if (!retryId) return
    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | null = null
    getAttempt(retryId)
      .then((data) => {
        if (cancelled) return
        setRetry(data)
        if (data.attempt.status === 'assessing' || data.attempt.status === 'submitted') timer = setTimeout(() => setTick((n) => n + 1), POLL_MS)
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err)
      })
    return () => {
      cancelled = true
      if (timer) clearTimeout(timer)
    }
  }, [retryId, tick])

  async function onCapture(capture: Capture) {
    setBusy(true)
    setError(null)
    try {
      const result = capture.file ? await fixAttemptPhoto(id, capture.file.blob, capture.file.filename) : await fixAttempt(id, capture.text ?? '')
      setRetry(null)
      setParams({ retry: result.attemptId })
    } catch (err) {
      setError(err instanceof ApiRequestError && err.code === 'nothing_to_fix' ? new Error(err.message) : err)
    } finally {
      setBusy(false)
    }
  }

  async function startCheckAlone(skill: string) {
    setBusy(true)
    setError(null)
    try {
      const match = await checkAlone(skill, 'independent', id)
      if (!match.item) {
        setError(new Error('No new question for this skill yet. Your teacher can add one; your fix still counts.'))
        return
      }
      void navigate(`/items/${match.item.id}?from=${encodeURIComponent(id)}&mode=independent&skill=${encodeURIComponent(skill)}`, { state: { why: match.why } })
    } catch (err) {
      setError(err)
    } finally {
      setBusy(false)
    }
  }

  if (!parent) {
    return (
      <LearnerShell>
        <h1 className="text-display font-semibold text-balance">Fix it</h1>
        {error ? <FormError error={error} /> : <p className="text-fg-muted" aria-live="polite">Loading…</p>}
      </LearnerShell>
    )
  }

  const proposed = parent.assessment?.status === 'proposed' ? parent.assessment : null
  const lostSteps = proposed?.steps.filter((step) => step.awarded < step.available) ?? []
  const first = lostSteps[0] ?? null
  const firstName = first ? parent.guideline.find((step) => step.id === first.stepId) : null
  const skill = first?.skillTag ?? null

  const retryProposed = retry?.assessment?.status === 'proposed' ? retry.assessment : null
  const assessing = retry ? retry.attempt.status === 'assessing' || retry.attempt.status === 'submitted' : false
  const fixed = retry?.fix?.fixedIndependently === true || (retryProposed !== null && retryProposed.steps.length > 0 && retryProposed.steps.every((step) => step.awarded >= step.available))
  const nextHint = retryProposed?.steps.find((step) => step.awarded < step.available)?.hint ?? null

  return (
    <LearnerShell>
      <div className="flex flex-col gap-1">
        <p className="m-0 text-sm text-fg-muted">
          {parent.attempt.itemTopic} · <Link to={`/attempts/${parent.attempt.id}`}>your feedback</Link>
        </p>
        <h1 className="text-display font-semibold text-balance">Fix it</h1>
      </div>

      {!first ? (
        <Card>
          <p className="m-0">Nothing to fix on this one: every step was found, or your teacher is still checking it.</p>
        </Card>
      ) : (
        <Card title={`Step ${firstName?.stepNo ?? '?'}: where it slipped`}>
          {firstName ? <MathText as="p" text={firstName.criterion} className="m-0" /> : null}
          <p className="m-0 text-sm text-fg-muted">{first.feedback}</p>
          {lostSteps.length > 1 ? <p className="m-0 text-sm text-fg-muted">And {lostSteps.length - 1} more step{lostSteps.length > 2 ? 's' : ''} to redo on this one.</p> : null}
        </Card>
      )}

      {first && firstName && !fixed ? <AskAboutStep attemptId={id} stepNo={firstName.stepNo} /> : null}

      {retry && !fixed && !assessing && retryProposed ? (
        <Card>
          <p className="m-0 font-medium">Not yet. Here’s a hint for next time.</p>
          {nextHint ? <HintCard hint={nextHint} stepNo={firstName?.stepNo ?? 0} /> : null}
          <p className="m-0 text-sm text-fg-muted">Have another go below. The first try is the one that counts as fixed on your own.</p>
        </Card>
      ) : null}
      {retry && !fixed && !assessing && retry.attempt.status === 'uncertain' ? (
        <Card>
          <p className="m-0 font-medium">We’re not sure about this one. Your teacher will check it.</p>
        </Card>
      ) : null}

      {fixed ? (
        <Card>
          <p className="m-0 flex items-center gap-3 text-lg font-medium">
            <Crest label="The crest fans open" />
            <span>
              <span aria-hidden="true">✓ </span>Fixed on your own
            </span>
          </p>
          <p className="m-0 text-sm text-fg-muted">One step, done without help. Next: one more like it, alone, to see if it sticks.</p>
          <div className="flex flex-wrap items-center gap-3">
            {skill ? (
              <Button type="button" onClick={() => void startCheckAlone(skill)} disabled={busy}>
                {busy ? 'Finding a question…' : 'Check it alone'}
              </Button>
            ) : null}
            <span className="inline-flex items-center rounded-full bg-surface px-3 py-1 text-xs font-medium tracking-wide ring-1 ring-fg-muted/40">Independent</span>
          </div>
        </Card>
      ) : null}

      {assessing ? (
        <p role="status" aria-live="polite" className="m-0 flex items-center gap-2 text-fg-muted">
          <span aria-hidden="true" className="inline-block h-2 w-2 animate-pulse rounded-full bg-progress" />
          Checking your fix…
        </p>
      ) : null}

      {first && !fixed && !assessing ? (
        <section aria-labelledby="redo-heading" className="flex flex-col gap-3">
          <h2 id="redo-heading" className="text-lg font-semibold">
            Redo the step
          </h2>
          <MathCapture onCapture={onCapture} disabled={busy} typeLabel="Your working for this step" />
        </section>
      ) : null}

      <FormError error={error} />
    </LearnerShell>
  )
}
