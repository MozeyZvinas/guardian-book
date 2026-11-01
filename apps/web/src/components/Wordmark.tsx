import { Link } from 'react-router'

/** Text wordmark for now; the Sentinel mark arrives with the brand assets. */
export function Wordmark() {
  return (
    <Link to="/" className="inline-flex items-baseline gap-1 text-fg no-underline">
      <span className="text-xl font-semibold tracking-tight">Guardian</span>
      <span className="text-xl font-light tracking-tight">Book</span>
    </Link>
  )
}
