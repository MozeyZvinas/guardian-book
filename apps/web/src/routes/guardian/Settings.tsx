import { useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router'
import { GUARDIAN_LANGUAGES, LANGUAGE_NAMES, TRANSLATED_BY_AI_LABEL, languageSchema, type Language, type MeResponse } from '@guardian-book/shared'
import { guardianLanguage, setGuardianLanguage } from '../../api/guardian'
import { RequireRole } from '../../app/RequireRole'
import { Button, Card, Field, FormError, Select } from '../../components/Form'
import { SignOutButton } from '../../components/SignOutButton'
import { GuardianShell } from './GuardianShell'

/** G4 · Settings (spec 05 §4.3; B12): the home language, linked learners, the transparency list, sign out. */
export function GuardianSettings() {
  return <RequireRole roles={['guardian']}>{(me) => <SettingsScreen me={me} />}</RequireRole>
}

function SettingsScreen({ me }: { me: MeResponse }) {
  return (
    <GuardianShell me={me}>
      <h1 className="text-display font-semibold text-balance">Settings</h1>
      <LanguageCard />
      <Card title="Linked learners">
        {me.learners.length > 0 ? (
          <ul className="m-0 flex list-none flex-col gap-1 p-0">
            {me.learners.map((learner) => (
              <li key={learner.learnerId}>
                <Link to={`/guardian/learners/${learner.learnerId}`}>{learner.nickname}</Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="m-0 text-sm text-fg-muted">Nobody yet.</p>
        )}
        <p className="m-0 text-sm">
          <Link to="/guardian/link">Enter a code</Link> to link another learner. A learner can unlink you any time from their Me page.
        </p>
      </Card>
      <Card title="What you can see">
        <ul className="m-0 flex list-disc flex-col gap-1 pl-5">
          <li>How much they practised: days, pieces of work, topics.</li>
          <li>What is coming up: confirmed dates only.</li>
          <li>The one topic they are stuck on, in plain words, and one thing to do.</li>
          <li>Notes and messages their teacher approved, labelled “Teacher-reviewed” or with the teacher’s name.</li>
          <li>From their cards: what they want to do one day, and their subjects.</li>
          <li>All of it in your language, if you choose one: translated by AI from the teacher-reviewed English, with the English one tap away.</li>
        </ul>
      </Card>
      <Card title="What you can’t see">
        <p className="m-0 text-sm text-fg-muted">Their work, their answers, their photos, their marks on a page, or the words they typed about themselves. Ever.</p>
      </Card>
      <div>
        <SignOutButton />
      </div>
    </GuardianShell>
  )
}

/** The parent's home language (B12 §1): stored on the profile; This week and Notes follow it. */
function LanguageCard() {
  const [language, setLanguage] = useState<Language | null>(null)
  const [choice, setChoice] = useState<Language>('en')
  const [busy, setBusy] = useState(false)
  const [saved, setSaved] = useState<Language | null>(null)
  const [error, setError] = useState<unknown>(null)

  useEffect(() => {
    let cancelled = false
    guardianLanguage()
      .then((result) => {
        if (cancelled) return
        setLanguage(result.language)
        setChoice(result.language)
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err)
      })
    return () => {
      cancelled = true
    }
  }, [])

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setBusy(true)
    setError(null)
    setSaved(null)
    try {
      const result = await setGuardianLanguage(choice)
      setLanguage(result.language)
      setSaved(result.language)
    } catch (err) {
      setError(err)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card title="Your language">
      <form onSubmit={onSubmit} className="flex flex-col gap-3">
        <Field label="Read This week and Notes in" htmlFor="language" hint={`${TRANSLATED_BY_AI_LABEL}. The English is always one tap away.`}>
          <Select
            id="language"
            name="language"
            value={choice}
            disabled={language === null}
            onChange={(event) => {
              const parsed = languageSchema.safeParse(event.target.value)
              if (parsed.success) setChoice(parsed.data)
            }}
          >
            {GUARDIAN_LANGUAGES.map((code) => (
              <option key={code} value={code}>
                {LANGUAGE_NAMES[code]}
              </option>
            ))}
          </Select>
        </Field>
        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" disabled={busy || language === null || choice === language}>
            {busy ? 'Saving…' : 'Save'}
          </Button>
          {saved ? (
            <span role="status" className="text-sm">
              <span aria-hidden="true">✓ </span>Saved · {LANGUAGE_NAMES[saved]}
            </span>
          ) : null}
        </div>
      </form>
      <FormError error={error} />
    </Card>
  )
}
