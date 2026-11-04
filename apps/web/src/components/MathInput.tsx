import { useLayoutEffect, useRef, useState, type ChangeEvent } from 'react'
import { MATH_KEYS, applyKey, type MathKey } from './MathInput.keys'
import { MathText, hasMath } from './MathText'

/**
 * MathInput (brief B15 §8): a text box with a calculator-style keypad above the phone
 * keyboard and a live preview through `MathText`. The keys write `$…$` TeX into the
 * text, so the guide, the work check and every screen already understand it. Each key is
 * a labelled 44 px button; tapping one keeps the focus (and the phone keyboard) in the
 * box. Controlled: pass `value` and `onChange`.
 */
export interface MathInputProps {
  id: string
  label: string
  value: string
  onChange: (value: string) => void
  name?: string
  rows?: number
  placeholder?: string
  maxLength?: number
  required?: boolean
  disabled?: boolean
  /** A line under the label, in plain words. */
  hint?: string
  /** Hide the keypad (the box then behaves like a plain textarea). */
  keypad?: boolean
}

export function MathInput({ id, label, value, onChange, name, rows = 4, placeholder, maxLength, required, disabled, hint, keypad = true }: MathInputProps) {
  const textarea = useRef<HTMLTextAreaElement>(null)
  const pendingCaret = useRef<number | null>(null)
  const [previewOpen, setPreviewOpen] = useState(true)

  // After a key edits the value, the caret goes where the key said (inside the braces).
  useLayoutEffect(() => {
    const caret = pendingCaret.current
    if (caret === null || !textarea.current) return
    pendingCaret.current = null
    textarea.current.focus()
    textarea.current.setSelectionRange(caret, caret)
  }, [value])

  function press(key: MathKey) {
    const box = textarea.current
    const start = box?.selectionStart ?? value.length
    const end = box?.selectionEnd ?? value.length
    const edit = applyKey(value, start, end, key)
    pendingCaret.current = edit.caret
    onChange(edit.value)
  }

  function onInput(event: ChangeEvent<HTMLTextAreaElement>) {
    onChange(event.target.value)
  }

  const keyClass = 'inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-card bg-surface px-2 font-serif text-base text-fg ring-1 ring-fg-muted/30 active:bg-ground disabled:opacity-60'

  return (
    <div className="flex min-w-0 flex-col gap-2">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      {hint ? <p className="m-0 text-sm text-fg-muted">{hint}</p> : null}
      {keypad ? (
        <div role="toolbar" aria-label="Maths keys" aria-controls={id} className="-mx-1 overflow-x-auto px-1 pb-1">
          <div className="grid w-max grid-flow-col grid-rows-2 gap-1.5">
            {MATH_KEYS.map((key) => (
              <button
                key={key.id}
                type="button"
                aria-label={key.aria}
                title={key.aria}
                disabled={disabled}
                className={keyClass}
                // Keep the focus (and the phone keyboard) in the box while a key is tapped.
                onPointerDown={(event) => event.preventDefault()}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => press(key)}
              >
                {key.label}
              </button>
            ))}
          </div>
        </div>
      ) : null}
      <textarea
        ref={textarea}
        id={id}
        name={name}
        rows={rows}
        value={value}
        onChange={onInput}
        placeholder={placeholder}
        maxLength={maxLength}
        required={required}
        disabled={disabled}
        autoCapitalize="off"
        autoCorrect="off"
        spellCheck={false}
        className="w-full rounded-card border border-fg-muted/50 bg-ground px-3 py-2 font-serif text-base text-fg placeholder:text-fg-muted focus-visible:border-action"
      />
      {hasMath(value) ? (
        <div className="flex min-w-0 flex-col gap-1 rounded-card bg-surface p-3">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-medium text-fg-muted">Preview</span>
            <button type="button" className="min-h-8 text-xs text-fg-muted underline" onClick={() => setPreviewOpen((open) => !open)} aria-expanded={previewOpen}>
              {previewOpen ? 'Hide' : 'Show'}
            </button>
          </div>
          {previewOpen ? (
            <div aria-live="polite">
              <MathText as="div" text={value} className="overflow-x-auto font-serif whitespace-pre-wrap" />
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
