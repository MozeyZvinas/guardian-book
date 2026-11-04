import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { formatDate, formatDateRange, type EvidenceFile } from '@guardian-book/shared'
import { ApiRequestError } from '../../api/client'
import { evidence as fetchEvidence } from '../../api/evidence'
import { Page } from '../../components/Page'
import { StatusChip, type Status } from '../../components/StatusChip'
import { StatusLegend } from '../../components/StatusLegend'
import { SuiteSection } from './evidence/SuiteSection'

/**
 * P4 · Proof page (spec 05 §4.1; P0-12). Everything numeric is read from the committed
 * results file through `GET /api/evidence`; this file holds words only.
 */

type State = { kind: 'loading' } | { kind: 'error'; message: string } | { kind: 'ready'; evidence: EvidenceFile | null }

function chipFor(state: State): Status | null {
  if (state.kind !== 'ready') return null
  if (!state.evidence) return 'PLANNED'
  return state.evidence.dataset.mocked ? 'SYNTHETIC' : 'LIVE'
}

function PrivacyLine({ tier }: { tier: string | null }) {
  return (
    <p className="text-sm text-fg-muted">
      Model tier: {tier ?? 'standard'}. Nothing a learner submits is used to train any model, and no personal data goes into a
      prompt.
    </p>
  )
}

function Facts({ evidence }: { evidence: EvidenceFile }) {
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
      <dt className="text-fg-muted">Run</dt>
      <dd className="m-0 tnum">{formatDate(evidence.generated_at)}</dd>
      <dt className="text-fg-muted">Models</dt>
      <dd className="m-0">{evidence.models.map((model) => `${model.id} (${model.tier} tier, ${model.used_for})`).join(' · ')}</dd>
      <dt className="text-fg-muted">Prompts</dt>
      <dd className="m-0">{evidence.prompt_versions.join(' · ')}</dd>
      <dt className="text-fg-muted">Dataset</dt>
      <dd className="m-0">
        {evidence.dataset.label}
        <span className="block text-fg-muted">
          {evidence.dataset.held_out ? 'A frozen held-out set.' : 'Not a held-out set.'}
          {evidence.dataset.mocked ? ' Mocked model: a dry run of the pipeline, no model calls.' : ''}
        </span>
      </dd>
    </dl>
  )
}

function Results({ evidence }: { evidence: EvidenceFile }) {
  return (
    <>
      <p className="text-fg-muted">
        Every number below is read from one committed results file and shown with its denominator and a confidence interval.
        We claim nothing beyond those counts.
      </p>
      <Facts evidence={evidence} />
      {evidence.suites.map((suite) => (
        <SuiteSection key={suite.key} suite={suite} />
      ))}
      <section aria-labelledby="not-yet-heading" className="flex flex-col gap-2">
        <h2 id="not-yet-heading" className="text-xl font-semibold">
          What doesn’t work yet
        </h2>
        <ul className="m-0 flex list-disc flex-col gap-1 pl-5">
          {evidence.not_yet.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      </section>
      <section aria-labelledby="built-heading" className="flex flex-col gap-2">
        <h2 id="built-heading" className="text-xl font-semibold">
          Built {formatDateRange(evidence.built.from, evidence.built.to)}
        </h2>
        <ol className="m-0 flex list-none flex-col gap-1 p-0 text-sm">
          {evidence.built.steps.map((step) => (
            <li key={step.id}>
              <span className="font-medium">{step.id}</span> <span className="text-fg-muted">{step.title}</span>
            </li>
          ))}
        </ol>
      </section>
    </>
  )
}

export function Evidence() {
  const [state, setState] = useState<State>({ kind: 'loading' })
  const [attempt, setAttempt] = useState(false)

  useEffect(() => {
    let cancelled = false
    fetchEvidence().then(
      (response) => {
        if (!cancelled) setState({ kind: 'ready', evidence: response.evidence })
      },
      (err: unknown) => {
        if (cancelled) return
        setState({ kind: 'error', message: err instanceof ApiRequestError ? err.message : 'The results could not be loaded.' })
      },
    )
    return () => {
      cancelled = true
    }
  }, [attempt])

  const chip = chipFor(state)
  const tier = state.kind === 'ready' && state.evidence ? [...new Set(state.evidence.models.map((model) => model.tier))].join(', ') : null

  return (
    <Page
      footer={
        <p>
          <Link to="/">Back to the start</Link>
        </p>
      }
    >
      <div className="flex items-center gap-3">
        <h1 className="text-display font-semibold text-balance">Evidence</h1>
        {chip ? <StatusChip status={chip} /> : null}
      </div>

      {state.kind === 'loading' ? <p className="text-fg-muted">Loading the results file…</p> : null}

      {state.kind === 'error' ? (
        <div className="flex flex-col gap-3">
          <p role="alert">{state.message}</p>
          <button
            type="button"
            onClick={() => {
              setState({ kind: 'loading' })
              setAttempt((value) => !value)
            }}
            className="inline-flex min-h-12 w-fit items-center justify-center rounded-card bg-action px-5 font-medium text-ground"
          >
            Try again
          </button>
        </div>
      ) : null}

      {state.kind === 'ready' && !state.evidence ? (
        <p className="text-fg-muted">No evaluation run committed yet. The numbers appear here once a results file is committed.</p>
      ) : null}

      {state.kind === 'ready' && state.evidence ? <Results evidence={state.evidence} /> : null}

      <PrivacyLine tier={tier} />
      <StatusLegend />
    </Page>
  )
}
