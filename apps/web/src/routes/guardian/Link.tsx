import { useState, type FormEvent } from 'react'
import { Link } from 'react-router'
import type { MeResponse } from '@guardian-book/shared'
import { linkGuardian } from '../../api/circle'
import { RequireRole } from '../../app/RequireRole'
import { Button, Card, Field, FormError, TextInput } from '../../components/Form'
import { Page } from '../../components/Page'
import { SignOutButton } from '../../components/SignOutButton'
import { useMe } from '../../state/me'

/** G0 · Link (spec 05 §4.3): enter the learner's code; what you will and will not see. */
export function GuardianLink() {
  return <RequireRole roles={['guardian']}>{(me) => <LinkScreen me={me} />}</RequireRole>
}

function LinkScreen({ me }: { me: MeResponse }) {
  const { refresh } = useMe()
  const [error, setError] = useState<unknown>(null)
  const [busy, setBusy] = useState(false)
  const [linked, setLinked] = useState<string | null>(null)

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget
    const code = String(new FormData(form).get('code') ?? '')
    setBusy(true)
    setError(null)
    setLinked(null)
    try {
      const result = await linkGuardian(code)
      setLinked(result.learner.nickname)
      form.reset()
      await refresh()
    } catch (err) {
      setError(
        err instanceof Error && 'status' in err && (err as { status: number }).status === 404
          ? new Error('That code did not match. Ask them to make a new one from their Me page.')
          : err,
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <Page>
      <h1 className="text-display font-semibold text-balance">Hi {me.profile.nickname}</h1>
      <Card title="Enter the code your child gave you">
        <form onSubmit={onSubmit} className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="flex-1">
            <Field label="Their code" htmlFor="guardian-code">
              <TextInput id="guardian-code" name="code" autoComplete="off" autoCapitalize="characters" spellCheck={false} maxLength={12} required className="tracking-widest uppercase tnum" />
            </Field>
          </div>
          <Button type="submit" disabled={busy}>
            {busy ? 'Linking…' : 'Link'}
          </Button>
        </form>
        {linked ? (
          <p role="status">
            <span aria-hidden="true">✓ </span>You are linked to {linked}.
          </p>
        ) : null}
        <FormError error={error} />
      </Card>

      <Card title="Linked learners">
        {me.learners.length > 0 ? (
          <ul className="m-0 flex list-none flex-col gap-1 p-0">
            {me.learners.map((learner) => (
              <li key={learner.learnerId}>
                <span aria-hidden="true">● </span>
                <Link to={`/guardian/learners/${learner.learnerId}`}>This week with {learner.nickname}</Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-fg-muted">Nobody yet. Enter a code above.</p>
        )}
      </Card>

      <Card title="What you will see">
        <ul className="m-0 flex list-disc flex-col gap-1 pl-5">
          <li>How much they practised, and what is coming up.</li>
          <li>The one topic they are stuck on, in plain words.</li>
          <li>One thing to do tonight, and notes their teacher approved.</li>
        </ul>
        <p className="font-medium">What you will not see</p>
        <p className="text-sm text-fg-muted">Their work, their answers or their photos. Ever.</p>
      </Card>
      <div>
        <SignOutButton />
      </div>
    </Page>
  )
}
