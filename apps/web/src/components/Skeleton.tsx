/** Loading rows (spec 05 §7): visible under 200 ms, never a blank screen. Motion honours reduced-motion via tokens.css. */
export function Skeleton({ lines = 3, label = 'Loading' }: { lines?: number; label?: string }) {
  const widths = ['w-2/3', 'w-full', 'w-1/2', 'w-5/6']
  return (
    <div role="status" aria-live="polite" className="flex flex-col gap-3">
      <span className="sr-only">{label}…</span>
      {Array.from({ length: lines }, (_, index) => (
        <div key={index} aria-hidden="true" className={['h-5 animate-pulse rounded-card bg-surface', widths[index % widths.length]].join(' ')} />
      ))}
    </div>
  )
}

export function SkeletonCard({ lines = 2 }: { lines?: number }) {
  return (
    <div aria-hidden="true" className="flex flex-col gap-3 rounded-card bg-surface p-4">
      {Array.from({ length: lines }, (_, index) => (
        <div key={index} className={['h-4 animate-pulse rounded-card bg-ground', index === 0 ? 'w-1/3' : 'w-5/6'].join(' ')} />
      ))}
    </div>
  )
}
