import { useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { MAX_PROFILE_ANSWER_LENGTH, type ProfileCards, type ProfileSource, type SetProfileBody } from '@guardian-book/shared'
import { setProfile } from '../../../api/learner'
import { RequireRole } from '../../../app/RequireRole'
import { CardsEditor } from '../../../components/CardsEditor'
import { Button, Field, FormError } from '../../../components/Form'
import { LearnerShell } from '../../../components/LearnerShell'
import { SkeletonCard } from '../../../components/Skeleton'
import { StatusChip } from '../../../components/StatusChip'

/**
 * L0 · Tell me about you (spec 05 §4.2): four prompts, one per step, then the four cards
 * the model produced, each editable. Skip is always allowed; Today works without cards.
 */
export function Setup() {
  return <RequireRole roles={['learner']}>{() => <SetupScreen />}</RequireRole>
}

const PROMPTS: Array<{ key: keyof SetProfileBody; question: string; hint: string }> = [
  { key: 'dream', question: 'What do you want to be or do one day?', hint: 'A sentence is enough. It helps us say why a step matters.' },
  { key: 'subjects', question: 'Which subjects are you taking?', hint: 'Separate them with commas.' },
  { key: 'hardestSubject', question: 'Which one is hardest right now?', hint: 'Just the subject.' },
  { key: 'howILearn', question: 'How do you like to learn: reading, seeing, hearing, doing?', hint: 'Say what works for you. We keep your words; we never label you.' },
]

const EMPTY: SetProfileBody = { dream: '', subjects: '', hardestSubject: '', howILearn: '' }

type Stage = { kind: 'ask'; step: number } | { kind: 'making' } | { kind: 'cards'; cards: ProfileCards; source: ProfileSource }

function SetupScreen() {
  const navigate = useNavigate()
  const [answers, setAnswers] = useState<SetProfileBody>(EMPTY)
  const [stage, setStage] = useState<Stage>({ kind: 'ask', step: 0 })
  const [error, setError] = useState<unknown>(null)

  async function finish(final: SetProfileBody) {
    if (Object.values(final).every((value) => value.trim().length === 0)) {
      void navigate('/today', { replace: true })
      return
    }
    setStage({ kind: 'making' })
    setError(null)
    try {
      const result = await setProfile(final)
      setStage({ kind: 'cards', cards: result.cards, source: result.source })
    } catch (err) {
      setError(err)
      setStage({ kind: 'ask', step: PROMPTS.length - 1 })
    }
  }

  if (stage.kind === 'making') {
    return (
      <LearnerShell>
        <h1 className="text-display font-semibold text-balance">Reading your words…</h1>
        <p className="text-fg-muted" role="status" aria-live="polite">
          Making four cards from what you wrote. Nothing is added that you did not say.
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </div>
      </LearnerShell>
    )
  }

  if (stage.kind === 'cards') {
    return (
      <LearnerShell>
        <h1 className="text-display font-semibold text-balance">This is what Guardian Book knows about you.</h1>
        <p className="text-fg-muted">Change anything.</p>
        <SourceNote source={stage.source} />
        <CardsEditor cards={stage.cards} saveLabel="Save and go to Today" onSaved={() => void navigate('/today', { replace: true })} />
        <p className="text-sm text-fg-muted">
          <Link to="/today">Skip for now</Link>. You can edit these any time under Me.
        </p>
      </LearnerShell>
    )
  }

  const prompt = PROMPTS[stage.step]
  if (!prompt) return null
  const last = stage.step === PROMPTS.length - 1
  const value = answers[prompt.key]

  function next() {
    if (last) {
      void finish(answers)
    } else {
      setStage({ kind: 'ask', step: stage.kind === 'ask' ? stage.step + 1 : 0 })
    }
  }

  return (
    <LearnerShell>
      <h1 className="text-sm font-medium text-fg-muted tnum">
        Tell me about you · {stage.step + 1} of {PROMPTS.length}
      </h1>
      <form
        onSubmit={(event) => {
          event.preventDefault()
          next()
        }}
        className="flex flex-col gap-5"
      >
        <Field label={prompt.question} htmlFor={`answer-${prompt.key}`} hint={prompt.hint}>
          <textarea
            id={`answer-${prompt.key}`}
            key={prompt.key}
            value={value}
            onChange={(event) => setAnswers({ ...answers, [prompt.key]: event.target.value.slice(0, MAX_PROFILE_ANSWER_LENGTH) })}
            maxLength={MAX_PROFILE_ANSWER_LENGTH}
            rows={4}
            autoFocus
            className="w-full rounded-card border border-fg-muted/50 bg-ground px-3 py-2 text-base text-fg placeholder:text-fg-muted focus-visible:border-action"
          />
        </Field>
        <p className="text-xs text-fg-muted tnum" aria-live="polite">
          {value.length}/{MAX_PROFILE_ANSWER_LENGTH}
        </p>
        <FormError error={error} />
        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit">{last ? 'Make my cards' : 'Next'}</Button>
          {stage.step > 0 ? (
            <Button type="button" variant="quiet" onClick={() => setStage({ kind: 'ask', step: stage.step - 1 })}>
              Back
            </Button>
          ) : null}
          <button
            type="button"
            onClick={() => {
              const cleared = { ...answers, [prompt.key]: '' }
              setAnswers(cleared)
              if (last) void finish(cleared)
              else setStage({ kind: 'ask', step: stage.step + 1 })
            }}
            className="min-h-11 px-2 text-sm text-fg-muted underline"
          >
            Skip this one
          </button>
        </div>
      </form>
      <p className="text-sm text-fg-muted">
        Your words are kept once and never shown to a parent. The cards are yours to edit. <Link to="/today">Skip all for now</Link>.
      </p>
    </LearnerShell>
  )
}

function SourceNote({ source }: { source: ProfileSource }) {
  if (source === 'model') {
    return (
      <p className="text-sm text-fg-muted">
        Read from your words by the model and checked: no labels about you, only what you said. <StatusChip status="LIVE" />
      </p>
    )
  }
  if (source === 'prototype') {
    return (
      <p className="text-sm text-fg-muted">
        The model is not configured on this server, so these cards are your words as typed. <StatusChip status="PROTOTYPE" />
      </p>
    )
  }
  return (
    <div role="status" className="rounded-card bg-surface p-3 text-sm">
      <p className="font-medium">We could not make cards from that.</p>
      <p className="text-fg-muted">
        {source === 'uncertain' ? 'The model kept adding labels about you, so we kept nothing.' : 'The model did not answer.'} Fill the cards in yourself.
      </p>
    </div>
  )
}
