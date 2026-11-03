import { useState, type FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { AGE_ATTESTATION_LABEL, SIGN_UP_ROLES, signUpBodySchema, type SignUpRole } from '@guardian-book/shared'
import { homeFor, signUp } from '../../api/auth'
import { ApiRequestError } from '../../api/client'
import { Button, Field, FormError, TextInput, issuesByPath } from '../../components/Form'
import { Page } from '../../components/Page'
import { useMe } from '../../state/me'

const ROLE_LABEL: Record<SignUpRole, string> = {
  learner: 'Learner',
  guardian: 'Parent or guardian',
  teacher: 'Teacher',
}

function roleFromQuery(value: string | null): SignUpRole {
  return (SIGN_UP_ROLES as readonly string[]).includes(value ?? '') ? (value as SignUpRole) : 'learner'
}

/** P2 · Sign up (spec 05 §4.1): role chooser, nickname, email, password, the 18+ box. */
export function SignUp() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const { refresh } = useMe()
  const [role, setRole] = useState<SignUpRole>(roleFromQuery(params.get('role')))
  const [error, setError] = useState<unknown>(null)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    const form = new FormData(event.currentTarget)
    const candidate = {
      nickname: String(form.get('nickname') ?? ''),
      email: String(form.get('email') ?? ''),
      password: String(form.get('password') ?? ''),
      role,
      ageAttested: form.get('ageAttested') === 'on' ? true : false,
    }
    const parsed = signUpBodySchema.safeParse(candidate)
    if (!parsed.success) {
      setFieldErrors(Object.fromEntries(parsed.error.issues.map((i) => [i.path.map(String).join('.'), i.message])))
      return
    }
    setFieldErrors({})
    setBusy(true)
    try {
      const result = await signUp(parsed.data)
      await refresh()
      void navigate(homeFor(result.profile.role), { replace: true })
    } catch (err) {
      setFieldErrors(issuesByPath(err))
      setError(err instanceof ApiRequestError && err.code === 'validation' ? null : err)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Page
      footer={
        <p>
          Already have an account? <Link to="/signin">Sign in</Link>
        </p>
      }
    >
      <h1 className="text-display font-semibold text-balance">Create your account</h1>

      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-5">
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-sm font-medium">I am a</legend>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            {SIGN_UP_ROLES.map((option) => {
              const selected = option === role
              return (
                <label
                  key={option}
                  className={[
                    'flex min-h-11 cursor-pointer items-center gap-2 rounded-card border px-3',
                    selected ? 'border-fg bg-surface font-medium' : 'border-fg-muted/50',
                  ].join(' ')}
                >
                  <input
                    type="radio"
                    name="role"
                    value={option}
                    checked={selected}
                    onChange={() => setRole(option)}
                    className="accent-[var(--gb-action)]"
                  />
                  {ROLE_LABEL[option]}
                </label>
              )
            })}
          </div>
        </fieldset>

        <Field label="Nickname" htmlFor="nickname" hint="What we call you here. No real name is needed." error={fieldErrors['nickname']}>
          <TextInput id="nickname" name="nickname" autoComplete="nickname" maxLength={40} required />
        </Field>
        <Field label="Email" htmlFor="email" error={fieldErrors['email']}>
          <TextInput id="email" name="email" type="email" autoComplete="email" inputMode="email" required />
        </Field>
        <Field label="Password" htmlFor="password" hint="At least 8 characters." error={fieldErrors['password']}>
          <TextInput id="password" name="password" type="password" autoComplete="new-password" minLength={8} required />
        </Field>

        <div className="flex flex-col gap-1.5">
          <label className="flex min-h-11 items-start gap-3">
            <input type="checkbox" name="ageAttested" required className="mt-1.5 size-5 shrink-0 accent-[var(--gb-action)]" />
            <span>{AGE_ATTESTATION_LABEL}</span>
          </label>
          {fieldErrors['ageAttested'] ? (
            <p role="alert" className="text-sm font-medium">
              <span aria-hidden="true">! </span>
              {fieldErrors['ageAttested']}
            </p>
          ) : null}
        </div>

        <p className="text-sm text-fg-muted">
          No ads, nothing about you is sold, nothing you do here trains anyone’s AI.
        </p>

        <FormError error={error} />

        <Button type="submit" disabled={busy}>
          {busy ? 'Creating…' : 'Create account'}
        </Button>
      </form>
    </Page>
  )
}
