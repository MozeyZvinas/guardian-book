import { useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { MAX_PROFILE_SUBJECTS, type ProfileCards, type ProfileSource } from '@guardian-book/shared'
import { setProfile } from '../../../api/learner'
import { RequireRole } from '../../../app/RequireRole'
import { CardsEditor } from '../../../components/CardsEditor'
import { Button, Field, FormError, Select, TextInput } from '../../../components/Form'
import { LearnerShell } from '../../../components/LearnerShell'
import { SkeletonCard } from '../../../components/Skeleton'
import { StatusChip } from '../../../components/StatusChip'
import { CAPS_FET_SUBJECTS, DREAM_EXAMPLES, EMPTY_TAPS, GRADES, LEARN_OPTIONS, OTHER_SUBJECT, chosenSubjects, composeAnswers, isBlank, type SetupTaps } from './options'

/**
 * L0 · Tell me about you (spec 05 §4.2; B16 §1): quick taps, not essays. Grade, subjects,
 * the hardest one, a fill-in-the-gap dream and how the learner likes to learn (their own
 * choice, never a label), then the four cards the model made, each editable. Skip is
 * always allowed; Today works without cards.
 */
export function Setup() {
  return <RequireRole roles={['learner']}>{() => <SetupScreen />}</RequireRole>
}

type Stage = { kind: 'taps' } | { kind: 'making' } | { kind: 'cards'; cards: ProfileCards; source: ProfileSource }

function SetupScreen() {
  const navigate = useNavigate()
  const [taps, setTaps] = useState<SetupTaps>(EMPTY_TAPS)
  const [stage, setStage] = useState<Stage>({ kind: 'taps' })
  const [error, setError] = useState<unknown>(null)

  async function finish() {
    if (isBlank(taps)) {
      void navigate('/today', { replace: true })
      return
    }
    setStage({ kind: 'making' })
    setError(null)
    try {
      const result = await setProfile(composeAnswers(taps))
      setStage({ kind: 'cards', cards: result.cards, source: result.source })
    } catch (err) {
      setError(err)
      setStage({ kind: 'taps' })
    }
  }

  if (stage.kind === 'making') {
    return (
      <LearnerShell>
        <h1 className="text-display font-semibold text-balance">Making your cards…</h1>
        <p className="text-fg-muted" role="status" aria-live="polite">
          Four cards from what you tapped. Nothing is added that you did not say.
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
        <p className="text-fg-muted">Change anything. These cards shape every step we suggest.</p>
        <SourceNote source={stage.source} />
        <CardsEditor cards={stage.cards} saveLabel="Save and go to Today" onSaved={() => void navigate('/today', { replace: true })} />
        <p className="text-sm text-fg-muted">
          <Link to="/today">Skip for now</Link>. You can edit these any time under Me.
        </p>
      </LearnerShell>
    )
  }

  const subjects = chosenSubjects(taps)
  const otherOn = taps.subjects.includes(OTHER_SUBJECT)
  const full = taps.subjects.filter((s) => s !== OTHER_SUBJECT).length >= MAX_PROFILE_SUBJECTS

  function toggleSubject(subject: string) {
    setTaps((current) => {
      const on = current.subjects.includes(subject)
      const next = on ? current.subjects.filter((s) => s !== subject) : [...current.subjects, subject]
      const hardest = subject === current.hardest && on ? '' : current.hardest
      return { ...current, subjects: next, hardest, otherSubject: subject === OTHER_SUBJECT && on ? '' : current.otherSubject }
    })
  }

  return (
    <LearnerShell>
      <div className="flex flex-col gap-2">
        <h1 className="text-display font-semibold text-balance">Tell me about you</h1>
        <p className="text-fg-muted">Quick taps, no essays. They help us say why a step matters to you, in your words.</p>
      </div>
      <form
        onSubmit={(event) => {
          event.preventDefault()
          void finish()
        }}
        className="flex flex-col gap-6"
      >
        <Field label="Grade" htmlFor="setup-grade">
          <Select id="setup-grade" value={taps.grade} onChange={(event) => setTaps({ ...taps, grade: event.target.value })}>
            <option value="">Choose…</option>
            {GRADES.map((grade) => (
              <option key={grade.value} value={grade.value}>
                {grade.label}
              </option>
            ))}
          </Select>
        </Field>

        <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
          <legend className="text-sm font-medium">My subjects</legend>
          <p className="text-sm text-fg-muted">Tap each one you take{full ? ` (${MAX_PROFILE_SUBJECTS} is the most the cards hold)` : ''}.</p>
          <div className="flex flex-wrap gap-2">
            {[...CAPS_FET_SUBJECTS, OTHER_SUBJECT].map((subject) => {
              const on = taps.subjects.includes(subject)
              return <Chip key={subject} on={on} disabled={!on && full && subject !== OTHER_SUBJECT} onClick={() => toggleSubject(subject)} label={subject} />
            })}
          </div>
          {otherOn ? (
            <Field label="Other subject" htmlFor="setup-other">
              <TextInput id="setup-other" value={taps.otherSubject} onChange={(event) => setTaps({ ...taps, otherSubject: event.target.value.slice(0, 60) })} autoComplete="off" maxLength={60} />
            </Field>
          ) : null}
        </fieldset>

        <Field label="The subject I find hardest" htmlFor="setup-hardest" hint={subjects.length === 0 ? 'Tap your subjects first.' : undefined}>
          <Select id="setup-hardest" value={subjects.includes(taps.hardest) ? taps.hardest : ''} disabled={subjects.length === 0} onChange={(event) => setTaps({ ...taps, hardest: event.target.value })}>
            <option value="">Choose…</option>
            {subjects.map((subject) => (
              <option key={subject} value={subject}>
                {subject}
              </option>
            ))}
          </Select>
        </Field>

        <div className="flex flex-col gap-2">
          <Field label="One day I want to…" htmlFor="setup-dream" hint="Tap an example or fill the gap yourself.">
            <TextInput id="setup-dream" value={taps.dream} onChange={(event) => setTaps({ ...taps, dream: event.target.value.slice(0, 160) })} placeholder="be a …" autoComplete="off" maxLength={160} />
          </Field>
          <div className="flex flex-wrap gap-2" aria-label="Examples">
            {DREAM_EXAMPLES.map((example) => (
              <Chip key={example} on={taps.dream.trim() === example} onClick={() => setTaps({ ...taps, dream: example })} label={example} />
            ))}
          </div>
        </div>

        <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
          <legend className="text-sm font-medium">I learn best when…</legend>
          <p className="text-sm text-fg-muted">Your choice. We keep your words; we never label you.</p>
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="I learn best when">
            {LEARN_OPTIONS.map((option) => (
              <Chip key={option} on={taps.learn === option} radio onClick={() => setTaps({ ...taps, learn: taps.learn === option ? '' : option })} label={option} />
            ))}
          </div>
        </fieldset>

        <FormError error={error} />
        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit">Make my cards</Button>
          <Link to="/today" className="inline-flex min-h-11 items-center px-2 text-sm text-fg-muted">
            Skip for now
          </Link>
        </div>
      </form>
      <p className="text-sm text-fg-muted">
        Your taps are kept once and never shown to a parent; from the cards, a parent sees only your dream and your subjects. The cards are yours to edit.
      </p>
    </LearnerShell>
  )
}

/** A tappable chip: 44 px high, the chosen state said by a glyph and the pressed state, never by colour alone (A7). */
function Chip({ label, on, onClick, disabled, radio }: { label: string; on: boolean; onClick: () => void; disabled?: boolean; radio?: boolean }) {
  const state = radio ? { role: 'radio' as const, 'aria-checked': on } : { 'aria-pressed': on }
  return (
    <button
      type="button"
      {...state}
      disabled={disabled}
      onClick={onClick}
      className={['min-h-11 rounded-full px-4 text-sm font-medium disabled:opacity-50', on ? 'bg-fg text-ground' : 'bg-surface text-fg ring-1 ring-fg-muted/40'].join(' ')}
    >
      {on ? <span aria-hidden="true">● </span> : null}
      {label}
    </button>
  )
}

function SourceNote({ source }: { source: ProfileSource }) {
  if (source === 'model') {
    return (
      <p className="text-sm text-fg-muted">
        Read from your taps by the model and checked: no labels about you, only what you chose. <StatusChip status="LIVE" />
      </p>
    )
  }
  if (source === 'prototype') {
    return (
      <p className="text-sm text-fg-muted">
        The model is not configured on this server, so these cards are your taps as they were. <StatusChip status="PROTOTYPE" />
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
