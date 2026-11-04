import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import type { CheckIn, LearnerPractice, RecentInput, TodayResponse } from '@guardian-book/shared'
import { getToday } from '../../../api/learner'
import { checkAlone } from '../../../api/loop'
import { RequireRole } from '../../../app/RequireRole'
import { EmptyState } from '../../../components/EmptyState'
import { Button, Card, FormError } from '../../../components/Form'
import { LearnerShell } from '../../../components/LearnerShell'
import { Skeleton } from '../../../components/Skeleton'
import { daysWord, shortDate, shortDateTime } from '../../../lib/dates'
import { InstallHint } from '../../../sw/InstallHint'
import { KIND_WORD, NEXT_ACTION_TITLE, nextAction, splitRecent, statusWords, type NextAction } from './status'

/**
 * L1 · Today (spec 05 §4.2, §9; B16 §2): open → one clear next action at the top (bring
 * something / fix your step / check it alone / your follow-up check), then your recent
 * work in plain statuses. Bring anything stays the one pink action on the screen.
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
  const action = nextAction(today)
  return (
    <LearnerShell>
      <div className="flex flex-col gap-2">
        <h1 className="text-display font-semibold text-balance">Hi {today.nickname}</h1>
        <p className="text-fg-muted">Your one next step, then your recent work.</p>
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

      <NextActionCard action={action} more={today.checkIns.length - 1} />

      {action.kind === 'bring' ? null : <BringAnything />}

      {today.practice.length > 0 ? <PracticeCard practice={today.practice} /> : null}

      <p className="m-0 text-sm text-fg-muted">
        <Link to="/library">Past papers</Link>: real exam questions, with their memos.
      </p>

      {!today.hasCards ? (
        <EmptyState title="Tell me about you" action={<Link to="/me/setup">Five quick taps</Link>}>
          Your grade, subjects and what you want to do one day. They help us say why a step matters to you.
        </EmptyState>
      ) : null}

      <RecentWork recent={today.recent} />

      {!today.guardianLinked ? (
        <p className="text-sm text-fg-muted">
          <Link to="/me">Invite a parent</Link> so they know how to help.
        </p>
      ) : null}

      <InstallHint />
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

/** The one thing to do now, named the same way every time (B16 §2). */
function NextActionCard({ action, more }: { action: NextAction; more: number }) {
  const title = NEXT_ACTION_TITLE[action.kind]
  if (action.kind === 'check_alone' || action.kind === 'follow_up') return <CheckInCard title={title} check={action.check} more={more} />
  if (action.kind === 'fix') {
    return (
      <Card title={title}>
        <p className="font-medium">{action.step}</p>
        {action.why ? <p className="text-sm text-fg-muted">{action.why}</p> : null}
        <div>
          <Link to={`/attempts/${action.attemptId}/fix`} className="inline-flex min-h-11 items-center justify-center rounded-card border border-fg-muted/50 bg-surface px-5 font-medium text-fg no-underline">
            Start
          </Link>
        </div>
      </Card>
    )
  }
  return (
    <Card title={title}>
      {action.step ? (
        <>
          <p className="font-medium">Tonight: {action.step}</p>
          {action.why ? <p className="text-sm text-fg-muted">{action.why}</p> : null}
        </>
      ) : (
        <p className="text-fg-muted">Homework, a school notice or a question. We start from whatever you bring.</p>
      )}
      <BringAnything />
    </Card>
  )
}

function CheckInCard({ title, check, more }: { title: string; check: CheckIn; more: number }) {
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
    <Card title={title}>
      <p>
        {check.kind === 'retention' ? (
          <>
            Two days ago you did <strong>{check.label}</strong> on your own. One question, no hints: does it still hold?
          </>
        ) : (
          <>
            Your teacher planned a check on <strong>{check.label}</strong> for {when}. One question, no hints.
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

/** B17: class practice the teacher set from the library, soonest due first, with how far you are. */
function PracticeCard({ practice }: { practice: LearnerPractice[] }) {
  return (
    <Card title="Class practice">
      <ul className="m-0 flex list-none flex-col gap-2 p-0" aria-label="Class practice">
        {practice.map((set) => {
          const due = set.daysAway < 0 ? `was due ${shortDate(set.dueOn)}` : `due ${daysWord(set.daysAway)} (${shortDate(set.dueOn)})`
          const body = (
            <>
              <span className="flex flex-col">
                <span className="font-medium">{set.title}</span>
                <span className="text-sm text-fg-muted">
                  {set.className} · {due}
                </span>
              </span>
              <span className="text-sm tnum">
                <span aria-hidden="true" className={set.done === set.total && set.total > 0 ? 'text-progress' : 'text-fg-muted'}>
                  {set.done === set.total && set.total > 0 ? '✓ ' : '◯ '}
                </span>
                {set.done} of {set.total} done
              </span>
            </>
          )
          const className = 'flex min-h-11 items-center justify-between gap-3 rounded-card bg-ground px-4 py-3 no-underline text-fg'
          return (
            <li key={set.id}>
              {set.path ? (
                <Link to={`/library/${set.path}`} className={className}>
                  {body}
                </Link>
              ) : (
                <Link to={`/library?q=${encodeURIComponent(set.title)}`} className={className}>
                  {body}
                </Link>
              )}
            </li>
          )
        })}
      </ul>
    </Card>
  )
}

/** Recent work in plain statuses; failed and abandoned pieces older than a day wait behind "Show all". */
function RecentWork({ recent }: { recent: RecentInput[] }) {
  const [showAll, setShowAll] = useState(false)
  const split = useMemo(() => splitRecent(recent, new Date()), [recent])
  const rows = showAll ? recent : split.shown
  return (
    <section aria-labelledby="recent-heading" className="flex flex-col gap-2">
      <h2 id="recent-heading" className="text-lg font-semibold">
        Your recent work
      </h2>
      {recent.length === 0 ? (
        <p className="text-sm text-fg-muted">Nothing yet. Whatever you bring shows up here with where it stands.</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-fg-muted">Nothing new. Older pieces that could not be read are under Show all.</p>
      ) : (
        <ul className="m-0 flex list-none flex-col gap-2 p-0">
          {rows.map((input) => (
            <RecentRow key={input.id} input={input} />
          ))}
        </ul>
      )}
      {split.hidden.length > 0 ? (
        <p className="text-sm">
          <button type="button" onClick={() => setShowAll((on) => !on)} className="min-h-11 px-0 text-fg-muted underline" aria-expanded={showAll}>
            {showAll ? 'Hide older' : `Show all (${split.hidden.length} older)`}
          </button>
        </p>
      ) : null}
    </section>
  )
}

function RecentRow({ input }: { input: RecentInput }) {
  const status = statusWords(input.status)
  const body = (
    <>
      <span className="flex flex-col">
        <span className="font-medium">{KIND_WORD[input.kind]}</span>
        <span className="text-sm text-fg-muted">
          <time dateTime={input.createdAt}>{shortDateTime(input.createdAt)}</time>
        </span>
      </span>
      <span className="text-sm">
        <span aria-hidden="true" className={status.done ? 'text-progress' : 'text-fg-muted'}>
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
      ) : input.status === 'failed' ? (
        <Link to="/bring" className={className}>
          {body}
        </Link>
      ) : (
        <div className={className}>{body}</div>
      )}
    </li>
  )
}
