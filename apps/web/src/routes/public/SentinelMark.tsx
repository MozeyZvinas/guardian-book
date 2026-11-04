/**
 * The Sentinel mark (DESIGN.md §v2; geometry from docs/vision/design/sentinel/K-spec):
 * four crest feathers, the secretary bird's head, beak and eye. The crest takes the
 * accent and the head takes the ink, both from tokens; the eye is the ground colour so
 * it always reads. Decorative: the words beside it carry the meaning (A7).
 */
export function SentinelMark({ className }: { className?: string }) {
  return (
    <svg viewBox="4 12 92 76" aria-hidden="true" focusable="false" className={className}>
      {[-18, -44, -70, -96].map((angle) => (
        <rect key={angle} x="-5" y="-34" width="10" height="34" rx="5" transform={`translate(46 54) rotate(${angle})`} className="fill-action" />
      ))}
      <circle cx="56" cy="64" r="18" className="fill-fg" />
      <path d="M72 58 L92 64 L73 72 Z" className="fill-fg" />
      <circle cx="61" cy="60" r="4" className="fill-ground" />
    </svg>
  )
}
