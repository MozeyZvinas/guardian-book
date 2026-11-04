import { readFile, readdir, mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import type { WorkCheckOutput } from '@guardian-book/shared'
import type { Gateway } from '../gateway/gateway.js'
import { WORK_CHECK_MAX_TOKENS, WORK_CHECK_PROMPT_VERSION, WORK_CHECK_TIMEOUT_MS, buildWorkCheckSystem, buildWorkCheckUser, workCheckContext, type WorkCheckPromptInput } from '../gateway/prompts/workCheck.v1.js'
import { verifiedCall, type VerifiedRun } from '../gateway/verifiedCall.js'
import type { CheckCode } from '../verify/types.js'
import { evalCaseSchema, type EvalCase, type EvalSuite } from './cases.js'
import { answerRevealed } from './pedagogy.js'
import { percentile, ratio, type Ratio } from './stats.js'

/**
 * The dev eval runner (spec 04 §5; B03 item 6): reads cases from a directory, runs
 * `verifiedCall` for `assess` on each, and writes a raw results file (git-ignored: it holds
 * per-case output) with a summary where every rate has its denominator. The committed
 * `latest.json` is built from it by `summary.ts` (B08).
 */

export interface EvalCaseResult {
  id: string
  suite: EvalSuite
  category: string | null
  legibility: number | null
  status: 'accepted' | 'exhausted' | 'failed'
  expected_total: number
  model_total: number | null
  exact_total: boolean | null
  within_one: boolean | null
  expected_first_lost_step: string | null
  model_first_lost_step: string | null
  lost_step_match: boolean | null
  all_steps_high_confidence: boolean | null
  /** Pedagogy cases only: true when something shown to the learner states the answer; null elsewhere. */
  answer_revealed: boolean | null
  calls: number
  cost_usd: number
  latency_ms: number
  output: WorkCheckOutput | null
  runs: VerifiedRun[]
  error: { code: string; message: string } | null
}

export interface EvalSummary {
  cases: number
  calls: number
  /** All checks passed ÷ calls (spec 04 §5.3 "Schema validity"). */
  schema_validity: Ratio
  /** Exact total ÷ accepted ("proposed") cases. */
  exact_total: Ratio
  /** |error| ≤ 1 ÷ accepted cases. */
  within_one: Ratio
  /** Same first lost step ÷ cases with a lost mark that were accepted. */
  lost_step_accuracy: Ratio
  /** Wrong total at all-high confidence ÷ accepted cases at all-high confidence. */
  confidently_wrong: Ratio
  /** Exhausted ÷ cases. */
  abstained: Ratio
  /** Correct abstentions: exhausted cases that were not fully correct per the teacher ÷ exhausted. */
  abstained_on_imperfect: Ratio
  /** Failed (timeout, provider) ÷ cases. */
  failed: Ratio
  /** Failed checks by code across every call. */
  checks_blocked_by_code: Record<string, number>
  latency_ms: { p50: number; p95: number; per_call: number[] }
  cost_usd: { total: number; per_case_mean: number | null }
}

export interface EvalResults {
  ran_at: string
  model: string
  tier: 'standard'
  prompt_version: typeof WORK_CHECK_PROMPT_VERSION
  eval_dir_name: string
  mocked: boolean
  summary: EvalSummary
  cases: EvalCaseResult[]
}

export interface RunEvalOptions {
  evalDir: string
  outDir: string
  gateway: Gateway
  mocked: boolean
  now?: () => Date
  /** Called per case as it finishes; for progress output. */
  onCase?: (result: EvalCaseResult) => void
}

export async function loadCases(evalDir: string): Promise<EvalCase[]> {
  const names = (await readdir(evalDir)).filter((name) => name.endsWith('.json')).sort()
  const cases: EvalCase[] = []
  for (const name of names) {
    const raw: unknown = JSON.parse(await readFile(path.join(evalDir, name), 'utf8'))
    const parsed = evalCaseSchema.safeParse(raw)
    if (!parsed.success) {
      const issues = parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; ')
      throw new Error(`eval case ${name} is invalid: ${issues}`)
    }
    cases.push(parsed.data)
  }
  return cases
}

async function promptInputFor(evalCase: EvalCase, evalDir: string): Promise<WorkCheckPromptInput> {
  const answer: WorkCheckPromptInput['answer'] =
    evalCase.answer.kind === 'typed'
      ? { kind: 'typed', text: evalCase.answer.text }
      : {
          kind: 'photo',
          image: { kind: 'base64', mediaType: evalCase.answer.media_type, data: (await readFile(path.resolve(evalDir, evalCase.answer.image_path))).toString('base64') },
        }
  return { item: evalCase.item, guideline: evalCase.guideline, answer, mode: evalCase.mode, final_answer: evalCase.final_answer }
}

export function firstLostStep(output: WorkCheckOutput, guidelineOrder: string[]): string | null {
  const byId = new Map(output.steps.map((step) => [step.step_id, step]))
  for (const id of guidelineOrder) {
    const step = byId.get(id)
    if (step && step.awarded < step.available) return id
  }
  return null
}

export async function runCase(evalCase: EvalCase, evalDir: string, gateway: Gateway): Promise<EvalCaseResult> {
  const input = await promptInputFor(evalCase, evalDir)
  const user = buildWorkCheckUser(input)
  const context = workCheckContext(input)
  const result = await verifiedCall({
    gateway,
    purpose: 'assess',
    promptVersion: WORK_CHECK_PROMPT_VERSION,
    system: buildWorkCheckSystem(),
    user: user.text,
    images: user.images,
    context,
    maxTokens: WORK_CHECK_MAX_TOKENS,
    timeoutMs: WORK_CHECK_TIMEOUT_MS,
  })
  const order = [...evalCase.guideline].sort((a, b) => a.step_no - b.step_no).map((step) => step.step_id)
  const output = result.output
  const modelTotal = output?.total ?? null
  const modelFirstLost = output ? firstLostStep(output, order) : null
  const hasLostMark = evalCase.expected.first_lost_step !== null
  return {
    id: evalCase.id,
    suite: evalCase.suite,
    category: evalCase.category,
    legibility: evalCase.legibility,
    status: result.status,
    expected_total: evalCase.expected.total,
    model_total: modelTotal,
    exact_total: modelTotal === null ? null : modelTotal === evalCase.expected.total,
    within_one: modelTotal === null ? null : Math.abs(modelTotal - evalCase.expected.total) <= 1,
    expected_first_lost_step: evalCase.expected.first_lost_step,
    model_first_lost_step: modelFirstLost,
    lost_step_match: output && hasLostMark ? modelFirstLost === evalCase.expected.first_lost_step : null,
    all_steps_high_confidence: output ? output.steps.every((step) => step.confidence === 'high') : null,
    answer_revealed: evalCase.suite === 'pedagogy' && output ? answerRevealed(output, context) : null,
    calls: result.runs.length,
    cost_usd: result.totalCostUsd,
    latency_ms: result.totalLatencyMs,
    output,
    runs: result.runs,
    error: result.error ? { code: result.error.code, message: result.error.message } : null,
  }
}

export function summarise(results: EvalCaseResult[]): EvalSummary {
  const runs = results.flatMap((result) => result.runs)
  const calls = runs.filter((run) => run.status !== 'failed')
  const accepted = results.filter((result) => result.status === 'accepted')
  const exhausted = results.filter((result) => result.status === 'exhausted')
  const highConfidence = accepted.filter((result) => result.all_steps_high_confidence === true)
  const withLostMark = accepted.filter((result) => result.expected_first_lost_step !== null)
  const blocked: Record<string, number> = {}
  for (const run of runs) {
    for (const check of run.checks) {
      if (!check.passed) blocked[check.code] = (blocked[check.code as CheckCode] ?? 0) + 1
    }
  }
  const latencies = calls.map((run) => run.latencyMs)
  const totalCost = Math.round(results.reduce((acc, result) => acc + result.cost_usd, 0) * 1e8) / 1e8
  return {
    cases: results.length,
    calls: runs.length,
    schema_validity: ratio(calls.filter((run) => run.checks.every((check) => check.passed)).length, calls.length),
    exact_total: ratio(accepted.filter((result) => result.exact_total === true).length, accepted.length),
    within_one: ratio(accepted.filter((result) => result.within_one === true).length, accepted.length),
    lost_step_accuracy: ratio(withLostMark.filter((result) => result.lost_step_match === true).length, withLostMark.length),
    confidently_wrong: ratio(highConfidence.filter((result) => result.exact_total === false).length, highConfidence.length),
    abstained: ratio(exhausted.length, results.length),
    abstained_on_imperfect: ratio(exhausted.filter((result) => result.expected_first_lost_step !== null).length, exhausted.length),
    failed: ratio(results.filter((result) => result.status === 'failed').length, results.length),
    checks_blocked_by_code: blocked,
    latency_ms: { p50: percentile(latencies, 50), p95: percentile(latencies, 95), per_call: latencies },
    cost_usd: { total: totalCost, per_case_mean: results.length > 0 ? Math.round((totalCost / results.length) * 1e8) / 1e8 : null },
  }
}

export async function runEval(options: RunEvalOptions): Promise<{ results: EvalResults; filePath: string }> {
  const now = options.now ?? (() => new Date())
  const cases = await loadCases(options.evalDir)
  const caseResults: EvalCaseResult[] = []
  for (const evalCase of cases) {
    const result = await runCase(evalCase, options.evalDir, options.gateway)
    caseResults.push(result)
    options.onCase?.(result)
  }
  const ranAt = now()
  const results: EvalResults = {
    ran_at: ranAt.toISOString(),
    model: options.gateway.model,
    tier: 'standard',
    prompt_version: WORK_CHECK_PROMPT_VERSION,
    eval_dir_name: path.basename(options.evalDir),
    mocked: options.mocked,
    summary: summarise(caseResults),
    cases: caseResults,
  }
  await mkdir(options.outDir, { recursive: true })
  const stamp = ranAt.toISOString().replace(/[:.]/g, '-')
  const filePath = path.join(options.outDir, `${stamp}-${options.gateway.model}${options.mocked ? '-mock' : ''}.json`)
  await writeFile(filePath, `${JSON.stringify(results, null, 2)}\n`)
  return { results, filePath }
}
