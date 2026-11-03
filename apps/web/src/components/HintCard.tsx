/** HintCard (spec 05 §5): the nudge, never the answer. The verifier guarantees the latter. */
export function HintCard({ hint, stepNo }: { hint: string; stepNo: number }) {
  return (
    <aside
      aria-labelledby="hint-heading"
      className="flex flex-col gap-1 rounded-card bg-[color-mix(in_srgb,var(--color-progress)_10%,var(--color-ground))] p-4"
    >
      <h2 id="hint-heading" className="text-sm font-medium text-fg-muted">
        Hint for step {stepNo}
      </h2>
      <p className="text-balance">{hint}</p>
    </aside>
  )
}
