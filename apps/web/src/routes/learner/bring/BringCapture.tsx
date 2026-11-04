import { useId, useState, type ChangeEvent } from 'react'
import { MAX_GUIDE_TEXT, MAX_INPUT_TEXT } from '@guardian-book/shared'
import { Button } from '../../../components/Form'
import { MathInput } from '../../../components/MathInput'
import { describeSize, prepareUpload } from '../../../lib/imagePrep'

export type BringChoice = 'work' | 'question' | 'notice'

export interface BringCaptureResult {
  text: string | null
  file: { blob: Blob; filename: string; originalBytes: number } | null
}

const COPY: Record<BringChoice, { snapHint: string; typeHint: string; typeLabel: string; placeholder: string; submit: string; rows: number; accept: string }> = {
  work: {
    snapHint: 'your working',
    typeHint: 'your working',
    typeLabel: 'Your working, line by line',
    placeholder: 'x² − 5x + 6 = 0\n(x − 2)(x − 3) = 0\n…',
    submit: 'Use this',
    rows: 6,
    accept: 'image/jpeg,image/png,image/webp,application/pdf',
  },
  question: {
    snapHint: 'the question',
    typeHint: 'the question',
    typeLabel: 'Your question',
    placeholder: 'Find two rational numbers between 1/4 and 7/8',
    submit: 'Read my question',
    rows: 4,
    accept: 'image/jpeg,image/png,image/webp',
  },
  notice: {
    snapHint: 'the notice',
    typeHint: 'the dates',
    typeLabel: 'The notice, as written',
    placeholder: 'Maths Paper 1 on 20 November\n…',
    submit: 'Read the notice',
    rows: 6,
    accept: 'image/jpeg,image/png,image/webp,application/pdf',
  },
}

/**
 * Bring's capture (brief B15 §1, §8): Snap or Type for the choice the learner made.
 * Typing goes through `MathInput` (the maths keypad, a live preview) for work and
 * questions; a notice is prose. Photos are downscaled before upload.
 */
export function BringCapture({ choice, onCapture, disabled }: { choice: BringChoice; onCapture: (capture: BringCaptureResult) => void; disabled?: boolean }) {
  const [typing, setTyping] = useState(false)
  const [text, setText] = useState('')
  const [preparing, setPreparing] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)
  const fileId = useId()
  const textId = useId()
  const copy = COPY[choice]
  const maxLength = choice === 'question' ? MAX_GUIDE_TEXT : MAX_INPUT_TEXT

  async function onFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    setProblem(null)
    const allowed = choice === 'question' ? /^image\/(jpeg|png|webp)$/ : /^(image\/(jpeg|png|webp)|application\/pdf)$/
    if (!allowed.test(file.type)) {
      setProblem(choice === 'question' ? 'Use a JPEG, PNG or WebP photo of the question.' : 'Use a JPEG, PNG or WebP photo, or a PDF.')
      return
    }
    setPreparing(true)
    try {
      const prepared = await prepareUpload(file)
      if (prepared.blob.size > 8 * 1024 * 1024) {
        setProblem(`That file is ${describeSize(prepared.blob.size)}; the limit is 8 MB.`)
        return
      }
      onCapture({ text: null, file: { ...prepared, originalBytes: file.size } })
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
          <span className="text-xs font-normal text-fg-muted">a photo of {copy.snapHint}</span>
          <input id={fileId} type="file" accept={copy.accept} capture="environment" className="sr-only" onChange={onFile} disabled={disabled || preparing} />
        </label>
        <button type="button" className={[target, typing ? 'ring-2 ring-fg' : ''].join(' ')} onClick={() => setTyping(true)} disabled={disabled}>
          <span aria-hidden="true" className="text-2xl">
            ✎
          </span>
          Type
          <span className="text-xs font-normal text-fg-muted">{copy.typeHint}</span>
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
            onCapture({ text: trimmed, file: null })
          }}
        >
          {choice === 'notice' ? (
            <>
              <label htmlFor={textId} className="text-sm font-medium">
                {copy.typeLabel}
              </label>
              <textarea
                id={textId}
                name="text"
                rows={copy.rows}
                maxLength={maxLength}
                required
                value={text}
                onChange={(event) => setText(event.target.value)}
                placeholder={copy.placeholder}
                className="w-full rounded-card border border-fg-muted/50 bg-ground px-3 py-2 text-base text-fg placeholder:text-fg-muted focus-visible:border-action"
              />
            </>
          ) : (
            <MathInput id={textId} name="text" label={copy.typeLabel} value={text} onChange={setText} rows={copy.rows} maxLength={maxLength} required placeholder={copy.placeholder} disabled={disabled} />
          )}
          <div>
            <Button type="submit" disabled={disabled || !text.trim()}>
              {copy.submit}
            </Button>
          </div>
        </form>
      ) : null}
    </div>
  )
}
