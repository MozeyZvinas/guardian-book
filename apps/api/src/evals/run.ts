import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadConfig } from '../config.js'
import { createGateway } from '../gateway/gateway.js'
import { logger } from '../logger.js'
import { createMockGateway } from './mockGateway.js'
import { defaultPrivacyHarnessPath, readPrivacyHarness } from './privacyHarness.js'
import { loadCases, runEval } from './runner.js'
import { DEFAULT_DATASET_LABEL, buildEvidence, writeEvidence } from './summary.js'

/**
 * `pnpm eval:dev`: run the work check over every case in EVAL_DIR and write the results.
 *
 *   EVAL_DIR=/path/outside/the/repo pnpm eval:dev            # live, needs META_API_KEY
 *   EVAL_DIR=/path/outside/the/repo EVAL_MOCK=1 pnpm eval:dev # mocked model, no spend
 *
 * Two files go to EVAL_OUT_DIR (default `evals/results/` at the repo root): the raw
 * per-case results (git-ignored, never committed) and `latest.json`, the summary the proof
 * page reads (B08; committed when the planning session says so). Real case files are never
 * committed. Optional: EVAL_DATASET_LABEL (plain words: what the cases are and who scored
 * them), EVAL_HELD_OUT=1 (only for the frozen teacher-scored set), EVAL_NOT_YET (extra
 * "what doesn't work yet" lines, separated by ";"), EVAL_PRIVACY_FILE (the permission
 * harness output; default `evals/results/privacy-harness.json`, written by `pnpm test:integration`).
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
  const { results, filePath } = await runEval({
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

  const privacyPath = process.env['EVAL_PRIVACY_FILE'] ?? defaultPrivacyHarnessPath()
  const privacy = await readPrivacyHarness(privacyPath)
  if (!privacy) console.log(`no permission harness file at ${path.relative(process.cwd(), privacyPath)}: the privacy suite is left out (run pnpm test:integration first)`)
  const evidence = buildEvidence({
    results,
    privacy,
    datasetLabel: process.env['EVAL_DATASET_LABEL'] ?? DEFAULT_DATASET_LABEL,
    heldOut: process.env['EVAL_HELD_OUT'] === '1',
    notYet: (process.env['EVAL_NOT_YET'] ?? '')
      .split(';')
      .map((line) => line.trim())
      .filter((line) => line.length > 0),
  })
  const latestPath = path.join(outDir, 'latest.json')
  await writeEvidence(evidence, latestPath)
  console.log(`suites: ${evidence.suites.map((suite) => `${suite.key} n=${suite.n}`).join(', ')} · dataset: ${evidence.dataset.label}`)
  console.log(`wrote ${path.relative(process.cwd(), filePath)} (raw, git-ignored) and ${path.relative(process.cwd(), latestPath)} (the summary)`)
}

main().catch((err: unknown) => {
  console.error('eval:dev failed:', err instanceof Error ? err.message : err)
  process.exit(1)
})
