import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router'
import type { GuardianWeekResponse, MeResponse } from '@guardian-book/shared'
import { guardianWeek, supportGiven } from '../../api/guardian'
import { RequireRole } from '../../app/RequireRole'
import { Button, Card, FormError } from '../../components/Form'
import { Skeleton } from '../../components/Skeleton'
import { StatusChip } from '../../components/StatusChip'
import { daysWord, shortDate } from '../../lib/dates'
import { GuardianShell } from './GuardianShell'

/**
 * G1 · This week with [nickname] (spec 05 §4.3, §9; P0-09): one card a week, and one thing
 * to do tonight. Celebrate · Effort · What's coming · The one gap, in plain words ·
 * Tonight, one thing · Free help first · We did it · Parent prep (PLANNED). Teacher
 * messages carry "Teacher-reviewed" or the teacher's name. Nothing here is an attempt, an
 * answer or an image: the API has no such field.
 */
export function GuardianWeek() {
  return <RequireRole roles={['guardian']}>{(me) => <WeekScreen me={me} />}</RequireRole>
}

type Load = { status: 'loading' } | { status: 'ready'; week: GuardianWeekResponse } | { status: 'error'; error: unknown }

const DAY_LETTERS = ['M', 'T', 'W', 'T', 'F', 'S', 'S']

function WeekScreen({ me }: { me: MeResponse }) {
  const { id = '' } = useParams()
  const [load, setLoad] = useState<Load>({ status: 'loading' })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const [version, setVersion] = useState(0)

  useEffect(() => {
    let cancelled = false
    guardianWeek(id)
      .then((week) => {
        if (!cancelled) setLoad({ status: 'ready', week })
      })
      .catch((err: unknown) => {
        if (!cancelled) setLoad({ status: 'error', error: err })
      })
    return () => {
      cancelled = true
    }
  }, [id, version])

  async function done() {
    setBusy(true)
    setError(null)
    try {
      await supportGiven(id)
      setVersion((n) => n + 1)
    } catch (err) {
      setError(err)
    } finally {
      setBusy(false)
    }
  }

  if (load.status === 'loading') {
    return (
      <GuardianShell me={me}>
        <Skeleton lines={5} label="Loading this week" />
      </GuardianShell>
    )
  }
  if (load.status === 'error') {
    return (
      <GuardianShell me={me}>
        <h1 className="text-display font-semibold text-balance">This week</h1>
        <FormError error={load.error} />
        <p className="text-sm text-fg-muted">
          Not linked yet? <Link to="/guardian/link">Enter their code</Link>.
        </p>
      </GuardianShell>
    )
  }

  const { week } = load
  const { plan } = week
  return (
    <GuardianShell me={me}>
      <h1 className="text-display font-semibold text-balance">This week with {week.learner.nickname}</h1>

      <Card title="Something to celebrate">
        <p className="m-0">{week.celebrate ?? 'Nothing checked yet this week. The moment there is, it shows here.'}</p>
      </Card>

      <Card title="Effort">
        <ul className="m-0 flex list-none gap-2 p-0" aria-label={`Practice days this week: ${week.effort.days} of 7`}>
          {week.effort.dots.map((on, index) => (
            <li key={index} className="flex flex-col items-center gap-1 text-xs text-fg-muted">
              <span aria-hidden="true" className={['inline-block h-3 w-3 rounded-full', on ? 'bg-progress' : 'border border-fg-muted/50'].join(' ')} />
              <span aria-hidden="true">{DAY_LETTERS[index]}</span>
            </li>
          ))}
        </ul>
        <p className="m-0 text-sm tnum">
          {week.effort.days} {week.effort.days === 1 ? 'day' : 'days'} · {week.effort.pieces} {week.effort.pieces === 1 ? 'piece' : 'pieces'} of work
          {week.effort.topics.length > 0 ? ` · ${week.effort.topics.join(', ')}` : ''}
        </p>
        <p className="m-0 text-sm text-fg-muted">Minutes are not measured yet.</p>
      </Card>

      <Card title="What’s coming">
        {week.coming ? (
          <p className="m-0">
            <span className="font-medium">{week.coming.title}</span> · {daysWord(week.coming.daysAway)} ({shortDate(week.coming.onDate)})
          </p>
        ) : (
          <p className="m-0 text-fg-muted">No confirmed dates yet.</p>
        )}
      </Card>

      {plan ? (
        <>
          <Card title="The one gap, in plain words">
            <p className="m-0 text-sm text-fg-muted">{plan.gapLabel}</p>
            <p className="m-0">{plan.gap}</p>
          </Card>
          <Card title="Tonight, one thing">
            <p className="m-0 font-medium">{plan.action}</p>
            <p className="m-0 text-sm text-fg-muted">About ten minutes. You don’t need to know the maths.</p>
            <div className="flex flex-wrap items-center gap-3">
              {plan.doneAt ? (
                <p className="m-0 inline-flex min-h-11 items-center rounded-card bg-surface px-4 font-medium">
                  <span aria-hidden="true" className="text-progress">
                    ✓{' '}
                  </span>
                  Done · {new Date(plan.doneAt).toLocaleDateString('en-ZA', { weekday: 'long', timeZone: 'Africa/Johannesburg' })}
                </p>
              ) : (
                <Button type="button" onClick={() => void done()} disabled={busy}>
                  {busy ? 'Saving…' : 'We did it'}
                </Button>
              )}
              {plan.source === 'template' ? <span className="text-xs text-fg-muted">A standard step while the plan is written.</span> : null}
            </div>
          </Card>
          <Card title="Free help first">
            {week.resources.length > 0 ? (
              <ul className="m-0 flex list-none flex-col gap-2 p-0">
                {week.resources.map((resource) => (
                  <li key={resource.id} className="flex flex-col">
                    <a href={resource.url} target="_blank" rel="noopener noreferrer">
                      {resource.title}
                    </a>
                    <span className="text-xs text-fg-muted">
                      {resource.free ? 'Free' : 'Paid'} · {resource.attribution} · {resource.licence}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="m-0 text-sm text-fg-muted">No vetted links for this topic yet.</p>
            )}
          </Card>
        </>
      ) : (
        <Card title="Tonight, one thing">
          <p className="m-0 text-fg-muted">Nothing to do yet; we’ll tell you the moment there is.</p>
        </Card>
      )}

      {week.teacherMessages.length > 0 ? (
        <section aria-labelledby="teacher-heading" className="flex flex-col gap-2">
          <h2 id="teacher-heading" className="text-lg font-semibold">
            From the teacher
          </h2>
          <ul className="m-0 flex list-none flex-col gap-2 p-0">
            {week.teacherMessages.map((message) => (
              <li key={message.id} className="flex flex-col gap-1 rounded-card bg-surface p-4">
                <span className="inline-flex w-fit items-center rounded-full bg-green px-2.5 py-0.5 text-xs font-medium text-white">{message.label}</span>
                <p className="m-0">{message.text}</p>
                <span className="text-xs text-fg-muted">{shortDate(message.at)}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <Card title="Parent prep">
        <p className="m-0 text-sm text-fg-muted">
          How to bring it up, and a 5-minute refresher. <StatusChip status="PLANNED" />
        </p>
      </Card>
      <FormError error={error} />
    </GuardianShell>
  )
}
