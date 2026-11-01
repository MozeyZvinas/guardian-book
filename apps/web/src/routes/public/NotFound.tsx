import { Link } from 'react-router'
import { Page } from '../../components/Page'

export function NotFound() {
  return (
    <Page>
      <h1 className="text-display font-semibold text-balance">That page does not exist.</h1>
      <p>
        <Link to="/">Back to the start</Link>
      </p>
    </Page>
  )
}
