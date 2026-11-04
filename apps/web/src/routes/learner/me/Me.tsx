import { useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router'
import type { MeResponse, ProfileCards, ProfileResponse } from '@guardian-book/shared'
import { issueGuardianCode, joinClass, revokeGuardian } from '../../../api/circle'
import { getProfile } from '../../../api/learner'
import { RequireRole } from '../../../app/RequireRole'
import { CardsEditor, CardsView } from '../../../components/CardsEditor'
import { Button, Card, Field, FormError, TextInput } from '../../../components/Form'
import { LearnerShell } from '../../../components/LearnerShell'
import { SignOutButton } from '../../../components/SignOutButton'
import { Skeleton } from '../../../components/Skeleton'
import { StatusChip } from '../../../components/StatusChip'
import { StatusLegend } from '../../../components/StatusLegend'
import { useMe } from '../../../state/me'

/** L8 · Me (spec 05 §4.2; B16 §7): the four cards (edit), invite a parent, join a class, what your parent can see. */
export function Me() {
  return <RequireRole roles={['learner']}>{(me) => <MeScreen me={me} />}</RequireRole>
}

function MeScreen({ me }: { me: MeResponse }) {
  return (
    <LearnerShell footer={<StatusLegend />}>
      <div className="flex flex-col gap-2">
        <h1 className="text-display font-semibold text-balance">Hi {me.profile.nickname}</h1>
        <p className="text-fg-muted">Your cards, your parent, your class, and what a parent can see.</p>
      </div>
      <ProfileCardsSection />
      <InviteGuardian me={me} />
      <JoinClass me={me} />
      <Card title="What your parent can see">
        <ul className="m-0 flex list-disc flex-col gap-1 pl-5">
          <li>How much you practised: days, minutes, topics.</li>
          <li>What is coming up.</li>
          <li>The topic you are stuck on, in plain words.</li>
          <li>One thing they can do to help.</li>
          <li>From your cards: what you want to do one day, and your subjects.</li>
        </ul>
        <p className="text-sm text-fg-muted">Never your work, your answers, your photos or the words you typed about yourself.</p>
      </Card>
      <div>
        <SignOutButton />
      </div>
    </LearnerShell>
  )
}

type Load = { status: 'loading' } | { status: 'ready'; profile: ProfileResponse } | { status: 'error'; error: unknown }

function ProfileCardsSection() {
  const [load, setLoad] = useState<Load>({ status: 'loading' })
  const [editing, setEditing] = useState(false)

  useEffect(() => {
    let cancelled = false
    getProfile()
      .then((profile) => {
        if (!cancelled) setLoad({ status: 'ready', profile })
      })
      .catch((error: unknown) => {
        if (!cancelled) setLoad({ status: 'error', error })
      })
    return () => {
      cancelled = true
    }
  }, [])

  function saved(cards: ProfileCards) {
    setLoad({ status: 'ready', profile: { cards, origin: load.status === 'ready' ? load.profile.origin : 'student' } })
    setEditing(false)
  }

  return (
    <Card title="About you">
      {load.status === 'loading' ? <Skeleton lines={2} label="Loading your cards" /> : null}
      {load.status === 'error' ? <FormError error={load.error} /> : null}
      {load.status === 'ready' && !load.profile.cards ? (
        <>
          <p className="text-sm text-fg-muted">Five quick taps start your cards. Skip any of them.</p>
          <div>
            <Link to="/me/setup" className="inline-flex min-h-11 items-center rounded-card border border-fg-muted/50 bg-surface px-5 font-medium text-fg no-underline">
              Tell me about you
            </Link>
          </div>
        </>
      ) : null}
      {load.status === 'ready' && load.profile.cards ? (
        editing ? (
          <CardsEditor cards={load.profile.cards} onSaved={saved} onCancel={() => setEditing(false)} />
        ) : (
          <>
            <CardsView cards={load.profile.cards} />
            <p className="flex flex-wrap items-center gap-2 text-sm text-fg-muted">
              {load.profile.origin === 'model' ? (
                <>
                  Read from your words by the model and checked. <StatusChip status="LIVE" />
                </>
              ) : (
                <>Your own words.</>
              )}
            </p>
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="quiet" onClick={() => setEditing(true)}>
                Edit cards
              </Button>
              <Link to="/me/setup" className="inline-flex min-h-11 items-center px-2 text-sm">
                Start again
              </Link>
            </div>
          </>
        )
      ) : null}
    </Card>
  )
}

function InviteGuardian({ me }: { me: MeResponse }) {
  const { refresh } = useMe()
  const [code, setCode] = useState<{ code: string; expiresAt: string } | null>(null)
  const [error, setError] = useState<unknown>(null)
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState(false)

  const shareText = code
    ? `Hi! I'm using Guardian Book for school. Sign up as a parent at ${window.location.origin}/signup?role=guardian and enter my code ${code.code} so you can see how to help me.`
    : ''

  async function issue() {
    setBusy(true)
    setError(null)
    setCopied(false)
    try {
      setCode(await issueGuardianCode())
    } catch (err) {
      setError(err)
    } finally {
      setBusy(false)
    }
  }

  async function share() {
    if (typeof navigator.share === 'function') {
      try {
        await navigator.share({ text: shareText })
        return
      } catch {
        // fall through to copy
      }
    }
    try {
      await navigator.clipboard.writeText(shareText)
      setCopied(true)
    } catch {
      setError(new Error('Could not copy. Read the code out instead.'))
    }
  }

  return (
    <Card title="Invite a parent">
      <p className="text-sm text-fg-muted">
        A parent or guardian signs up, enters your code, and sees how to help. You can remove them any time.
      </p>
      {code ? (
        <div className="flex flex-col gap-2">
          <p className="text-3xl font-semibold tracking-[0.2em] tnum" aria-label={`Your code is ${code.code.split('').join(' ')}`}>
            {code.code}
          </p>
          <p className="text-sm text-fg-muted">
            Works until {new Date(code.expiresAt).toLocaleDateString('en-ZA', { day: 'numeric', month: 'long' })}. Making a new one replaces it.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button type="button" onClick={share}>
              {copied ? 'Copied' : 'Share'}
            </Button>
            <Button type="button" variant="quiet" onClick={issue} disabled={busy}>
              New code
            </Button>
          </div>
        </div>
      ) : (
        <div>
          <Button type="button" onClick={issue} disabled={busy}>
            {busy ? 'Making a code…' : 'Show a code'}
          </Button>
        </div>
      )}
      <FormError error={error} />
      {me.guardians.length > 0 ? (
        <ul className="m-0 flex list-none flex-col gap-2 p-0">
          {me.guardians.map((guardian) => (
            <li key={guardian.guardianId} className="flex items-center justify-between gap-3">
              <span>
                <span aria-hidden="true">● </span>
                {guardian.nickname} is linked
              </span>
              <Button
                type="button"
                variant="quiet"
                onClick={async () => {
                  setError(null)
                  try {
                    await revokeGuardian(guardian.guardianId)
                    await refresh()
                  } catch (err) {
                    setError(err)
                  }
                }}
              >
                Remove
              </Button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-fg-muted">No parent linked yet.</p>
      )}
    </Card>
  )
}

function JoinClass({ me }: { me: MeResponse }) {
  const { refresh } = useMe()
  const [error, setError] = useState<unknown>(null)
  const [busy, setBusy] = useState(false)
  const [joined, setJoined] = useState<string | null>(null)

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget
    const code = String(new FormData(form).get('code') ?? '')
    setBusy(true)
    setError(null)
    setJoined(null)
    try {
      const result = await joinClass(code)
      setJoined(result.class.name)
      form.reset()
      await refresh()
    } catch (err) {
      setError(err instanceof Error && 'status' in err && (err as { status: number }).status === 404 ? new Error('That code did not match a class. Check it with your teacher.') : err)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card title="Join a class">
      {me.memberships.length > 0 ? (
        <p>
          You are in {me.memberships.map((m) => m.name).join(', ')}
          {me.school ? ` at ${me.school.name}` : ''}.
        </p>
      ) : (
        <p className="text-sm text-fg-muted">Your teacher gives you an 8-character code.</p>
      )}
      <form onSubmit={onSubmit} className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="flex-1">
          <Field label="Class code" htmlFor="class-code">
            <TextInput id="class-code" name="code" autoComplete="off" autoCapitalize="characters" spellCheck={false} maxLength={12} required className="tracking-widest uppercase tnum" />
          </Field>
        </div>
        <Button type="submit" variant="quiet" disabled={busy}>
          {busy ? 'Joining…' : 'Join'}
        </Button>
      </form>
      {joined ? (
        <p role="status">
          <span aria-hidden="true">✓ </span>You joined {joined}.
        </p>
      ) : null}
      <FormError error={error} />
    </Card>
  )
}
