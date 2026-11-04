import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import type { TryStatusResponse } from '@guardian-book/shared'
import { tryStatus } from '../../api/auth'
import { Page } from '../../components/Page'

/**
 * P1a · Try it (brief B09 §2): a judge runs the core loop alone, without borrowing a
 * demo account. Four lines, then sign up as a learner (18+, as always) into the seeded
 * "Try it (fictional)" class. The server decides the class; this page only says whether
 * it is reachable (`GET /api/try`), so an unconfigured server never promises a class.
 */

type State = { kind: 'loading' } | { kind: 'ready'; status: TryStatusResponse } | { kind: 'error' }

export function Try() {
  const [state, setState] = useState<State>({ kind: 'loading' })

  useEffect(() => {
    let cancelled = false
    tryStatus()
      .then((status) => {
        if (!cancelled) setState({ kind: 'ready', status })
      })
      .catch(() => {
        if (!cancelled) setState({ kind: 'error' })
      })
    return () => {
      cancelled = true
    }
  }, [])

  const available = state.kind === 'ready' && state.status.available
  const className = state.kind === 'ready' ? state.status.className : null

  return (
    <Page
      footer={
        <>
          <p>
            Already have an account? <Link to="/signin">Sign in</Link>
          </p>
          <p>Fictional school, fictional people. Nothing you type is used to train any model. No personal data goes into a prompt.</p>
        </>
      }
    >
      <h1 className="text-display font-semibold text-balance">Try it as a learner</h1>
      <ol className="m-0 flex list-none flex-col gap-4 p-0">
        {[
          <>
            <strong>Sign up as a learner</strong> (18 or older, like every account here). You join <strong>{className ?? 'Try it (fictional)'}</strong>, a class
            at a fictional school whose marking guidelines its teacher has already approved.
          </>,
          <>
            <strong>Bring a piece of maths.</strong> Type your working line by line, or snap a photo of it. Muse Spark reads it against the guideline; checks
            the model cannot skip gate every output.
          </>,
          <>
            <strong>See the exact step and a hint,</strong> never the answer. Then fix that one step, and check it alone on a matched question with no hints.
          </>,
          <>
            <strong>Watch the plan form.</strong> Your Brain keeps the evidence; tonight’s step appears on Today. Want the parent’s view? Create a parent
            account and link it with the code on your Me page. Up to six checks a day on a try-it account.
          </>,
        ].map((line, index) => (
          <li key={index} className="flex gap-3">
            <span aria-hidden="true" className="w-6 shrink-0 text-xl leading-7 font-semibold text-action tnum">
              {index + 1}
            </span>
            <p className="m-0">{line}</p>
          </li>
        ))}
      </ol>

      {state.kind === 'loading' ? (
        <p role="status" className="text-sm text-fg-muted">
          Checking that the try-it class is open…
        </p>
      ) : null}

      {available ? (
        <div>
          <Link to="/signup?try=1" className="inline-flex min-h-12 items-center justify-center rounded-card bg-action px-5 text-lg font-medium text-ground no-underline">
            Sign up as a learner
          </Link>
        </div>
      ) : null}

      {state.kind === 'ready' && !available ? (
        <div role="status" className="rounded-card bg-surface p-4 text-sm">
          <p className="m-0 font-medium">Try it is not switched on for this server yet.</p>
          <p className="m-0 mt-1 text-fg-muted">
            The public class has not been set up here. You can still <Link to="/signup">create an account</Link> and join a class with its code.
          </p>
        </div>
      ) : null}

      {state.kind === 'error' ? (
        <div role="alert" className="rounded-card bg-surface p-4 text-sm">
          <p className="m-0 font-medium">Could not reach the server. Check your signal and try again.</p>
        </div>
      ) : null}
    </Page>
  )
}
