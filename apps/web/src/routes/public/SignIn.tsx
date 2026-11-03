import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router'
import { signInBodySchema } from '@guardian-book/shared'
import { homeFor, me as fetchMe, signIn } from '../../api/auth'
import { ApiRequestError } from '../../api/client'
import { Button, Field, FormError, TextInput } from '../../components/Form'
import { Page } from '../../components/Page'
import { useMe } from '../../state/me'

/** P3 · Sign in (spec 05 §4.1). On success, route by role. */
export function SignIn() {
  const navigate = useNavigate()
  const { refresh } = useMe()
  const [error, setError] = useState<unknown>(null)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    const form = new FormData(event.currentTarget)
    const parsed = signInBodySchema.safeParse({
      email: String(form.get('email') ?? ''),
      password: String(form.get('password') ?? ''),
    })
    if (!parsed.success) {
      setFieldErrors(Object.fromEntries(parsed.error.issues.map((i) => [i.path.map(String).join('.'), i.message])))
      return
    }
    setFieldErrors({})
    setBusy(true)
    try {
      await signIn(parsed.data)
      const me = await fetchMe()
      await refresh()
      void navigate(homeFor(me.profile.role), { replace: true })
    } catch (err) {
      if (err instanceof ApiRequestError && (err.status === 401 || err.status === 403)) {
        setError(new Error('That email and password do not match.'))
      } else {
        setError(err)
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <Page
      footer={
        <p>
          New here? <Link to="/signup">Create an account</Link>
        </p>
      }
    >
      <h1 className="text-display font-semibold text-balance">Sign in</h1>
      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-5">
        <Field label="Email" htmlFor="email" error={fieldErrors['email']}>
          <TextInput id="email" name="email" type="email" autoComplete="email" inputMode="email" required />
        </Field>
        <Field label="Password" htmlFor="password" error={fieldErrors['password']}>
          <TextInput id="password" name="password" type="password" autoComplete="current-password" required />
        </Field>
        <FormError error={error} />
        <Button type="submit" disabled={busy}>
          {busy ? 'Signing in…' : 'Sign in'}
        </Button>
      </form>
    </Page>
  )
}
