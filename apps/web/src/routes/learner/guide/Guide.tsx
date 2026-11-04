import { useEffect, useId, useReducer, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { GUIDE_LABEL, MAX_GUIDE_TEXT, type GuideStepView, type GuideView } from '@guardian-book/shared'
import { RequireRole } from '../../../app/RequireRole'
import { Button, Card, FormError } from '../../../components/Form'
import { LearnerShell } from '../../../components/LearnerShell'
import { MathInput } from '../../../components/MathInput'
import { MathText } from '../../../components/MathText'
import { createGuide, getGuide } from './api'
import { answerVisible, initialReveal, reveal, stepState } from './reveal'

/**
 * L9 · Help me with a question (brief B15 §4), 360 px first. "Reading your question…"
 * while two independent reads run; then "Is this your question?" with Edit (re-reads once);
 * one step at a time: the goal, a box to try it yourself, Hint, then Show this step; the
 * next step unlocks after the current one; the final answer only after the last step, or
 * behind "Show the answer" with a one-line confirm. Labelled AI-guided practice, never
 * marked; "Check my own working" leads to the bank flow when the question matches an item.
 * When the reads disagreed or were unsure: the read-back and the first hint only.
 */
export function Guide() {
  return <RequireRole roles={['learner']}>{() => <GuideScreen />}</RequireRole>
}

const POLL_MS = 2_000
const SLOW_AFTER_MS = 25_000

function GuideScreen() {
  const { id = '' } = useParams()
  const [guide, setGuide] = useState<GuideView | null>(null)
  const [error, setError] = useState<unknown>(null)
  const [tick, setTick] = useState(0)
  const [startedAt] = useState(() => Date.now())
  const [slow, setSlow] = useState(false)

  useEffect(() => {
    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | null = null
    getGuide(id)
      .then((result) => {
        if (cancelled) return
        setGuide(result.guide)
        setError(null)
        if (result.guide.status === 'reading') {
          timer = setTimeout(() => {
            setSlow(Date.now() - startedAt > SLOW_AFTER_MS)
            setTick((n) => n + 1)
          }, POLL_MS)
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err)
      })
    return () => {
      cancelled = true
      if (timer) clearTimeout(timer)
    }
    // `tick` drives the poll.
  }, [id, tick, startedAt])

  if (!guide) {
    return (
      <LearnerShell>
        <h1 className="text-display font-semibold text-balance">Help me with a question</h1>
        {error ? <FormError error={error} /> : <p className="text-fg-muted" aria-live="polite">Loading…</p>}
      </LearnerShell>
    )
  }

  if (guide.status === 'reading') {
    return (
      <LearnerShell>
        <h1 className="text-display font-semibold text-balance">Help me with a question</h1>
        <p className="m-0 text-sm text-fg-muted">{GUIDE_LABEL}</p>
        <Card>
          <p role="status" aria-live="polite" className="m-0 inline-flex items-center gap-2">
            <span aria-hidden="true" className="inline-block h-2 w-2 animate-pulse rounded-full bg-progress" />
            Reading your question…
          </p>
          <p className="m-0 text-sm text-fg-muted">{slow ? 'Still reading. Two separate reads must agree before you see a step; this can take up to a minute.' : 'Two separate reads must agree before you see a step.'}</p>
          {guide.sourceText ? <MathText as="p" text={guide.sourceText} className="m-0 font-serif whitespace-pre-wrap text-fg-muted" /> : null}
        </Card>
      </LearnerShell>
    )
  }

  if (guide.status === 'failed' || !guide.question) {
    return (
      <LearnerShell>
        <h1 className="text-display font-semibold text-balance">Help me with a question</h1>
        <p className="m-0 text-sm text-fg-muted">{GUIDE_LABEL}</p>
        <Card title="Not this time">
          <p className="m-0">{guide.message}</p>
          <div className="flex flex-wrap gap-2">
            <Link to="/bring?for=question" className="inline-flex min-h-11 items-center justify-center rounded-card bg-action px-5 font-medium text-ground no-underline">
              Type it instead
            </Link>
            <Link to="/bring" className="inline-flex min-h-11 items-center justify-center rounded-card border border-fg-muted/50 bg-surface px-5 font-medium text-fg no-underline">
              Bring something else
            </Link>
          </div>
        </Card>
        <FormError error={error} />
      </LearnerShell>
    )
  }

  return <GuideBody guide={guide} question={guide.question} />
}

function GuideBody({ guide, question }: { guide: GuideView; question: NonNullable<GuideView['question']> }) {
  const navigate = useNavigate()
  const total = guide.status === 'ready' ? guide.steps.length : 0
  const [state, dispatch] = useReducer((current: typeof initialReveal, action: Parameters<typeof reveal>[1]) => reveal(current, action, total), initialReveal)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(question.questionMd)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const [editKey] = useState(() => crypto.randomUUID())
  const editId = useId()
  const unsure = guide.status === 'unsure'
  const answerShown = answerVisible(state, total)

  async function readAgain() {
    const text = draft.trim()
    if (!text || busy) return
    setBusy(true)
    setError(null)
    try {
      const result = await createGuide({ editOf: guide.id, text, idempotencyKey: editKey }, null)
      void navigate(`/guide/${result.guide.id}`)
    } catch (err) {
      setError(err)
    } finally {
      setBusy(false)
    }
  }

  return (
    <LearnerShell>
      <h1 className="text-display font-semibold text-balance">Help me with a question</h1>
      <p className="m-0 text-sm text-fg-muted">{GUIDE_LABEL}</p>

      <Card title="Is this your question?">
        <MathText as="div" text={question.questionMd} className="font-serif whitespace-pre-wrap" />
        <p className="m-0 text-sm text-fg-muted">
          {question.subject}
          {question.topic ? ` · ${question.topic}` : ''}
          {guide.editedFromId ? ' · read again from your correction' : ''}
        </p>
        {editing ? (
          <form
            className="flex flex-col gap-3"
            onSubmit={(event) => {
              event.preventDefault()
              void readAgain()
            }}
          >
            <MathInput id={editId} label="Correct the question" value={draft} onChange={setDraft} rows={4} maxLength={MAX_GUIDE_TEXT} required disabled={busy} hint="Fix what was misread. It is read again once." />
            <div className="flex flex-wrap gap-2">
              <Button type="submit" disabled={busy || !draft.trim()}>
                {busy ? 'Sending…' : 'Read it again'}
              </Button>
              <Button type="button" variant="quiet" onClick={() => setEditing(false)} disabled={busy}>
                Keep it
              </Button>
            </div>
          </form>
        ) : guide.canEdit ? (
          <div>
            <Button type="button" variant="quiet" onClick={() => setEditing(true)}>
              Edit
            </Button>
          </div>
        ) : null}
        {guide.matchedItemId ? (
          <p className="m-0 text-sm">
            Your teacher set this one. <Link to={`/bring?item=${encodeURIComponent(guide.matchedItemId)}`}>Check my own working</Link>
          </p>
        ) : null}
      </Card>

      {unsure ? (
        <Card title="Not sure yet">
          <p className="m-0 font-medium">{guide.message}</p>
          {guide.steps[0] ? <StepCard step={guide.steps[0]} state="current" hintOpen={state.hints.includes(1)} onHint={() => dispatch({ type: 'hint', step: 1 })} onShow={null} last={false} /> : null}
        </Card>
      ) : (
        <section aria-label="Steps" className="flex flex-col gap-3">
          {guide.steps.map((step) => (
            <StepCard
              key={step.stepNo}
              step={step}
              state={stepState(state, step.stepNo)}
              hintOpen={state.hints.includes(step.stepNo)}
              onHint={() => dispatch({ type: 'hint', step: step.stepNo })}
              onShow={() => dispatch({ type: 'show-step' })}
              last={step.stepNo === total}
            />
          ))}
        </section>
      )}

      {!unsure && total > 0 ? (
        answerShown ? (
          <Card title="The answer">
            <MathText as="div" text={guide.finalAnswer ?? ''} className="font-serif text-lg whitespace-pre-wrap" />
            <p className="m-0 text-sm text-fg-muted">Checked by two separate reads that agreed. Not marked by your teacher.</p>
          </Card>
        ) : state.confirming ? (
          <Card>
            <p className="m-0 font-medium">Try the steps first?</p>
            <div className="flex flex-wrap gap-2">
              <Button type="button" onClick={() => dispatch({ type: 'keep-going' })}>
                Keep going
              </Button>
              <Button type="button" variant="quiet" onClick={() => dispatch({ type: 'confirm-answer' })}>
                Show it anyway
              </Button>
            </div>
          </Card>
        ) : (
          <div>
            <Button type="button" variant="quiet" onClick={() => dispatch({ type: 'ask-answer' })}>
              Show the answer
            </Button>
          </div>
        )
      ) : null}

      <FormError error={error} />
      <p className="text-sm text-fg-muted">
        Nothing here is marked, and nothing moves your Brain. For a mark, <Link to="/bring">check your work</Link> on a question your teacher set.
      </p>
    </LearnerShell>
  )
}

function StepCard({
  step,
  state,
  hintOpen,
  onHint,
  onShow,
  last,
}: {
  step: GuideStepView
  state: 'done' | 'current' | 'locked'
  hintOpen: boolean
  onHint: () => void
  /** Null when the worked step may not be shown (unsure). */
  onShow: (() => void) | null
  last: boolean
}) {
  const tryId = useId()
  const [attempt, setAttempt] = useState('')
  const headingId = useId()

  if (state === 'locked') {
    return (
      <section aria-labelledby={headingId} className="flex flex-col gap-1 rounded-card border border-dashed border-fg-muted/40 p-4 text-fg-muted">
        <h2 id={headingId} className="m-0 text-base font-medium">
          Step {step.stepNo}
        </h2>
        <p className="m-0 text-sm">Unlocks after step {step.stepNo - 1}.</p>
      </section>
    )
  }

  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-3 rounded-card bg-surface p-4">
      <h2 id={headingId} className="m-0 text-lg font-semibold">
        Step {step.stepNo}
        {state === 'done' ? <span className="sr-only"> (shown)</span> : null}
      </h2>
      <MathText as="p" text={step.goal} className="m-0 font-medium" />
      {state === 'current' ? (
        <MathInput id={tryId} label="Try it yourself (optional)" value={attempt} onChange={setAttempt} rows={3} placeholder="Your working for this step" hint="Only you see this. Then open the hint, or show the step." />
      ) : null}
      {hintOpen ? (
        <aside className="flex flex-col gap-1 rounded-card bg-[color-mix(in_srgb,var(--color-progress)_10%,var(--color-ground))] p-3">
          <span className="text-sm font-medium text-fg-muted">Hint</span>
          <MathText as="p" text={step.hint} className="m-0 text-balance" />
        </aside>
      ) : null}
      {state === 'done' && step.worked !== null ? (
        <div className="flex flex-col gap-1 rounded-card bg-ground p-3">
          <span className="text-sm font-medium text-fg-muted">Worked</span>
          <MathText as="div" text={step.worked} className="font-serif whitespace-pre-wrap" />
        </div>
      ) : null}
      {state === 'current' ? (
        <div className="flex flex-wrap gap-2">
          {!hintOpen ? (
            <Button type="button" variant="quiet" onClick={onHint}>
              Hint
            </Button>
          ) : null}
          {onShow ? (
            <Button type="button" onClick={onShow}>
              {last ? 'Show the last step' : 'Show this step'}
            </Button>
          ) : null}
        </div>
      ) : null}
    </section>
  )
}
