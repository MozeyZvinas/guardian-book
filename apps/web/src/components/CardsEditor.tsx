import { useState, type FormEvent } from 'react'
import { MAX_PROFILE_SUBJECTS, type ProfileCards } from '@guardian-book/shared'
import { patchCards } from '../api/learner'
import { Button, Field, FormError, TextInput } from './Form'

/**
 * The four profile cards, editable (P0-02; spec 05 L0, L8). Saving is a PATCH and never a
 * model call. Subjects are typed with commas; the server keeps them as a list.
 */

export const CARD_PROMPTS = {
  dream: 'What you want to be or do one day',
  subjects: 'Your subjects',
  hardest_subject: 'Hardest right now',
  how_i_learn: 'How you like to learn',
} as const

const textareaClass =
  'min-h-24 w-full rounded-card border border-fg-muted/50 bg-ground px-3 py-2 text-base text-fg placeholder:text-fg-muted focus-visible:border-action'

export function CardsEditor({
  cards,
  onSaved,
  onCancel,
  saveLabel = 'Save',
}: {
  cards: ProfileCards
  onSaved: (cards: ProfileCards) => void
  onCancel?: () => void
  saveLabel?: string
}) {
  const [error, setError] = useState<unknown>(null)
  const [busy, setBusy] = useState(false)

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const text = (key: string, max: number) => String(form.get(key) ?? '').trim().slice(0, max)
    const subjects = [...new Set(String(form.get('subjects') ?? '').split(',').map((s) => s.trim()).filter(Boolean))]
      .slice(0, MAX_PROFILE_SUBJECTS)
      .map((s) => s.slice(0, 60))
    const body = {
      dream: text('dream', 200) || null,
      subjects,
      hardest_subject: text('hardest_subject', 60) || null,
      how_i_learn: text('how_i_learn', 300) || null,
    }
    setBusy(true)
    setError(null)
    try {
      const saved = await patchCards(body)
      if (saved.cards) onSaved(saved.cards)
    } catch (err) {
      setError(err)
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <Field label={CARD_PROMPTS.dream} htmlFor="card-dream">
        <textarea id="card-dream" name="dream" maxLength={200} defaultValue={cards.dream ?? ''} className={textareaClass} />
      </Field>
      <Field label={CARD_PROMPTS.subjects} htmlFor="card-subjects" hint="Separate with commas.">
        <TextInput id="card-subjects" name="subjects" defaultValue={cards.subjects.join(', ')} autoComplete="off" />
      </Field>
      <Field label={CARD_PROMPTS.hardest_subject} htmlFor="card-hardest">
        <TextInput id="card-hardest" name="hardest_subject" maxLength={60} defaultValue={cards.hardest_subject ?? ''} autoComplete="off" />
      </Field>
      <Field label={CARD_PROMPTS.how_i_learn} htmlFor="card-how">
        <textarea id="card-how" name="how_i_learn" maxLength={300} defaultValue={cards.how_i_learn ?? ''} className={textareaClass} />
      </Field>
      <FormError error={error} />
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={busy}>
          {busy ? 'Saving…' : saveLabel}
        </Button>
        {onCancel ? (
          <Button type="button" variant="quiet" onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
        ) : null}
      </div>
    </form>
  )
}

/** The cards as read, each one a small card. */
export function CardsView({ cards }: { cards: ProfileCards }) {
  const rows: Array<[string, string | null]> = [
    [CARD_PROMPTS.dream, cards.dream],
    [CARD_PROMPTS.subjects, cards.subjects.length > 0 ? cards.subjects.join(', ') : null],
    [CARD_PROMPTS.hardest_subject, cards.hardest_subject],
    [CARD_PROMPTS.how_i_learn, cards.how_i_learn],
  ]
  return (
    <dl className="m-0 grid gap-3 sm:grid-cols-2">
      {rows.map(([label, value]) => (
        <div key={label} className="flex flex-col gap-1 rounded-card bg-surface p-3">
          <dt className="text-xs font-medium text-fg-muted">{label}</dt>
          <dd className={['m-0', value ? '' : 'text-fg-muted'].join(' ')}>{value ?? 'Not filled in yet'}</dd>
        </div>
      ))}
    </dl>
  )
}
