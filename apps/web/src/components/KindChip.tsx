import type { InputKind } from '@guardian-book/shared'

export const KIND_LABEL: Record<InputKind, string> = {
  work: 'Homework',
  notice: 'Notice',
  question: 'Question',
}

/**
 * The what-is-this chip (spec 05 §4.2 L2): the kind the server read, changeable by the
 * learner. When the server was not sure the chip asks "Which is it?".
 */
export function KindChips({ value, uncertain, onChange, disabled }: { value: InputKind | null; uncertain: boolean; onChange: (kind: InputKind) => void; disabled?: boolean }) {
  return (
    <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
      <legend className="text-sm font-medium">{uncertain ? 'Which is it?' : 'This is'}</legend>
      <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="What is this">
        {(Object.keys(KIND_LABEL) as InputKind[]).map((kind) => {
          const selected = value === kind
          return (
            <button
              key={kind}
              type="button"
              role="radio"
              aria-checked={selected}
              disabled={disabled}
              onClick={() => onChange(kind)}
              className={[
                'min-h-11 rounded-full px-4 text-sm font-medium',
                selected ? 'bg-fg text-ground' : 'bg-surface text-fg ring-1 ring-fg-muted/40',
              ].join(' ')}
            >
              {selected ? '● ' : ''}
              {KIND_LABEL[kind]}
            </button>
          )
        })}
      </div>
    </fieldset>
  )
}
