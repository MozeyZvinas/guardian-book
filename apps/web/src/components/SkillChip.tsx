import type { BrainSkill, SkillMark } from '@guardian-book/shared'

/**
 * SkillChip (spec 05 §5, §9): the label (never a raw tag), the state said in a word and a
 * glyph (teal for secure, hollow for new; colour never alone, A7), and three small marks:
 * with help · on your own · later. Tapping opens the evidence behind it.
 */

export const STATE_WORD = { new: 'New', practising: 'Practising', secure: 'Secure' } as const
const STATE_GLYPH = { new: '◯', practising: '◐', secure: '●' } as const

export const MARK_LABELS = { assisted: 'with help', independent: 'on your own', retained: 'later' } as const

export function SkillStateBadge({ state }: { state: BrainSkill['state'] }) {
  const look =
    state === 'secure'
      ? 'bg-[color-mix(in_srgb,var(--color-progress)_16%,var(--color-ground))] text-fg'
      : state === 'practising'
        ? 'bg-surface text-fg'
        : 'border border-fg-muted/50 bg-ground text-fg-muted'
  return (
    <span className={['inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium', look].join(' ')}>
      <span aria-hidden="true" className={state === 'secure' ? 'text-progress' : ''}>
        {STATE_GLYPH[state]}
      </span>
      {STATE_WORD[state]}
    </span>
  )
}

export function Mark({ label, mark }: { label: string; mark: SkillMark }) {
  const none = mark.total === 0
  return (
    <span className={['inline-flex items-baseline gap-1 text-xs', none ? 'text-fg-muted' : 'text-fg'].join(' ')} aria-label={`${label}: ${mark.correct} of ${mark.total}`}>
      <span aria-hidden="true">{none ? '–' : mark.correct === mark.total ? '✓' : '·'}</span>
      <span>{label}</span>
      {none ? null : (
        <span className="tnum" aria-hidden="true">
          {mark.correct}/{mark.total}
        </span>
      )}
    </span>
  )
}

export function SkillChip({ skill, selected, onSelect }: { skill: BrainSkill; selected: boolean; onSelect: () => void }) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={[
        'flex w-full flex-col gap-2 rounded-card border p-3 text-left',
        selected ? 'border-fg bg-surface' : 'border-fg-muted/30 bg-ground',
      ].join(' ')}
    >
      <span className="flex items-start justify-between gap-3">
        <span className="font-medium">{skill.label}</span>
        <SkillStateBadge state={skill.state} />
      </span>
      <span className="flex flex-wrap gap-x-4 gap-y-1">
        <Mark label={MARK_LABELS.assisted} mark={skill.assisted} />
        <Mark label={MARK_LABELS.independent} mark={skill.independent} />
        <Mark label={MARK_LABELS.retained} mark={skill.retained} />
      </span>
    </button>
  )
}
