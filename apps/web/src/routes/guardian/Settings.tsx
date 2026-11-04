import { Link } from 'react-router'
import type { MeResponse } from '@guardian-book/shared'
import { RequireRole } from '../../app/RequireRole'
import { Card } from '../../components/Form'
import { SignOutButton } from '../../components/SignOutButton'
import { GuardianShell } from './GuardianShell'

/** G4 · Settings (spec 05 §4.3): linked learners, the transparency list, sign out. */
export function GuardianSettings() {
  return <RequireRole roles={['guardian']}>{(me) => <SettingsScreen me={me} />}</RequireRole>
}

function SettingsScreen({ me }: { me: MeResponse }) {
  return (
    <GuardianShell me={me}>
      <h1 className="text-display font-semibold text-balance">Settings</h1>
      <Card title="Linked learners">
        {me.learners.length > 0 ? (
          <ul className="m-0 flex list-none flex-col gap-1 p-0">
            {me.learners.map((learner) => (
              <li key={learner.learnerId}>
                <Link to={`/guardian/learners/${learner.learnerId}`}>{learner.nickname}</Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="m-0 text-sm text-fg-muted">Nobody yet.</p>
        )}
        <p className="m-0 text-sm">
          <Link to="/guardian/link">Enter a code</Link> to link another learner. A learner can unlink you any time from their Me page.
        </p>
      </Card>
      <Card title="What you can see">
        <ul className="m-0 flex list-disc flex-col gap-1 pl-5">
          <li>How much they practised: days, pieces of work, topics.</li>
          <li>What is coming up: confirmed dates only.</li>
          <li>The one topic they are stuck on, in plain words, and one thing to do.</li>
          <li>Notes and messages their teacher approved, labelled “Teacher-reviewed” or with the teacher’s name.</li>
          <li>From their cards: what they want to do one day, and their subjects.</li>
        </ul>
      </Card>
      <Card title="What you can’t see">
        <p className="m-0 text-sm text-fg-muted">Their work, their answers, their photos, their marks on a page, or the words they typed about themselves. Ever.</p>
      </Card>
      <div>
        <SignOutButton />
      </div>
    </GuardianShell>
  )
}
