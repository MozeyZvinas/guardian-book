import { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router'
import { itemResponseSchema, type AttemptMode, type ItemDetail } from '@guardian-book/shared'
import { api, ApiRequestError } from '../../../api/client'
import { assess, createAttempt, createInput } from '../../../api/practice'
import { RequireRole } from '../../../app/RequireRole'
import type { Capture } from '../../../components/CaptureSheet'
import { Card, FormError } from '../../../components/Form'
import { LearnerShell } from '../../../components/LearnerShell'
import { MathCapture } from '../fix/MathCapture'
import { MathText } from '../../../components/MathText'
import { AskAboutStep } from '../fix/AskAboutStep'

/**
 * L5 · Follow-up question (spec 05 §4.2, §9): the item rendered (KaTeX), "Why this",
 * Type or Snap, Check → L3 for the new attempt. In independent or retention mode the
 * *Independent* chip says so: no hints until you submit (the server withholds them), and
 * Ask about a step (B13) is paused; in assisted mode it asks about the step that slipped
 * on the attempt this question follows from.
 */
export function Item() {
  return <RequireRole roles={['learner']}>{() => <ItemScreen />}</RequireRole>
}

const getItem = (id: string) => api(`/api/items/${encodeURIComponent(id)}`, itemResponseSchema)

function ItemScreen() {
  const { id = '' } = useParams()
  const [params] = useSearchParams()
  const location = useLocation()
  const navigate = useNavigate()
  const from = params.get('from')
  const skill = params.get('skill')
  const mode: AttemptMode = params.get('mode') === 'retention' ? 'retention' : params.get('mode') === 'independent' ? 'independent' : 'assisted'
  const why = (location.state as { why?: string } | null)?.why ?? (from ? 'Why this: one more like the last one, on your own.' : null)
  const [item, setItem] = useState<ItemDetail | null>(null)
  const [error, setError] = useState<unknown>(null)
  const [busy, setBusy] = useState(false)
  const [idempotencyKey] = useState(() => crypto.randomUUID())

  useEffect(() => {
    let cancelled = false
    getItem(id)
      .then((result) => {
        if (!cancelled) setItem(result.item)
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err)
      })
    return () => {
      cancelled = true
    }
  }, [id])

  async function onCapture(capture: Capture) {
    setBusy(true)
    setError(null)
    try {
      let attemptId: string | null
      if (capture.file) {
        const result = await createInput({ kind: 'work', itemId: id, mode, idempotencyKey }, capture.file.blob, capture.file.filename)
        attemptId = result.input.attemptId
      } else {
        const result = await createAttempt({ itemId: id, answerText: capture.text ?? '', idempotencyKey, mode })
        attemptId = result.attemptId
      }
      if (!attemptId) throw new Error('The question could not be started. Try again.')
      try {
        await assess(attemptId)
      } catch (err) {
        if (!(err instanceof ApiRequestError && (err.status === 429 || err.status === 503))) throw err
      }
      void navigate(`/attempts/${attemptId}`)
    } catch (err) {
      setError(err instanceof ApiRequestError && err.code === 'guideline_not_approved' ? new Error(err.message) : err)
    } finally {
      setBusy(false)
    }
  }

  return (
    <LearnerShell>
      <div className="flex flex-col gap-2">
        {item ? <p className="m-0 text-sm text-fg-muted">{item.topic}</p> : null}
        <h1 className="text-display font-semibold text-balance">{mode === 'assisted' ? 'One more like it' : mode === 'retention' ? 'Check it again' : 'Check it alone'}</h1>
        {mode !== 'assisted' ? (
          <p className="m-0 flex flex-wrap items-center gap-2 text-sm">
            <span className="inline-flex items-center rounded-full bg-surface px-3 py-1 text-xs font-medium tracking-wide ring-1 ring-fg-muted/40">Independent</span>
            <span className="text-fg-muted">No hints until you submit.</span>
          </p>
        ) : null}
        {why ? <p className="m-0 text-sm text-fg-muted">{why}</p> : null}
      </div>

      {item ? (
        <Card>
          <MathText as="p" text={item.promptMd} className="m-0 font-serif whitespace-pre-wrap" />
          <p className="m-0 text-sm text-fg-muted tnum">{item.maxMarks} marks</p>
        </Card>
      ) : error ? null : (
        <p className="text-fg-muted" aria-live="polite">
          Loading the question…
        </p>
      )}

      {item ? <MathCapture onCapture={onCapture} disabled={busy} /> : null}
      {item && from ? <AskAboutStep attemptId={from} locked={mode !== 'assisted'} /> : null}
      {busy ? (
        <p role="status" aria-live="polite" className="m-0 text-fg-muted">
          Starting the check…
        </p>
      ) : null}
      <FormError error={error} />
      <p className="text-sm text-fg-muted">
        {skill ? `Skill: ${skill}. ` : ''}
        <Link to="/today">Back to Today</Link>
      </p>
    </LearnerShell>
  )
}
