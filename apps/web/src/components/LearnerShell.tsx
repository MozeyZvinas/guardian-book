import type { ReactNode } from 'react'
import { TabBar } from './TabBar'
import { Wordmark } from './Wordmark'

/**
 * The learner space frame (spec 06 §4): one column with 16px gutters and the tab bar at
 * the bottom on a phone; from 1024px the tab bar becomes a sidebar and the content sits
 * in a centred 1200px grid. No horizontal scroll at any width.
 */
export function LearnerShell({ children, footer }: { children: ReactNode; footer?: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col bg-ground text-fg">
      <div className="mx-auto w-full max-w-[600px] flex-1 px-4 pt-6 pb-24 sm:px-6 lg:grid lg:max-w-[1200px] lg:grid-cols-[200px_1fr] lg:gap-10 lg:pb-10">
        <div className="flex flex-col gap-6 lg:sticky lg:top-6 lg:self-start">
          <header>
            <Wordmark />
          </header>
          <TabBar />
        </div>
        <div className="flex flex-col gap-6 lg:max-w-[720px]">
          <main className="flex flex-col gap-6">{children}</main>
          {footer ? <footer className="mt-4 flex flex-col gap-3 text-sm text-fg-muted">{footer}</footer> : null}
        </div>
      </div>
    </div>
  )
}
