import { Link } from 'react-router'
import { Page } from '../../components/Page'
import { StatusLegend } from '../../components/StatusLegend'

/** P1 · Landing (spec 05 §4.1), B01 slice: wordmark, headline, status legend, evidence link. */
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
      <StatusLegend />
    </Page>
  )
}
