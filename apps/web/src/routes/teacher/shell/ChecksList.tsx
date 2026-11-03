import type { ModelRunView, NoteOrigin } from '@guardian-book/shared'
import { TEACHER_ORIGIN_LABEL } from '@guardian-book/shared'

/**
 * ChecksList (spec 05 §5; P0-11 "The teacher detail view lists each check as pass/fail"):
 * every verifier rule of the last model call with its code, a glyph and the words (A7:
 * never colour alone), and the calls behind it.
 */
export function ChecksList({ runs }: { runs: ModelRunView[] }) {
  const last = runs[runs.length - 1]
  if (!last) return <p className="m-0 text-sm text-fg-muted">No model call yet.</p>
  const failed = last.checks.filter((check) => !check.passed).length
  return (
    <div className="flex flex-col gap-2">
      <p className="m-0 text-sm text-fg-muted tnum">
        {runs.length} {runs.length === 1 ? 'call' : 'calls'} · last {last.status} · {failed === 0 ? 'every check passed' : `${failed} ${failed === 1 ? 'check' : 'checks'} failed`} · {last.modelId} · {last.promptVersion}
      </p>
      <ul className="m-0 flex list-none flex-col gap-1 p-0" aria-label="Checks the model cannot skip">
        {last.checks.map((check) => (
          <li key={check.code} className="flex items-start gap-2 text-sm">
            <span aria-hidden="true" className={['w-4 shrink-0 text-center', check.passed ? 'text-progress' : 'text-fg'].join(' ')}>
              {check.passed ? '✓' : '✗'}
            </span>
            <span className="min-w-0">
              <span className="font-mono text-xs">{check.code}</span>
              <span className="sr-only">{check.passed ? ' passed' : ' failed'}</span>
              <span className="block text-fg-muted">{check.detail}</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}

/** The internal origin label the teacher sees (spec 05 §9 T3a): AI suggested · You approved · You added · You revised. */
export function OriginChip({ origin }: { origin: NoteOrigin }) {
  const ai = origin === 'ai_suggested'
  return (
    <span className={['inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium', ai ? 'bg-surface text-fg-muted ring-1 ring-fg-muted/40' : 'bg-surface text-fg'].join(' ')}>
      <span aria-hidden="true">{ai ? '◌' : '●'}</span>
      {TEACHER_ORIGIN_LABEL[origin]}
    </span>
  )
}
