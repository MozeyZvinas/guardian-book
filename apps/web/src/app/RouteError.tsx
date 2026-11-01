import { Link } from 'react-router'
import { Page } from '../components/Page'

export function RouteError() {
  return (
    <Page>
      <h1 className="text-display font-semibold text-balance">Something went wrong.</h1>
      <p className="text-fg-muted">Reload the page to try again.</p>
      <p>
        <Link to="/">Back to the start</Link>
      </p>
    </Page>
  )
}
