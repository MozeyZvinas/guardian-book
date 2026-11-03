import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadConfig } from '../config.js'
import { createGateway } from '../gateway/gateway.js'
import { logger } from '../logger.js'
import { loadCases } from './runner.js'
import { createMockGateway } from './mockGateway.js'
import { runEval } from './runner.js'

/**
 * `pnpm eval:dev`: run the work check over every case in EVAL_DIR and write the results.
 *
 *   EVAL_DIR=/path/outside/the/repo pnpm eval:dev            # live, needs META_API_KEY
 *   EVAL_DIR=/path/outside/the/repo EVAL_MOCK=1 pnpm eval:dev # mocked model, no spend
 *
 * Results go to EVAL_OUT_DIR (default `evals/results/` at the repo root, git-ignored).
 * Case files are never committed; result files only when the planning session says so.
 */

const here = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(here, '../../../..')

function loadDotEnv(): void {
  try {
    process.loadEnvFile(path.join(repoRoot, '.env'))
  } catch {
    // No .env: fine, the environment may already be set (or this is a mocked run).
  }
}

async function main(): Promise<void> {
  loadDotEnv()
  const evalDir = process.env['EVAL_DIR']
  if (!evalDir) {
    console.error('eval:dev: set EVAL_DIR to a directory of case files outside the repo.')
    process.exit(2)
  }
  const outDir = process.env['EVAL_OUT_DIR'] ?? path.join(repoRoot, 'evals', 'results')
  const mocked = process.env['EVAL_MOCK'] === '1'
  const config = loadConfig()

  const cases = await loadCases(evalDir)
  const gateway = mocked ? createMockGateway(config.meta, logger, cases) : createGateway({ config: config.meta, logger })
  if (!mocked && !gateway.configured) {
    console.error('eval:dev: the model gateway is not configured (META_API_KEY missing or the model refused). Use EVAL_MOCK=1 for a dry run.')
    process.exit(2)
  }

  console.log(`eval:dev: ${cases.length} case(s) from ${evalDir}; model ${gateway.model}${mocked ? ' (mocked)' : ''}`)
  const { results, filePath, latestPath } = await runEval({
    evalDir,
    outDir,
    gateway,
    mocked,
    onCase: (result) => {
      console.log(`  ${result.id}: ${result.status} · total ${result.model_total ?? '-'} (expected ${result.expected_total}) · ${result.calls} call(s) · ${result.latency_ms} ms · $${result.cost_usd.toFixed(5)}`)
    },
  })
  const s = results.summary
  const show = (label: string, r: { n: number; d: number }): string => `${label} ${r.n}/${r.d}`
  console.log(
    [
      show('schema validity', s.schema_validity),
      show('exact total', s.exact_total),
      show('within one', s.within_one),
      show('lost-step accuracy', s.lost_step_accuracy),
      show('confidently wrong', s.confidently_wrong),
      show('abstained', s.abstained),
      show('failed', s.failed),
    ].join(' · '),
  )
  console.log(`checks blocked: ${JSON.stringify(s.checks_blocked_by_code)} · latency p50 ${s.latency_ms.p50} ms, p95 ${s.latency_ms.p95} ms · cost $${s.cost_usd.total}`)
  console.log(`wrote ${path.relative(process.cwd(), filePath)} and ${path.relative(process.cwd(), latestPath)}`)
}

main().catch((err: unknown) => {
  console.error('eval:dev failed:', err instanceof Error ? err.message : err)
  process.exit(1)
})
