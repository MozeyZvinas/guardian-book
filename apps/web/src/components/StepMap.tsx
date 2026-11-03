import type { AssessedStep, Confidence } from '@guardian-book/shared'
import { MathText } from './MathText'

/**
 * StepMap (spec 05 §5): one row per guideline step, ✓ or ✗ with the words, marks small in
 * tabular figures. Teal marks a step found; a lost step is outlined in ink, never pink
 * (A1) and never by colour alone (A7). While assessing, the rows are skeletons that
 * resolve one by one.
 */

export interface StepName {
  id: string
  stepNo: number
  criterion: string
  marks: number
  skillTag: string
}

export const CONFIDENCE_LABEL: Record<Confidence, string> = {
  high: 'Sure',
  medium: 'Fairly sure',
  low: 'Not sure',
}

export function StepMap({ guideline, steps, assessing }: { guideline: StepName[]; steps: AssessedStep[] | null; assessing: boolean }) {
  const byId = new Map((steps ?? []).map((step) => [step.stepId, step]))
  return (
    <ol className="m-0 flex list-none flex-col gap-2 p-0" aria-label="Step map" aria-busy={assessing}>
      {guideline.map((name, index) => {
        const step = byId.get(name.id)
        if (!step) {
          return (
            <li key={name.id} className="flex items-center gap-3 rounded-card bg-surface px-3 py-3" style={{ animationDelay: `${index * 90}ms` }}>
              <span aria-hidden="true" className="h-5 w-5 shrink-0 animate-pulse rounded-full bg-fg-muted/30" />
              <span className="flex-1">
                <span className="block h-3.5 w-3/4 animate-pulse rounded bg-fg-muted/30" />
              </span>
              <span className="text-sm text-fg-muted tnum">{assessing ? '…' : `–/${name.marks}`}</span>
            </li>
          )
        }
        const earned = step.awarded >= step.available
        const partial = !earned && step.awarded > 0
        return (
          <li
            key={name.id}
            className={['flex items-start gap-3 rounded-card bg-surface px-3 py-3 motion-safe:animate-[fade-in_240ms_ease-out_both]', earned ? '' : 'ring-1 ring-fg/40'].join(' ')}
            style={{ animationDelay: `${index * 90}ms` }}
          >
            <span aria-hidden="true" className={['mt-0.5 w-5 shrink-0 text-center text-lg leading-none', earned ? 'text-progress' : 'text-fg'].join(' ')}>
              {earned ? '✓' : partial ? '◐' : '✗'}
            </span>
            <span className="flex-1">
              <span className="block text-sm font-medium">
                Step {name.stepNo}
                <span className="sr-only">{earned ? ', found' : partial ? ', partly found' : ', lost'}</span>
              </span>
              <MathText text={name.criterion} className="block text-sm text-fg-muted" />
            </span>
            <span className="text-sm tnum" aria-label={`${step.awarded} of ${step.available} marks`}>
              {step.awarded}/{step.available}
            </span>
          </li>
        )
      })}
    </ol>
  )
}

export function ConfidenceLabel({ steps }: { steps: AssessedStep[] }) {
  const lowest: Confidence = steps.some((s) => s.confidence === 'low') ? 'low' : steps.some((s) => s.confidence === 'medium') ? 'medium' : 'high'
  return (
    <p className="text-sm text-fg-muted">
      Confidence: <span className="font-medium text-fg">{CONFIDENCE_LABEL[lowest]}</span>
      {lowest !== 'high' ? ' · your teacher will look at this one' : ''}
    </p>
  )
}
