import { useState } from 'react'

/**
 * WorkViewer (spec 05 §5; spec 06 §2): the learner's own work as the hero, shown exactly
 * as submitted (the photo, or the text, never re-typeset). Boxes come on a 0–1000 grid
 * and scale with CSS percentages; the lost step's box is outlined.
 */
export function WorkViewer({
  imageUrl,
  text,
  boxes,
  alt,
}: {
  imageUrl: string | null
  text: string | null
  boxes?: Array<{ box: number[]; label: string; lost: boolean }>
  alt: string
}) {
  const [failed, setFailed] = useState(false)
  if (imageUrl && !failed) {
    return (
      <figure className="relative m-0 overflow-hidden rounded-card bg-surface">
        <img src={imageUrl} alt={alt} className="block h-auto w-full" onError={() => setFailed(true)} />
        {(boxes ?? [])
          .filter((entry) => entry.lost)
          .map((entry) => {
            const [x0 = 0, y0 = 0, x1 = 1000, y1 = 1000] = entry.box
            return (
              <span
                key={entry.label}
                aria-hidden="true"
                className="pointer-events-none absolute rounded-md border-2 border-fg"
                style={{ left: `${x0 / 10}%`, top: `${y0 / 10}%`, width: `${Math.max(0, x1 - x0) / 10}%`, height: `${Math.max(0, y1 - y0) / 10}%` }}
              />
            )
          })}
      </figure>
    )
  }
  if (text) {
    return (
      <figure className="m-0 rounded-card bg-surface p-4">
        <pre className="m-0 font-serif text-base whitespace-pre-wrap">{text}</pre>
      </figure>
    )
  }
  return (
    <figure className="m-0 rounded-card bg-surface p-4">
      <p className="m-0 text-sm text-fg-muted">{imageUrl ? 'The photo link has expired. Reload to see it again.' : 'No work to show.'}</p>
    </figure>
  )
}
