import { useId, useState, type ChangeEvent } from 'react'
import { MAX_INPUT_TEXT } from '@guardian-book/shared'
import { describeSize, prepareUpload } from '../lib/imagePrep'
import { Button } from './Form'
import { StatusChip } from './StatusChip'

export type CaptureMode = 'snap' | 'type' | 'ask'

export interface Capture {
  mode: CaptureMode
  text: string | null
  file: { blob: Blob; filename: string; originalBytes: number } | null
}

/**
 * CaptureSheet (spec 05 §4.2 L2): three big targets, Snap · Type · Ask. Snap opens the
 * camera or a file (photo or PDF) and downscales photos before upload; Ask is typed for
 * now and says so (voice is P1-a, PLANNED).
 */
export function CaptureSheet({
  onCapture,
  disabled,
  modes = ['snap', 'type', 'ask'],
  typeLabel = 'Your working, line by line',
}: {
  onCapture: (capture: Capture) => void
  disabled?: boolean
  /** Which targets to show; the fix and follow-up screens take Snap and Type only (B06). */
  modes?: readonly CaptureMode[]
  typeLabel?: string
}) {
  const [mode, setMode] = useState<CaptureMode | null>(null)
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
      <div className={['grid gap-3', modes.length === 3 ? 'grid-cols-3' : 'grid-cols-2'].join(' ')}>
        {modes.includes('snap') ? (
        <label htmlFor={fileId} className={[target, disabled || preparing ? 'opacity-60' : 'cursor-pointer'].join(' ')}>
          <span aria-hidden="true" className="text-2xl">
            ▣
          </span>
          Snap
          <span className="text-xs font-normal text-fg-muted">photo or PDF</span>
          <input
            id={fileId}
            type="file"
            accept="image/jpeg,image/png,image/webp,application/pdf"
            capture="environment"
            className="sr-only"
            onChange={onFile}
            disabled={disabled || preparing}
          />
        </label>
        ) : null}
        {modes.includes('type') ? (
        <button type="button" className={[target, mode === 'type' ? 'ring-2 ring-fg' : ''].join(' ')} onClick={() => setMode('type')} disabled={disabled}>
          <span aria-hidden="true" className="text-2xl">
            ✎
          </span>
          Type
          <span className="text-xs font-normal text-fg-muted">your working</span>
        </button>
        ) : null}
        {modes.includes('ask') ? (
        <button type="button" className={[target, mode === 'ask' ? 'ring-2 ring-fg' : ''].join(' ')} onClick={() => setMode('ask')} disabled={disabled}>
          <span aria-hidden="true" className="text-2xl">
            ?
          </span>
          Ask
          <span className="text-xs font-normal text-fg-muted">about a step</span>
        </button>
        ) : null}
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

      {mode === 'type' || mode === 'ask' ? (
        <form
          className="flex flex-col gap-3"
          onSubmit={(event) => {
            event.preventDefault()
            const text = String(new FormData(event.currentTarget).get('text') ?? '').trim()
            if (!text) return
            onCapture({ mode, text, file: null })
          }}
        >
          <label htmlFor={textId} className="text-sm font-medium">
            {mode === 'type' ? typeLabel : 'Your question'}
          </label>
          <textarea
            id={textId}
            name="text"
            rows={mode === 'type' ? 7 : 3}
            maxLength={MAX_INPUT_TEXT}
            required
            placeholder={mode === 'type' ? 'x² − 5x + 6 = 0\n(x − 2)(x − 3) = 0\n…' : 'Why does the sign change in step 2?'}
            className="w-full rounded-card border border-fg-muted/50 bg-ground px-3 py-2 font-serif text-base text-fg placeholder:text-fg-muted focus-visible:border-action"
          />
          {mode === 'ask' ? (
            <p className="text-sm text-fg-muted">
              Say it instead of typing it: <StatusChip status="PLANNED" />
            </p>
          ) : null}
          <div>
            <Button type="submit" disabled={disabled}>
              {mode === 'type' ? 'Use this' : 'Ask'}
            </Button>
          </div>
        </form>
      ) : null}
    </div>
  )
}
