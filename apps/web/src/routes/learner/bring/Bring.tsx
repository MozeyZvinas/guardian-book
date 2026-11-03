import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import type { InputKind, InputView, ItemSummary } from '@guardian-book/shared'
import { ApiRequestError } from '../../../api/client'
import { assess, createInput, items as fetchItems, setInputKind } from '../../../api/practice'
import { RequireRole } from '../../../app/RequireRole'
import { CaptureSheet, type Capture } from '../../../components/CaptureSheet'
import { Button, Card, FormError } from '../../../components/Form'
import { KindChips } from '../../../components/KindChip'
import { LearnerShell } from '../../../components/LearnerShell'
import { StatusChip } from '../../../components/StatusChip'

/**
 * L2 · Bring anything (spec 05 §4.2): one capture for everything. Snap · Type · Ask;
 * the what-is-this chip; the item picker for homework; then the check starts and the
 * learner lands on their feedback page.
 */
export function Bring() {
  return <RequireRole roles={['learner']}>{() => <BringScreen />}</RequireRole>
}

type Stage =
  | { step: 'capture' }
  | { step: 'uploading' }
  | { step: 'routing'; input: InputView; kind: InputKind | null; pickItem: boolean }
  | { step: 'saved'; input: InputView }

function BringScreen() {
  const navigate = useNavigate()
  const [stage, setStage] = useState<Stage>({ step: 'capture' })
  const [capture, setCapture] = useState<Capture | null>(null)
  const [itemList, setItemList] = useState<ItemSummary[] | null>(null)
  const [itemId, setItemId] = useState<string>('')
  const [error, setError] = useState<unknown>(null)
  const [busy, setBusy] = useState(false)
  // One key per capture: a retry after a dropped connection never uploads twice.
  const [idempotencyKey, setIdempotencyKey] = useState(() => crypto.randomUUID())

  useEffect(() => {
    fetchItems()
      .then((result) => setItemList(result.items))
      .catch((err: unknown) => setError(err))
  }, [])

  async function startCheck(attemptId: string) {
    try {
      await assess(attemptId)
    } catch (err) {
      // A cap or a paused model: the feedback page says so and keeps the work.
      if (!(err instanceof ApiRequestError && (err.status === 429 || err.status === 503))) throw err
    }
    void navigate(`/attempts/${attemptId}`)
  }

  /** The server answered: route by what it said, or ask the learner. */
  async function settle(input: InputView, chosenKind?: InputKind) {
    if (input.attemptId) {
      await startCheck(input.attemptId)
      return
    }
    const kind = chosenKind ?? (input.needsKind ? null : input.kind)
    if (input.needsKind && !chosenKind) {
      setStage({ step: 'routing', input, kind: input.kind, pickItem: false })
      return
    }
    if (kind === 'work') {
      setStage({ step: 'routing', input, kind, pickItem: true })
      return
    }
    if (kind === 'notice') {
      void navigate(`/calendar?input=${encodeURIComponent(input.id)}`)
      return
    }
    setStage({ step: 'saved', input })
  }

  async function onCapture(next: Capture) {
    setCapture(next)
    setError(null)
    setBusy(true)
    setStage({ step: 'uploading' })
    try {
      const statedKind: InputKind | undefined = next.mode === 'ask' ? 'question' : next.mode === 'type' ? 'work' : undefined
      const result = await createInput(
        {
          idempotencyKey,
          ...(statedKind ? { kind: statedKind } : {}),
          ...(next.text !== null ? { text: next.text } : {}),
        },
        next.file?.blob ?? null,
        next.file?.filename,
      )
      await settle(result.input)
    } catch (err) {
      setError(err)
      setStage({ step: 'capture' })
    } finally {
      setBusy(false)
    }
  }

  async function route(kind: InputKind, withItemId?: string) {
    if (stage.step !== 'routing') return
    setError(null)
    setBusy(true)
    try {
      const result = await setInputKind(stage.input.id, { kind, ...(withItemId ? { itemId: withItemId } : {}) })
      await settle(result.input, kind)
    } catch (err) {
      setError(err instanceof ApiRequestError && err.code === 'guideline_not_approved' ? new Error(err.message) : err)
    } finally {
      setBusy(false)
    }
  }

  function startOver() {
    setStage({ step: 'capture' })
    setCapture(null)
    setItemId('')
    setError(null)
    setIdempotencyKey(crypto.randomUUID())
  }

  return (
    <LearnerShell>
      <h1 className="text-display font-semibold text-balance">Bring anything</h1>
      <p className="text-fg-muted">Homework, a school notice, or a question about a step. One photo, or type it.</p>

      {stage.step === 'capture' ? <CaptureSheet onCapture={onCapture} disabled={busy} /> : null}

      {stage.step === 'uploading' ? (
        <p role="status" aria-live="polite" className="rounded-card bg-surface p-4">
          {capture?.file ? 'Uploading your photo…' : 'Sending…'}
        </p>
      ) : null}

      {stage.step === 'routing' ? (
        <Card title={capture?.file ? 'Your photo is in' : 'Got it'}>
          <KindChips
            value={stage.kind}
            uncertain={stage.input.needsKind && !stage.pickItem}
            disabled={busy}
            onChange={(kind) => {
              if (kind === 'work') setStage({ ...stage, kind, pickItem: true })
              else void route(kind)
            }}
          />
          {stage.pickItem && stage.kind === 'work' ? (
            <form
              className="flex flex-col gap-3"
              onSubmit={(event) => {
                event.preventDefault()
                if (itemId) void route('work', itemId)
              }}
            >
              <label htmlFor="item" className="text-sm font-medium">
                Which question is this?
              </label>
              <select
                id="item"
                value={itemId}
                onChange={(event) => setItemId(event.target.value)}
                required
                className="min-h-11 w-full rounded-card border border-fg-muted/50 bg-ground px-3 text-base text-fg"
              >
                <option value="" disabled>
                  {itemList ? 'Choose a question' : 'Loading questions…'}
                </option>
                {(itemList ?? []).map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.topic} · {item.slug} · {item.maxMarks} marks
                  </option>
                ))}
              </select>
              <div className="flex flex-wrap gap-2">
                <Button type="submit" disabled={busy || !itemId}>
                  {busy ? 'Starting the check…' : 'Check my work'}
                </Button>
                <Button type="button" variant="quiet" onClick={startOver} disabled={busy}>
                  Start over
                </Button>
              </div>
            </form>
          ) : null}
        </Card>
      ) : null}

      {stage.step === 'saved' ? (
        <Card title="Saved">
          <p>
            Your question is kept with your work. Answers to questions arrive with your plan. <StatusChip status="PLANNED" />
          </p>
          <div>
            <Button type="button" variant="quiet" onClick={startOver}>
              Bring something else
            </Button>
          </div>
        </Card>
      ) : null}

      <FormError error={error} />
      {stage.step === 'capture' ? (
        <p className="text-sm text-fg-muted">
          Photos are stored privately and stripped of location data. Your parent never sees your work or your photos. <Link to="/calendar">Calendar</Link>
        </p>
      ) : null}
    </LearnerShell>
  )
}
