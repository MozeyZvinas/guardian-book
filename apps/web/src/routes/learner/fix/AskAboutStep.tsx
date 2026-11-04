import { useId, useState } from 'react'
import { ASK_YOUR_TEACHER, MAX_QUESTION_CHARS, type AskResponse } from '@guardian-book/shared'
import { ApiRequestError } from '../../../api/client'
import { Button, FormError } from '../../../components/Form'
import { MathText } from '../../../components/MathText'
import { VoiceButton } from '../../../components/VoiceButton'
import { askAboutStep } from './ask'

/**
 * Ask about this step (brief B13 §1, §4): a text box and a hold-to-talk button. The
 * learner asks in their own words; the transcript is shown (never the audio) and can be
 * edited before sending. The hint comes back in B06's hint-card style, maths through
 * MathText; a quiet "Ask again" counts against the daily cap. When nothing verified comes
 * back: "Ask your teacher about this step." and nothing else.
 */
export function AskAboutStep({ attemptId, stepNo, locked = false }: { attemptId: string; stepNo?: number; locked?: boolean }) {
  const [question, setQuestion] = useState('')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<AskResponse | null>(null)
  const [error, setError] = useState<unknown>(null)
  const textId = useId()
  const headingId = useId()
  const hintId = useId()

  async function send() {
    const text = question.trim()
    if (!text || busy) return
    setBusy(true)
    setError(null)
    try {
      setResult(await askAboutStep(attemptId, stepNo === undefined ? { question: text } : { question: text, stepNo }))
    } catch (err) {
      setResult(null)
      setError(err instanceof ApiRequestError && err.status === 409 ? new Error(err.message) : err)
    } finally {
      setBusy(false)
    }
  }

  const stepLabel = stepNo === undefined ? 'this step' : `step ${stepNo}`

  if (locked) {
    return (
      <section aria-labelledby={headingId} className="flex flex-col gap-2 rounded-card bg-surface p-4">
        <h2 id={headingId} className="text-lg font-semibold">
          Ask about a step
        </h2>
        <p className="m-0 text-sm text-fg-muted">Paused while you check it alone. Submit first; then ask from your feedback.</p>
      </section>
    )
  }

  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-3 rounded-card bg-surface p-4">
      <h2 id={headingId} className="text-lg font-semibold">
        Ask about {stepLabel}
      </h2>
      <p className="m-0 text-sm text-fg-muted">In your own words. You get a hint, never the answer.</p>
      <form
        className="flex flex-col gap-3"
        onSubmit={(event) => {
          event.preventDefault()
          void send()
        }}
      >
        <label htmlFor={textId} className="text-sm font-medium">
          Your question about {stepLabel}
        </label>
        <textarea
          id={textId}
          name="question"
          rows={3}
          maxLength={MAX_QUESTION_CHARS}
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
          placeholder="I don’t get why it’s minus six"
          className="w-full rounded-card border border-fg-muted/50 bg-ground px-3 py-2 text-base text-fg placeholder:text-fg-muted focus-visible:border-action"
        />
        <VoiceButton disabled={busy} onTranscript={(text) => setQuestion((current) => (current.trim() ? `${current.trim()} ${text}` : text))} />
        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" disabled={busy || !question.trim()}>
            {busy ? 'Thinking…' : result ? 'Ask again' : 'Ask'}
          </Button>
          {busy ? (
            <span role="status" aria-live="polite" className="inline-flex items-center gap-2 text-sm text-fg-muted">
              <span aria-hidden="true" className="inline-block h-2 w-2 animate-pulse rounded-full bg-progress" />
              Getting a hint…
            </span>
          ) : null}
        </div>
      </form>

      {result?.status === 'accepted' && result.hint ? (
        <aside aria-labelledby={hintId} className="flex flex-col gap-1 rounded-card bg-[color-mix(in_srgb,var(--color-progress)_10%,var(--color-ground))] p-4">
          <h3 id={hintId} className="text-sm font-medium text-fg-muted">
            Hint for step {result.stepNo}
          </h3>
          <MathText as="p" text={result.hint} className="m-0 text-balance" />
        </aside>
      ) : null}
      {result && result.status !== 'accepted' ? (
        <aside aria-labelledby={hintId} className="rounded-card bg-ground p-4">
          <h3 id={hintId} className="text-sm font-medium text-fg-muted">
            Step {result.stepNo}
          </h3>
          <p className="m-0 font-medium">{result.message ?? ASK_YOUR_TEACHER}</p>
        </aside>
      ) : null}
      <FormError error={error} />
    </section>
  )
}
