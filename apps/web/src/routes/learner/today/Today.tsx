import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import type { CheckIn, RecentInput, TodayResponse } from '@guardian-book/shared'
import { getToday } from '../../../api/learner'
import { checkAlone } from '../../../api/loop'
import { RequireRole } from '../../../app/RequireRole'
import { EmptyState } from '../../../components/EmptyState'
import { Button, Card, FormError } from '../../../components/Form'
import { LearnerShell } from '../../../components/LearnerShell'
import { Skeleton } from '../../../components/Skeleton'
import { daysWord, shortDate, shortDateTime } from '../../../lib/dates'

/**
 * L1 · Today (spec 05 §4.2, §9): open → one next step. The check-in card outranks
 * tonight's step when one is due. Bring anything is the one pink action on the screen.
 */
export function Today() {
  return <RequireRole roles={['learner']}>{() => <TodayScreen />}</RequireRole>
}

type Load = { status: 'loading' } | { status: 'ready'; today: TodayResponse } | { status: 'error'; error: unknown }

function TodayScreen() {
  const [load, setLoad] = useState<Load>({ status: 'loading' })
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let cancelled = false
    getToday()
      .then((today) => {
        if (!cancelled) setLoad({ status: 'ready', today })
      })
      .catch((error: unknown) => {
        if (!cancelled) setLoad({ status: 'error', error })
      })
    return () => {
      cancelled = true
    }
  }, [attempt])

  if (load.status === 'loading') {
    return (
      <LearnerShell>
        <Skeleton lines={4} label="Loading today" />
        <BringAnything />
      </LearnerShell>
    )
  }
  if (load.status === 'error') {
    return (
      <LearnerShell>
        <h1 className="text-display font-semibold text-balance">Today</h1>
        <FormError error={load.error} />
        <div>
          <Button
            type="button"
            variant="quiet"
            onClick={() => {
              setLoad({ status: 'loading' })
              setAttempt((n) => n + 1)
            }}
          >
            Try again
          </Button>
        </div>
        <BringAnything />
      </LearnerShell>
    )
  }

  const { today } = load
  const checkIn = today.checkIns[0]
  return (
    <LearnerShell>
      <div className="flex flex-col gap-2">
        <h1 className="text-display font-semibold text-balance">Hi {today.nickname}</h1>
        {today.exam ? (
          <p>
            <Link to="/calendar" className="inline-flex items-center gap-2 rounded-full bg-surface px-3 py-1 text-sm font-medium text-fg no-underline">
              <span aria-hidden="true">◷</span>
              {today.exam.title} · <span className="tnum">{daysWord(today.exam.daysAway)}</span>
              <span className="text-fg-muted">({shortDate(today.exam.onDate)})</span>
              <span className="sr-only">, open the calendar</span>
            </Link>
          </p>
        ) : (
          <p className="text-sm text-fg-muted">
            No exam dates yet. <Link to="/calendar">Calendar</Link>
          </p>
        )}
      </div>

      {checkIn ? <CheckInCard check={checkIn} more={today.checkIns.length - 1} /> : null}

      <TonightCard today={today} />

      <BringAnything />

      {!today.hasCards ? (
        <EmptyState title="Tell me about you" action={<Link to="/me/setup">Four quick questions</Link>}>
          A sentence each. They help us say why a step matters to you.
        </EmptyState>
      ) : null}

      <section aria-labelledby="recent-heading" className="flex flex-col gap-2">
        <h2 id="recent-heading" className="text-lg font-semibold">
          Recent
        </h2>
        {today.recent.length === 0 ? (
          <p className="text-sm text-fg-muted">Nothing yet. Whatever you bring shows up here with its status.</p>
        ) : (
          <ul className="m-0 flex list-none flex-col gap-2 p-0">
            {today.recent.map((input) => (
              <RecentRow key={input.id} input={input} />
            ))}
          </ul>
        )}
      </section>

      {!today.guardianLinked ? (
        <p className="text-sm text-fg-muted">
          <Link to="/me">Invite a parent</Link> so they know how to help.
        </p>
      ) : null}
    </LearnerShell>
  )
}

function BringAnything() {
  return (
    <Link
      to="/bring"
      className="inline-flex min-h-14 items-center justify-center rounded-card bg-action px-5 text-lg font-medium text-ground no-underline"
    >
      Bring anything
    </Link>
  )
}

function CheckInCard({ check, more }: { check: CheckIn; more: number }) {
  const navigate = useNavigate()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const when = check.overdueDays === 0 ? 'today' : `${check.overdueDays} ${check.overdueDays === 1 ? 'day' : 'days'} ago`

  async function start() {
    setBusy(true)
    setError(null)
    try {
      const match = await checkAlone(check.skillTag, 'retention', null)
      if (!match.item) {
        setError(new Error('No new question for this skill yet. Your teacher can add one.'))
        return
      }
      void navigate(`/items/${match.item.id}?mode=retention&skill=${encodeURIComponent(check.skillTag)}`, { state: { why: match.why } })
    } catch (err) {
      setError(err)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card title="Check-in due">
      <p>
        {check.kind === 'retention' ? (
          <>
            Two days ago you did <strong>{check.label}</strong> on your own. Check it alone: one question, no hints.
          </>
        ) : (
          <>
            Your teacher planned a check-in on <strong>{check.label}</strong> for {when}.
          </>
        )}
      </p>
      {check.action ? <p className="text-sm text-fg-muted">{check.action}</p> : null}
      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" variant="quiet" onClick={() => void start()} disabled={busy}>
          {busy ? 'Finding a question…' : 'Check it alone'}
        </Button>
        <span className="text-sm text-fg-muted">
          Due {shortDate(check.dueOn)}
          {more > 0 ? ` · ${more} more` : ''}
        </span>
      </div>
      <FormError error={error} />
    </Card>
  )
}

function TonightCard({ today }: { today: TodayResponse }) {
  if (today.tonight.kind === 'none') {
    return (
      <Card title="Tonight’s step">
        <p className="text-fg-muted">Bring something and we’ll start.</p>
      </Card>
    )
  }
  const target = today.tonight.attemptId ? `/attempts/${today.tonight.attemptId}/fix` : '/bring'
  return (
    <Card title="Tonight’s step">
      <p className="font-medium">{today.tonight.step}</p>
      {today.tonight.why ? <p className="text-sm text-fg-muted">{today.tonight.why}</p> : null}
      <div>
        <Link to={target} className="inline-flex min-h-11 items-center justify-center rounded-card border border-fg-muted/50 bg-surface px-5 font-medium text-fg no-underline">
          Start
        </Link>
      </div>
    </Card>
  )
}

const KIND_WORD = { work: 'Homework', notice: 'Notice', question: 'Question' } as const
const STATUS_WORD: Record<RecentInput['status'], { glyph: string; text: string }> = {
  reading: { glyph: '◌', text: 'Reading your work…' },
  feedback_ready: { glyph: '●', text: 'Feedback ready' },
  teacher_checking: { glyph: '◐', text: 'Your teacher is checking' },
  fixed: { glyph: '✓', text: 'Fixed' },
  failed: { glyph: '!', text: 'Could not be read. Try again.' },
  read: { glyph: '●', text: 'Dates read' },
  asked: { glyph: '?', text: 'Asked' },
}

function RecentRow({ input }: { input: RecentInput }) {
  const status = STATUS_WORD[input.status]
  const body = (
    <>
      <span className="flex flex-col">
        <span className="font-medium">{KIND_WORD[input.kind]}</span>
        <span className="text-sm text-fg-muted">
          <time dateTime={input.createdAt}>{shortDateTime(input.createdAt)}</time>
        </span>
      </span>
      <span className="text-sm">
        <span aria-hidden="true" className={input.status === 'feedback_ready' || input.status === 'fixed' || input.status === 'read' ? 'text-progress' : 'text-fg-muted'}>
          {status.glyph}{' '}
        </span>
        {status.text}
      </span>
    </>
  )
  const className = 'flex min-h-11 items-center justify-between gap-3 rounded-card bg-surface px-4 py-3 no-underline text-fg'
  return (
    <li>
      {input.attemptId ? (
        <Link to={`/attempts/${input.attemptId}`} className={className}>
          {body}
        </Link>
      ) : (
        <div className={className}>{body}</div>
      )}
    </li>
  )
}
