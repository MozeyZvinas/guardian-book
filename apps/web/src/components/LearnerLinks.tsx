import { NavLink } from 'react-router'

/**
 * The learner's way around until the tab bar lands with Today (B05): Bring, Calendar, Me.
 * Links are actions, so they are pink; the current one is plain ink.
 */
export function LearnerLinks() {
  const links = [
    { to: '/bring', label: 'Bring' },
    { to: '/calendar', label: 'Calendar' },
    { to: '/me', label: 'Me' },
  ]
  return (
    <nav aria-label="Learner" className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
      {links.map((link) => (
        <NavLink key={link.to} to={link.to} className={({ isActive }) => (isActive ? 'font-medium text-fg no-underline' : '')}>
          {link.label}
        </NavLink>
      ))}
    </nav>
  )
}
