import { Navigate } from 'react-router'
import type { MeResponse, Role } from '@guardian-book/shared'
import { homeFor } from '../api/auth'
import { Page } from '../components/Page'
import { useMe } from '../state/me'

/**
 * Gates a space by role on the client (the API enforces it again). No session → sign in;
 * another role → that role's home; the server not configured → a calm banner, never a crash.
 */
export function RequireRole({ roles, children }: { roles: Role[]; children: (me: MeResponse) => React.ReactNode }) {
  const { state } = useMe()
  if (state.status === 'loading') {
    return (
      <Page>
        <p className="text-fg-muted" aria-live="polite">
          Loading…
        </p>
      </Page>
    )
  }
  if (state.status === 'unavailable') {
    return (
      <Page>
        <div role="status" className="rounded-card bg-surface p-4">
          <p className="font-medium">{state.message}</p>
        </div>
      </Page>
    )
  }
  if (state.status === 'anonymous') return <Navigate to="/signin" replace />
  if (!roles.includes(state.me.profile.role)) return <Navigate to={homeFor(state.me.profile.role)} replace />
  return <>{children(state.me)}</>
}
