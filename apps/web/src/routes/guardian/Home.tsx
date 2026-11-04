import { Navigate } from 'react-router'
import { RequireRole } from '../../app/RequireRole'

/** `/guardian`: the first linked learner's week, or G0 Link when nobody is linked yet. */
export function GuardianHome() {
  return (
    <RequireRole roles={['guardian']}>
      {(me) => {
        const first = me.learners[0]
        return <Navigate to={first ? `/guardian/learners/${first.learnerId}` : '/guardian/link'} replace />
      }}
    </RequireRole>
  )
}
