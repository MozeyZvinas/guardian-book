import { Link } from 'react-router'
import { Page } from '../../components/Page'
import { StatusChip } from '../../components/StatusChip'

/** P4 · Proof page placeholder. The real page reads evals/results/latest.json (B08). */
export function Evidence() {
  return (
    <Page
      footer={
        <p>
          <Link to="/">Back to the start</Link>
        </p>
      }
    >
      <div className="flex items-center gap-3">
        <h1 className="text-display font-semibold text-balance">Evidence</h1>
        <StatusChip status="PLANNED" />
      </div>
      <p className="text-fg-muted">Evaluation results appear here after the first run.</p>
    </Page>
  )
}
