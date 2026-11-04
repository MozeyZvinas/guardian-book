import { useLayoutEffect, useMemo, useRef, useState, type SyntheticEvent } from 'react'
import { WorkViewer } from './WorkViewer'
import type { InkMark, InkPlan } from './RedInkPlan'

/**
 * RedInk (brief B11 §1; spec 03 §2 `box`, §6 rule 7): the teacher's pen on the learner's own
 * photo, as an SVG layer scaled from the 0–1000 grid to the image's natural size.
 *
 * - an earned step: a red tick at the right edge of its box;
 * - a lost step: a red ellipse round its box, a cross, and a short comment in the margin
 *   with a line to the ellipse; a partly earned step: the ellipse and the marks, no cross;
 * - the total, circled at the top right ("2/3"), like a teacher.
 *
 * Red is the `ink-red` token (never a status colour: the tick, the cross and the words
 * carry the meaning, A7). No handwriting font ships (no OFL file in /fonts), so the pen
 * writes in the bold system face. Ink appears step by step on first view; reduced motion
 * is honoured by tokens.css, which zeroes every animation.
 */

export const INK_LABEL = { checked: 'Checked by Guardian Book', reviewed: 'Teacher-reviewed' } as const
export type InkLabel = keyof typeof INK_LABEL

interface Natural {
  width: number
  height: number
}

/** The margin for comments, as a share of the image width; none when nothing is written. */
const MARGIN_SHARE = 0.42
const STEP_DELAY_MS = 260

const ink = 'var(--color-ink-red)'

function InkedFigure({ imageUrl, alt, plan, animate, onFailed }: { imageUrl: string; alt: string; plan: InkPlan; animate: boolean; onFailed: () => void }) {
  const [natural, setNatural] = useState<Natural | null>(null)
  const figureRef = useRef<HTMLElement>(null)
  const commentRefs = useRef(new Map<string, HTMLDivElement>())
  const [anchors, setAnchors] = useState<Record<string, { top: number; centre: number }>>({})

  const commented = useMemo(() => plan.marks.filter((mark) => mark.comment), [plan])
  const margin = natural && commented.length > 0 ? Math.round(natural.width * MARGIN_SHARE) : 0

  function onLoad(event: SyntheticEvent<HTMLImageElement>) {
    const img = event.currentTarget
    if (img.naturalWidth > 0 && img.naturalHeight > 0) setNatural({ width: img.naturalWidth, height: img.naturalHeight })
  }

  // Comments are HTML (they wrap); after layout, push overlapping ones down and read back
  // where each one sits, so the leader line in the SVG meets it.
  useLayoutEffect(() => {
    const figure = figureRef.current
    if (!figure || !natural || commented.length === 0) return
    const measure = () => {
      const figureHeight = figure.clientHeight
      if (figureHeight === 0) return
      const scale = figureHeight / natural.height
      const gap = 8
      let floor = 0
      const next: Record<string, { top: number; centre: number }> = {}
      for (const mark of [...commented].sort((a, b) => (a.box[1] + a.box[3]) / 2 - (b.box[1] + b.box[3]) / 2)) {
        const element = commentRefs.current.get(mark.stepId)
        if (!element) continue
        const wanted = ((mark.box[1] + mark.box[3]) / 2 / 1000) * natural.height * scale - element.offsetHeight / 2
        const top = Math.min(Math.max(wanted, floor), Math.max(0, figureHeight - element.offsetHeight))
        floor = top + element.offsetHeight + gap
        next[mark.stepId] = { top, centre: (top + element.offsetHeight / 2) / scale }
      }
      setAnchors((current) => (JSON.stringify(current) === JSON.stringify(next) ? current : next))
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(figure)
    return () => observer.disconnect()
  }, [natural, commented])

  // Before the image reports its size, show it plainly (no ink can be placed yet).
  if (!natural) {
    return (
      <figure ref={figureRef} className="relative m-0 overflow-hidden rounded-card bg-surface">
        <img src={imageUrl} alt={alt} className="block h-auto w-full" onLoad={onLoad} onError={onFailed} />
      </figure>
    )
  }

  const W = natural.width
  const H = natural.height
  const total = W + margin
  const unit = W / 1000
  const stroke = Math.max(2, W / 260)
  const font = Math.max(14, W / 30)
  const imageShare = (W / total) * 100
  const delay = (index: number) => (animate ? { animationDelay: `${index * STEP_DELAY_MS}ms` } : { animationDuration: '0ms' })
  const appear = 'motion-safe:animate-[fade-in_320ms_ease-out_both]'
  // Two steps earned on the same line of working share a box (seen live): their ticks sit side by side.
  const seen = new Map<string, number>()
  const repeat = plan.marks.map((mark) => {
    const key = mark.box.join(',')
    const n = seen.get(key) ?? 0
    seen.set(key, n + 1)
    return n
  })

  return (
    <figure ref={figureRef} className="relative m-0 overflow-hidden rounded-card bg-surface" style={{ aspectRatio: `${total} / ${H}` }} data-ink-figure>
      <img src={imageUrl} alt={alt} className="absolute top-0 left-0 h-full" style={{ width: `${imageShare}%` }} onLoad={onLoad} onError={onFailed} />
      <svg
        viewBox={`0 0 ${total} ${H}`}
        preserveAspectRatio="none"
        className="pointer-events-none absolute inset-0 h-full w-full"
        aria-hidden="true"
        fill="none"
        stroke={ink}
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {plan.marks.map((mark, index) => (
          <g key={mark.stepId} className={appear} style={delay(index)} data-ink={mark.kind} data-step={mark.stepNo}>
            <Mark mark={mark} unit={unit} stroke={stroke} font={font} repeat={repeat[index] ?? 0} />
            {mark.comment && anchors[mark.stepId] ? <path d={leader(mark, unit, W, anchors[mark.stepId]?.centre ?? 0)} strokeDasharray={`${stroke * 2} ${stroke * 2}`} strokeWidth={stroke * 0.7} /> : null}
          </g>
        ))}
        <g className={appear} style={delay(plan.marks.length)} data-ink="total">
          <Total total={plan.total} W={W} font={font} stroke={stroke} />
        </g>
      </svg>
      {commented.map((mark, index) => (
        <div
          key={mark.stepId}
          ref={(element) => {
            if (element) commentRefs.current.set(mark.stepId, element)
            else commentRefs.current.delete(mark.stepId)
          }}
          className={['absolute pr-2 text-sm leading-snug font-bold text-ink-red', appear].join(' ')}
          style={{ left: `calc(${imageShare}% + 10px)`, width: `calc(${100 - imageShare}% - 10px)`, top: anchors[mark.stepId]?.top ?? 0, ...delay(plan.marks.findIndex((m) => m.stepId === mark.stepId) + index * 0) }}
          data-ink-comment={mark.stepNo}
        >
          <span className="sr-only">Step {mark.stepNo}: </span>
          {mark.comment}
        </div>
      ))}
    </figure>
  )
}

/** The pen's marks for one step, in image units. */
function Mark({ mark, unit, stroke, font, repeat }: { mark: InkMark; unit: number; stroke: number; font: number; repeat: number }) {
  const [x0, y0, x1, y1] = mark.box.map((n) => n * unit) as [number, number, number, number]
  const w = Math.max(x1 - x0, unit * 20)
  const h = Math.max(y1 - y0, unit * 20)
  const cx = x0 + w / 2
  const cy = y0 + h / 2
  if (mark.kind === 'tick') {
    // A tick just past the right edge of the box, the size of a line of writing.
    const s = Math.max(h * 0.9, font * 1.4)
    const tx = Math.min(x1 + s * 0.3 + repeat * s * 1.1, 1000 * unit - s)
    const ty = cy
    return <path d={`M ${tx} ${ty} l ${s * 0.3} ${s * 0.32} l ${s * 0.7} ${-s * 0.72}`} strokeWidth={stroke * 1.3} />
  }
  const rx = w / 2 + unit * 18
  const ry = h / 2 + unit * 14
  const cross = Math.max(font * 0.8, h * 0.5)
  const cxr = Math.min(x1 + rx * 0.08 + cross + repeat * cross * 1.3, 1000 * unit - cross / 2)
  return (
    <>
      <ellipse cx={cx} cy={cy} rx={rx} ry={ry} />
      {mark.kind === 'lost' ? (
        <path d={`M ${cxr - cross / 2} ${cy - cross / 2} l ${cross} ${cross} M ${cxr + cross / 2} ${cy - cross / 2} l ${-cross} ${cross}`} strokeWidth={stroke * 1.3} />
      ) : (
        <text x={cxr} y={cy + font * 0.35} fill={ink} stroke="none" fontSize={font} fontWeight="700" fontFamily="system-ui, sans-serif" textAnchor="middle">
          {mark.awarded}/{mark.available}
        </text>
      )}
    </>
  )
}

/** A dashed line from the right of the ellipse to the comment in the margin. */
function leader(mark: InkMark, unit: number, W: number, commentCentreY: number): string {
  const y0 = mark.box[1] * unit
  const x1 = mark.box[2] * unit
  const y1 = mark.box[3] * unit
  const h = Math.max(y1 - y0, unit * 20)
  const startX = Math.min(x1 + unit * 18 + unit * 10, W)
  const startY = y0 + h / 2
  const endX = W + unit * 8
  return `M ${startX} ${startY} C ${W - unit * 10} ${startY}, ${W - unit * 10} ${commentCentreY}, ${endX} ${commentCentreY}`
}

/** The total, circled top right, like a teacher. */
function Total({ total, W, font, stroke }: { total: InkPlan['total']; W: number; font: number; stroke: number }) {
  const size = font * 1.5
  const r = size * 1.1
  const cx = W - r - font * 0.6
  const cy = r + font * 0.6
  return (
    <>
      <ellipse cx={cx} cy={cy} rx={r * 1.15} ry={r} strokeWidth={stroke * 1.1} />
      <text x={cx} y={cy + size * 0.36} fill={ink} stroke="none" fontSize={size} fontWeight="700" fontFamily="system-ui, sans-serif" textAnchor="middle">
        {total.awarded}/{total.available}
      </text>
    </>
  )
}

/**
 * The photo with its red ink, a Show / Hide toggle and the label (Checked by Guardian Book
 * before release, Teacher-reviewed after). Typed work, a missing photo or a plan with no
 * marks falls back to `WorkViewer` exactly as before.
 */
export function RedInk({ imageUrl, text, alt, plan, label }: { imageUrl: string | null; text: string | null; alt: string; plan: InkPlan | null; label: InkLabel }) {
  const [shown, setShown] = useState(true)
  const [failed, setFailed] = useState(false)
  // Step by step on first view only: once the pen has been hidden or shown again, it just appears.
  const [firstView, setFirstView] = useState(true)
  const animate = firstView

  const canInk = Boolean(imageUrl) && !failed && plan !== null && plan.marks.length > 0
  if (!canInk) {
    return <WorkViewer imageUrl={imageUrl} text={text} alt={alt} boxes={plan?.marks.map((mark) => ({ box: mark.box, label: mark.stepId, lost: mark.kind !== 'tick' })) ?? []} />
  }
  return (
    <div className="flex flex-col gap-2">
      {shown && imageUrl && plan ? (
        <InkedFigure imageUrl={imageUrl} alt={alt} plan={plan} animate={animate} onFailed={() => setFailed(true)} />
      ) : (
        <WorkViewer imageUrl={imageUrl} text={text} alt={alt} boxes={[]} />
      )}
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <p className="m-0 text-fg-muted" data-ink-label>
          <span aria-hidden="true" className="text-ink-red">
            ✎{' '}
          </span>
          {INK_LABEL[label]}
          {plan && plan.listed.length > 0 && shown ? ` · ${plan.listed.length === 1 ? `step ${plan.listed[0]} is` : `steps ${plan.listed.join(', ')} are`} in the list only` : ''}
        </p>
        <button
          type="button"
          onClick={() => {
            setFirstView(false)
            setShown((s) => !s)
          }}
          className="min-h-11 rounded-card px-3 font-medium text-action"
          aria-pressed={shown}
        >
          {shown ? 'Hide red ink' : 'Show red ink'}
        </button>
      </div>
      <p className="sr-only">
        Red ink: {plan.marks.map((mark) => `step ${mark.stepNo} ${mark.kind === 'tick' ? 'ticked' : mark.kind === 'lost' ? 'circled, lost' : `circled, ${mark.awarded} of ${mark.available}`}${mark.comment ? `, comment: ${mark.comment}` : ''}`).join('; ')}; total {plan.total.awarded} of {plan.total.available}.
      </p>
    </div>
  )
}
