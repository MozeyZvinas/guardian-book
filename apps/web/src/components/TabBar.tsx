import { NavLink } from 'react-router'

/**
 * The learner's tabs (spec 05 §2; spec 06 §4): a bottom bar on a phone (≤4 tabs, 44px
 * targets, within thumb reach), a left sidebar from 1024px. The active tab is said in
 * words and with a mark, never by colour alone (A7).
 */
export const LEARNER_TABS = [
  { to: '/today', label: 'Today', glyph: '☀' },
  { to: '/bring', label: 'Bring', glyph: '＋' },
  { to: '/brain', label: 'Brain', glyph: '◉' },
  { to: '/me', label: 'Me', glyph: '●' },
] as const

export function TabBar() {
  return (
    <nav
      aria-label="Learner"
      className="fixed inset-x-0 bottom-0 z-10 border-t border-fg-muted/30 bg-ground pb-[env(safe-area-inset-bottom)] lg:static lg:border-0 lg:bg-transparent lg:pb-0"
    >
      <ul className="m-0 mx-auto flex w-full max-w-[600px] list-none justify-around p-0 lg:max-w-none lg:flex-col lg:justify-start lg:gap-1">
        {LEARNER_TABS.map((tab) => (
          <li key={tab.to} className="flex-1 lg:flex-none">
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
  )
}
