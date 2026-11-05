import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { evidenceFileSchema, type EvidenceSuite } from '@guardian-book/shared'
import { HELD_OUT_SESSIONS } from '../corpus/catalogue.js'
import { assertOutsideRepo, corpusConfig, corpusDirs, repoRoot } from '../corpus/env.js'
import { createGateway } from '../gateway/gateway.js'
import { WORK_CHECK_PROMPT_VERSION } from '../gateway/prompts/workCheck.v1.js'
import { GUIDE_CHECK_PROMPT_VERSION, GUIDE_PROMPT_VERSION } from '../guide/prompt.v1.js'
import { logger } from '../logger.js'
import { loadCases, runCase, type EvalCaseResult } from './runner.js'
import { writeEvidence } from './summary.js'
import {
  figureFor,
  loadGuideCases,
  keepSelected,
  notYetRun,
  rescoreGuide,
  nscGuideSuite,
  nscWorkCheckSuite,
  runGuideCase,
  selectGuideCases,
  selectWorkCheckCases,
  sessionCasePattern,
  withNscSuites,
  type NscGuideResult,
} from './nsc.js'

/**
 * `pnpm eval:nsc` (brief B17 phase C): runs the held-out NSC suites written by
 * `pnpm corpus:extract` (`<CORPUS_DIR>/evals/held-out/`, outside the repo) and puts their
 * summary into `evals/results/latest.json` beside B08's suites. The raw per-case results
 * hold DBE text, so they stay in `<CORPUS_DIR>/evals/results/`, never in the repo.
 *
 * Options: `--session=2026-may_june` (default: the newest held-out session, D31),
 * `--sample=30` (changed answers; the unchanged memo working for the same questions runs
 * as the control), `--cap=10` (US dollars for phase C in all, across runs, from
 * `<CORPUS_DIR>/evals/spend.json`), `--concurrency=4`, `--only=guide|work_check`,
 * `--guide-from=<raw guide results>` and `--work-check-from=<raw work-check results>` (keep a
 * saved run's results and run only the cases it lacks; with none missing, the guide is simply
 * re-scored with the current comparison: no model call, nothing spent).
 */

interface Args {
  session: string
  sample: number
  cap: number
  concurrency: number
  only: 'guide' | 'work_check' | null
  guideFrom: string | null
  workCheckFrom: string | null
}

function parseArgs(argv: string[]): Args {
  const args: Args = { session: HELD_OUT_SESSIONS[0] ?? '2026-may_june', sample: 30, cap: 10, concurrency: 4, only: null, guideFrom: null, workCheckFrom: null }
  for (const arg of argv) {
    const [name, value = ''] = arg.split('=')
    if (name === '--session') args.session = value
    else if (name === '--sample') args.sample = Math.max(0, Number(value) || 0)
    else if (name === '--cap') args.cap = Math.max(0, Number(value) || 0)
    else if (name === '--concurrency') args.concurrency = Math.max(1, Number(value) || 1)
    else if (name === '--only' && (value === 'guide' || value === 'work_check')) args.only = value
    else if (name === '--guide-from' && value.length > 0) args.guideFrom = value
    else if (name === '--work-check-from' && value.length > 0) args.workCheckFrom = value
    else throw new Error(`unknown option ${arg}`)
  }
  return args
}

type SpendRow = { at: string; suite: string; cases: number; costUsd: number }

async function pool<T, R>(items: T[], size: number, worker: (item: T) => Promise<R | null>): Promise<R[]> {
  const results: Array<R | null> = new Array<R | null>(items.length).fill(null)
  let next = 0
  await Promise.all(
    Array.from({ length: Math.max(1, Math.min(size, items.length)) }, async () => {
      while (next < items.length) {
        const index = next
        next += 1
        results[index] = await worker(items[index] as T)
      }
    }),
  )
  return results.filter((result): result is R => result !== null)
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2))
  const config = corpusConfig()
  const gateway = createGateway({ config: config.meta, logger })
  if (!gateway.configured) throw new Error('the model gateway is not configured (META_API_KEY missing or the model refused)')
  const dirs = corpusDirs()
  assertOutsideRepo(dirs.root)
  const heldOutDir = path.join(dirs.evals, 'held-out')
  const resultsDir = path.join(dirs.evals, 'results')
  mkdirSync(resultsDir, { recursive: true })
  const ledger = path.join(dirs.evals, 'spend.json')
  const readLedger = (): SpendRow[] => (existsSync(ledger) ? (JSON.parse(readFileSync(ledger, 'utf8')) as SpendRow[]) : [])
  const spentBefore = readLedger().reduce((sum, row) => sum + row.costUsd, 0)
  let spent = 0
  const left = (): number => args.cap - spentBefore - spent
  console.log(`eval:nsc: session ${args.session}; model ${gateway.model}; phase C spent before $${spentBefore.toFixed(2)} of $${args.cap.toFixed(2)}`)

  const pattern = sessionCasePattern(args.session)
  const ranAt = new Date()
  const suites: EvidenceSuite[] = []
  const notYet: string[] = []
  const stopped: string[] = []
  const readSaved = <T,>(file: string): { ran_at: string; results: T[] } => JSON.parse(readFileSync(file, 'utf8')) as { ran_at: string; results: T[] }
  const writeRaw = (name: string, saved: { ran_at: string } | null, results: unknown[]): void => {
    const raw = { ran_at: saved?.ran_at ?? ranAt.toISOString(), ...(saved ? { merged_at: ranAt.toISOString() } : {}), model: gateway.model, results }
    writeFileSync(path.join(resultsDir, `${ranAt.toISOString().replace(/[:.]/g, '-')}-${name}.json`), `${JSON.stringify(raw, null, 2)}\n`)
  }
  const record = (suite: string, cases: number, costUsd: number): void => {
    writeFileSync(ledger, `${JSON.stringify([...readLedger(), { at: new Date().toISOString(), suite, cases, costUsd: Math.round(costUsd * 1e6) / 1e6 }], null, 2)}\n`)
  }

  if (args.only !== 'work_check') {
    const selection = selectGuideCases(await loadGuideCases(path.join(heldOutDir, 'guide')), pattern)
    console.log(`  guide: ${selection.cases.length} question(s), ${selection.withFigure} with a figure attached; left out ${selection.givenResult} that print their result`)
    const before = spent
    const saved = args.guideFrom ? readSaved<NscGuideResult>(args.guideFrom) : null
    const toRun = notYetRun(selection.cases, saved?.results ?? [])
    const fresh = await pool(toRun, args.concurrency, async (guide): Promise<NscGuideResult | null> => {
      if (left() <= 0.1) return null
      const result = await runGuideCase(guide, gateway, await figureFor(guide, heldOutDir))
      spent += result.cost_usd
      console.log(`    ${guide.id}: ${result.status} · ${result.reached === null ? 'no answer' : result.reached ? 'memo answer' : 'other answer'} · ${result.calls} call(s) · ${Math.round(result.latency_ms / 1000)} s · $${result.cost_usd.toFixed(4)}`)
      return result
    })
    const results = rescoreGuide(keepSelected(selection.cases, [...(saved?.results ?? []), ...fresh]))
    if (saved) console.log(`  guide: ${results.length - fresh.length} saved result(s) from ${saved.ran_at} re-scored, ${fresh.length} new`)
    record('nsc_guide', fresh.length, spent - before)
    if (results.length < selection.cases.length) stopped.push(`guide: ${selection.cases.length - results.length} question(s) not run (cost cap)`)
    writeRaw(`nsc-guide${saved ? '-merged' : ''}`, saved, results)
    const when = saved ? `${saved.ran_at}${fresh.length ? ` and ${ranAt.toISOString()}` : `, re-scored ${ranAt.toISOString()}`}` : ranAt.toISOString()
    const suite = nscGuideSuite(results, `pnpm eval:nsc · ${gateway.model} · ${GUIDE_PROMPT_VERSION} + ${GUIDE_CHECK_PROMPT_VERSION} · ${when}`)
    if (suite) suites.push(suite)
    notYet.push(
      `Held-out NSC guide: ${selection.withFigure} question(s) printed with a figure went in typed with the figure attached as a photo (the app takes typed text or a photo, not both); ${selection.givenResult} that ask to prove or show a printed result were left out.`,
    )
  }

  if (args.only !== 'guide') {
    const cases = selectWorkCheckCases(await loadCases(heldOutDir), pattern, args.sample)
    console.log(`  work check: ${cases.length} case(s)`)
    const before = spent
    const saved = args.workCheckFrom ? readSaved<EvalCaseResult>(args.workCheckFrom) : null
    const fresh = await pool(notYetRun(cases, saved?.results ?? []), args.concurrency, async (evalCase): Promise<EvalCaseResult | null> => {
      if (left() <= 0.05) return null
      const result = await runCase(evalCase, heldOutDir, gateway)
      spent += result.cost_usd
      console.log(`    ${result.id}: ${result.status} · total ${result.model_total ?? '-'} (expected ${result.expected_total}) · lost ${result.model_first_lost_step ?? '-'} (expected ${result.expected_first_lost_step ?? '-'}) · $${result.cost_usd.toFixed(4)}`)
      return result
    })
    const results = keepSelected(cases, [...(saved?.results ?? []), ...fresh])
    if (saved) console.log(`  work check: ${results.length - fresh.length} saved result(s) from ${saved.ran_at} kept, ${fresh.length} new`)
    record('nsc_work_check', fresh.length, spent - before)
    if (results.length < cases.length) stopped.push(`work check: ${cases.length - results.length} case(s) not run (cost cap)`)
    writeRaw(`nsc-work-check${saved ? '-merged' : ''}`, saved, results)
    const when = saved ? `${saved.ran_at}${fresh.length ? ` and ${ranAt.toISOString()}` : ''}` : ranAt.toISOString()
    const suite = nscWorkCheckSuite(results, `pnpm eval:nsc · ${gateway.model} · ${WORK_CHECK_PROMPT_VERSION} · ${when}`)
    if (suite) suites.push(suite)
  }

  notYet.push('Held-out NSC suites: the memo is the truth and the comparison is fixed; no teacher has scored these cases.')
  const latestPath = path.join(repoRoot, 'evals', 'results', 'latest.json')
  const existing = evidenceFileSchema.parse(JSON.parse(readFileSync(latestPath, 'utf8')))
  const keep = existing.suites.filter((suite) => suite.key.startsWith('nsc_') && !suites.some((next) => next.key === suite.key))
  const next = withNscSuites(existing, {
    suites: [...keep, ...suites],
    model: gateway.model,
    promptVersions: [GUIDE_PROMPT_VERSION, GUIDE_CHECK_PROMPT_VERSION],
    notYet: [...(args.only === 'work_check' ? existing.not_yet.filter((line) => line.startsWith('Held-out NSC guide:')) : []), ...notYet],
    generatedAt: ranAt,
  })
  await writeEvidence(next, latestPath)
  const total = readLedger().reduce((sum, row) => sum + row.costUsd, 0)
  for (const suite of suites) console.log(`  ${suite.key}: n=${suite.n} · ${suite.metric.label} ${suite.metric.ratio.n}/${suite.metric.ratio.d}`)
  for (const line of stopped) console.log(`  stopped: ${line}`)
  console.log(`eval:nsc: $${spent.toFixed(2)} this run · phase C $${total.toFixed(2)} of $${args.cap.toFixed(2)} · wrote ${path.relative(repoRoot, latestPath)}; raw results in ${resultsDir}`)
}

main().catch((err: unknown) => {
  console.error('eval:nsc failed:', err instanceof Error ? err.message : err)
  process.exit(1)
})
