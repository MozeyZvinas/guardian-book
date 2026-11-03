import { Link } from 'react-router'
import { Page } from '../../components/Page'
import { StatusLegend } from '../../components/StatusLegend'

const DOORS = [
  { role: 'learner', label: 'I’m a learner' },
  { role: 'guardian', label: 'I’m a parent' },
  { role: 'teacher', label: 'I’m a teacher' },
] as const

/**
 * P1 · Landing (spec 05 §4.1). B01 gave the headline and the legend; B02 adds the three
 * doors (the only pink elements) and "Sign in", so an account is reachable from a phone.
 */
export function Landing() {
  return (
    <Page
      footer={
        <p>
          <Link to="/evidence">Evaluation results</Link>
        </p>
      }
    >
      <h1 className="text-display font-semibold text-balance">
        Every learner understood. Every next step clearer.
      </h1>
      <p className="text-fg-muted">
        A free learning app for high-school learners that shows them exactly where they’re stuck, and tells their
        parent and teacher how to help.
      </p>
      <nav aria-label="Choose your door" className="flex flex-col gap-3">
        {DOORS.map((door) => (
          <Link
            key={door.role}
            to={`/signup?role=${door.role}`}
            className="inline-flex min-h-12 items-center justify-center rounded-card bg-action px-5 text-lg font-medium text-ground no-underline"
          >
            {door.label}
          </Link>
        ))}
        <p className="text-fg-muted">
          Already here?{' '}
          <Link to="/signin" className="text-fg underline">
            Sign in
          </Link>
        </p>
      </nav>
      <StatusLegend />
    </Page>
  )
}
