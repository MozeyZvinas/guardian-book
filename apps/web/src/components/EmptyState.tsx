import type { ReactNode } from 'react'

/** A calm empty state (spec 05 §7): one line of what this is, one of what to do next. */
export function EmptyState({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col gap-2 rounded-card border border-dashed border-fg-muted/40 p-4">
      <p className="font-medium">{title}</p>
      {children ? <div className="text-sm text-fg-muted">{children}</div> : null}
      {action ? <div className="pt-1">{action}</div> : null}
    </div>
  )
}
