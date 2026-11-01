import type { ReactNode } from 'react'
import { Wordmark } from './Wordmark'

/**
 * The phone-first page frame: one column, 16px gutters at 360px, wider on larger screens,
 * content capped at 600px for public pages (spec 06 §4).
 */
export function Page({ children, footer }: { children: ReactNode; footer?: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col bg-ground text-fg">
      <div className="mx-auto flex w-full max-w-[600px] flex-1 flex-col gap-10 px-4 pt-8 pb-10 sm:px-6">
        <header>
          <Wordmark />
        </header>
        <main className="flex flex-1 flex-col gap-6">{children}</main>
        {footer ? <footer className="mt-auto flex flex-col gap-3 text-sm text-fg-muted">{footer}</footer> : null}
      </div>
    </div>
  )
}
