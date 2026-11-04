import { useId, useState, type ChangeEvent } from 'react'
import { MAX_INPUT_TEXT } from '@guardian-book/shared'
import type { Capture } from '../../../components/CaptureSheet'
import { Button } from '../../../components/Form'
import { MathInput } from '../../../components/MathInput'
import { describeSize, prepareUpload } from '../../../lib/imagePrep'

/**
 * Snap or Type for a redo (L4) and a follow-up question (L5), brief B16 §6: the same two
 * targets as `CaptureSheet`, but Type goes through B15's `MathInput` (the maths keypad and
 * a live preview). It emits `CaptureSheet`'s `Capture`, so the screens' handlers are unchanged.
 */
export function MathCapture({ onCapture, disabled, typeLabel = 'Your working, line by line' }: { onCapture: (capture: Capture) => void; disabled?: boolean; typeLabel?: string }) {
  const [typing, setTyping] = useState(false)
  const [text, setText] = useState('')
  const [preparing, setPreparing] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)
  const fileId = useId()
  const textId = useId()

  async function onFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    setProblem(null)
    if (!/^(image\/(jpeg|png|webp)|application\/pdf)$/.test(file.type)) {
      setProblem('Use a JPEG, PNG or WebP photo, or a PDF.')
      return
    }
    setPreparing(true)
    try {
      const prepared = await prepareUpload(file)
      if (prepared.blob.size > 8 * 1024 * 1024) {
        setProblem(`That file is ${describeSize(prepared.blob.size)}; the limit is 8 MB.`)
        return
      }
      onCapture({ mode: 'snap', text: null, file: { ...prepared, originalBytes: file.size } })
    } finally {
      setPreparing(false)
    }
  }

  const target = 'flex min-h-24 flex-1 flex-col items-center justify-center gap-1 rounded-card bg-surface px-3 py-4 text-center font-medium ring-1 ring-fg-muted/30'

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3">
        <label htmlFor={fileId} className={[target, disabled || preparing ? 'opacity-60' : 'cursor-pointer'].join(' ')}>
          <span aria-hidden="true" className="text-2xl">
            ▣
          </span>
          Snap
          <span className="text-xs font-normal text-fg-muted">photo or PDF</span>
          <input id={fileId} type="file" accept="image/jpeg,image/png,image/webp,application/pdf" capture="environment" className="sr-only" onChange={onFile} disabled={disabled || preparing} />
        </label>
        <button type="button" className={[target, typing ? 'ring-2 ring-fg' : ''].join(' ')} onClick={() => setTyping(true)} disabled={disabled}>
          <span aria-hidden="true" className="text-2xl">
            ✎
          </span>
          Type
          <span className="text-xs font-normal text-fg-muted">your working</span>
        </button>
      </div>
      {preparing ? (
        <p className="text-sm text-fg-muted" aria-live="polite">
          Getting your photo ready…
        </p>
      ) : null}
      {problem ? (
        <p role="alert" className="text-sm font-medium">
          <span aria-hidden="true">! </span>
          {problem}
        </p>
      ) : null}
      {typing ? (
        <form
          className="flex flex-col gap-3"
          onSubmit={(event) => {
            event.preventDefault()
            const trimmed = text.trim()
            if (!trimmed) return
            onCapture({ mode: 'type', text: trimmed, file: null })
          }}
        >
          <MathInput id={textId} label={typeLabel} value={text} onChange={setText} rows={6} maxLength={MAX_INPUT_TEXT} required disabled={disabled} placeholder={'x^2 - 5x + 6 = 0\n(x - 2)(x - 3) = 0\n…'} />
          <div>
            <Button type="submit" disabled={disabled}>
              Use this
            </Button>
          </div>
        </form>
      ) : null}
    </div>
  )
}
