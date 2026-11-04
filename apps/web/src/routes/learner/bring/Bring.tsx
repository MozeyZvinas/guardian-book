import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import type { InputKind, InputView, ItemSummary } from '@guardian-book/shared'
import { ApiRequestError } from '../../../api/client'
import { assess, createInput, items as fetchItems, setInputKind } from '../../../api/practice'
import { RequireRole } from '../../../app/RequireRole'
import { CaptureSheet, type Capture } from '../../../components/CaptureSheet'
import { Button, Card, FormError } from '../../../components/Form'
import { KindChips } from '../../../components/KindChip'
import { LearnerShell } from '../../../components/LearnerShell'
import { MathText } from '../../../components/MathText'
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

/**
 * B09: a judge who arrived through /try gets one approved question suggested, with
 * working they can type that stops one step short, so the first check shows the loop.
 * Keyed by slug; an item without a line here is suggested without working.
 */
const SUGGESTED_WORKING: Record<string, string> = {
  'alg-12-factorise-trinomial': 'x² − 5x + 6 = 0\n(x − 2)(x − 3) = 0',
  'alg-12-factorise-trinomial-2': 'x² + x − 12 = 0\n(x + 4)(x − 3) = 0',
  'alg-12-nature-of-roots': 'Equal roots when Δ = b² − 4ac = 0\n36 − 4k = 0',
}

function BringScreen() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const tryIt = params.get('try') === '1'
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
      .then((result) => {
        setItemList(result.items)
        // The suggested question is preselected in the picker for a try-it visitor.
        const first = result.items.find((item) => item.approvedForYou !== false)
        if (tryIt && first) setItemId(first.id)
      })
      .catch((err: unknown) => setError(err))
  }, [tryIt])

  const suggested = tryIt ? (itemList?.find((item) => item.approvedForYou !== false) ?? null) : null

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

      {suggested && stage.step === 'capture' ? (
        <Card title="Try this question">
          <MathText as="p" text={suggested.promptMd} className="m-0 font-serif whitespace-pre-wrap" />
          <p className="m-0 text-sm text-fg-muted tnum">
            {suggested.topic} · {suggested.maxMarks} marks · approved for your class
          </p>
          {SUGGESTED_WORKING[suggested.slug] ? (
            <>
              <p className="m-0 text-sm">
                Tap <strong>Type</strong>, enter this working and stop one step short, to see where it slipped and the hint:
              </p>
              <pre className="m-0 rounded-card bg-ground p-3 font-sans text-base whitespace-pre-wrap">{SUGGESTED_WORKING[suggested.slug]}</pre>
            </>
          ) : null}
          <p className="m-0 text-sm text-fg-muted">Or snap a photo of your own working on this question. The check reads it against the teacher’s marking guideline.</p>
        </Card>
      ) : null}

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
              {/* B09: the picker shows the question itself (MathText) and the marks, never the slug;
                  the learner's approved questions come first (the server orders them). */}
              <fieldset className="m-0 flex min-w-0 flex-col gap-2 border-0 p-0">
                <legend className="mb-1 text-sm font-medium">Which question is this?</legend>
                {!itemList ? <p className="m-0 text-sm text-fg-muted">Loading questions…</p> : null}
                {itemList?.length === 0 ? <p className="m-0 text-sm text-fg-muted">No approved questions yet. Ask your teacher.</p> : null}
                {(itemList ?? []).map((item) => {
                  const selected = item.id === itemId
                  const unapproved = item.approvedForYou === false
                  return (
                    <label
                      key={item.id}
                      className={[
                        'flex min-h-11 min-w-0 items-start gap-3 rounded-card border px-3 py-2',
                        unapproved ? 'cursor-not-allowed border-fg-muted/30 text-fg-muted' : 'cursor-pointer',
                        selected ? 'border-fg bg-ground' : unapproved ? '' : 'border-fg-muted/50',
                      ].join(' ')}
                    >
                      <input
                        type="radio"
                        name="item"
                        value={item.id}
                        checked={selected}
                        disabled={unapproved || busy}
                        onChange={() => setItemId(item.id)}
                        className="mt-1.5 size-5 shrink-0 accent-[var(--gb-action)]"
                      />
                      <span className="flex min-w-0 flex-col gap-0.5">
                        <MathText as="span" text={item.promptMd} className="font-serif whitespace-pre-wrap" />
                        <span className="text-sm tnum">
                          {item.topic} · {item.maxMarks} marks
                          {unapproved ? ' · not approved for your class yet' : ''}
                        </span>
                      </span>
                    </label>
                  )
                })}
              </fieldset>
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
