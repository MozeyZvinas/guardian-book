import type { CSSProperties } from 'react'

/**
 * The Sentinel crest as the emotion dial (DESIGN.md §v2 A5, §1.1a(iv)): three pages that
 * fan open to celebrate ("the book opens"). Pink is the crest's colour by rule; the words
 * beside it carry the meaning (A7). Reduced motion: tokens.css zeroes the animation, so
 * the crest simply appears fanned.
 */
export function CrestFan({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center gap-3" role="img" aria-label={label}>
      <span aria-hidden="true" className="relative inline-block h-8 w-8">
        {[-28, 0, 28].map((angle, index) => (
          <span
            key={angle}
            className="absolute bottom-0 left-1/2 h-7 w-2 origin-bottom rounded-full bg-action motion-safe:animate-[crest-fan_480ms_ease-out_both]"
            style={{ '--fan': `${angle}deg`, animationDelay: `${index * 80}ms`, transform: `translateX(-50%) rotate(${angle}deg)` } as CSSProperties}
          />
        ))}
        <span className="absolute bottom-0 left-1/2 h-3 w-3 -translate-x-1/2 translate-y-1/2 rounded-full bg-fg" />
      </span>
    </span>
  )
}
