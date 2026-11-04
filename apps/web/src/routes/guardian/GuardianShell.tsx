import type { ReactNode } from 'react'
import { NavLink } from 'react-router'
import type { MeResponse } from '@guardian-book/shared'
import { Wordmark } from '../../components/Wordmark'

/**
 * The guardian space frame (spec 05 §2, §4.3; spec 06 §4): a deep-green header band (the
 * guardian's side colour, DESIGN tokens) and four tabs: This week · Notes · Calendar ·
 * Settings. Bottom bar on a phone, sidebar from 1024px. The active tab is said in words.
 */
export function guardianTabs(me: MeResponse) {
  const first = me.learners[0]
  return [
    { to: first ? `/guardian/learners/${first.learnerId}` : '/guardian/link', label: 'This week', glyph: '☀' },
    { to: '/guardian/notes', label: 'Notes', glyph: '✉' },
    { to: '/guardian/calendar', label: 'Calendar', glyph: '◷' },
    { to: '/guardian/settings', label: 'Settings', glyph: '●' },
  ] as const
}

export function GuardianShell({ me, children }: { me: MeResponse; children: ReactNode }) {
  const tabs = guardianTabs(me)
  return (
    <div className="flex min-h-dvh flex-col bg-ground text-fg">
      <header className="bg-green text-white">
        <div className="mx-auto flex w-full max-w-[600px] items-center justify-between px-4 py-3 sm:px-6 lg:max-w-[1200px]">
          <Wordmark />
          <span className="rounded-full bg-white/15 px-3 py-1 text-xs font-medium tracking-wide">Parent</span>
        </div>
      </header>
      <div className="mx-auto w-full max-w-[600px] flex-1 px-4 pt-6 pb-24 sm:px-6 lg:grid lg:max-w-[1200px] lg:grid-cols-[200px_1fr] lg:gap-10 lg:pb-10">
        <nav aria-label="Guardian" className="fixed inset-x-0 bottom-0 z-10 border-t border-fg-muted/30 bg-ground pb-[env(safe-area-inset-bottom)] lg:static lg:border-0 lg:bg-transparent lg:pb-0">
          <ul className="m-0 mx-auto flex w-full max-w-[600px] list-none justify-around p-0 lg:max-w-none lg:flex-col lg:justify-start lg:gap-1">
            {tabs.map((tab) => (
              <li key={tab.label} className="flex-1 lg:flex-none">
                <NavLink
                  to={tab.to}
                  className={({ isActive }) =>
                    [
                      'flex min-h-14 flex-col items-center justify-center gap-0.5 text-xs font-medium no-underline lg:min-h-11 lg:flex-row lg:justify-start lg:gap-3 lg:rounded-card lg:px-3 lg:text-base',
                      isActive ? 'text-fg lg:bg-surface' : 'text-fg-muted',
                    ].join(' ')
                  }
                >
                  {({ isActive }) => (
                    <>
                      <span aria-hidden="true" className="text-lg leading-none lg:text-base">
                        {tab.glyph}
                      </span>
                      <span>{tab.label}</span>
                      {isActive ? <span className="sr-only"> (current)</span> : null}
                    </>
                  )}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
        <main className="flex flex-col gap-6 lg:max-w-[720px]">{children}</main>
      </div>
    </div>
  )
}
