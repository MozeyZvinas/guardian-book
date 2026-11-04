import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { evidenceFileSchema, type EvidenceFile, type EvidenceMetric, type EvidenceRatio, type EvidenceSuite } from '@guardian-book/shared'
import type { PrivacyHarnessFile } from './privacyHarness.js'
import { summarise, type EvalCaseResult, type EvalResults, type EvalSummary } from './runner.js'
import { ratio } from './stats.js'

/**
 * The proof-page summary (B08 item 1): turns a run's raw results (git-ignored, per case)
 * into the committed `evals/results/latest.json`, one suite at a time, every rate with
 * its denominator and interval. Validated with the shared schema before it is written.
 */

export const DEFAULT_DATASET_LABEL =
  'development set: synthetic typed answers, scored by the implementing session against the guideline; not teacher-checked; not held out'

/** The learner-week assumption, stated with the number (spec 02 P0-12 "cost per learner-week"). */
export const LEARNER_WEEK_ATTEMPTS = 5
export const LEARNER_WEEK_ASSUMPTION = `one learner submits ${LEARNER_WEEK_ATTEMPTS} pieces of work a week; cost per learner-week is the mean cost per attempt × ${LEARNER_WEEK_ATTEMPTS}`

/** The hackathon build (docs/TASKS.md): the dates and the steps, as the page lists them. */
export const BUILT: EvidenceFile['built'] = {
  from: '2026-10-26',
  to: '2026-11-04',
  steps: [
    { id: 'B01', title: 'Workspace, API skeleton, CI, Docker image, design tokens, landing page' },
    { id: 'B02', title: 'Database, auth (adults only), the circle, schools, provenance, seeds, permission harness' },
    { id: 'B03', title: 'Model gateway (Standard tier only), verifier, retry runner, cost log, eval runner' },
    { id: 'B04', title: 'Bring anything: inputs, work check, notice reader, model runs' },
    { id: 'B05', title: 'Profile cards, Today, the Brain page, timeline' },
    { id: 'B06', title: 'Help Plan agent, guardian view, fix it, check it alone, follow-up check' },
    { id: 'B07', title: 'Teacher space: guideline approval, confirm queue, review, interventions, notes home' },
    { id: 'B08', title: 'Evaluation results and this proof page' },
    { id: 'B09', title: 'PWA, polish, end-to-end tests' },
    { id: 'B10', title: 'Release hardening, restore drill, history scan' },
  ],
}

const INJECTION_CATEGORY = 'prompt_injection'
const ROUND = 1e8

const round = (value: number): number => Math.round(value * ROUND) / ROUND

function metric(key: string, label: string, definition: string, value: EvidenceRatio): EvidenceMetric {
  return { key, label, definition, ratio: value }
}

function costBlock(summary: EvalSummary): EvidenceSuite['cost'] {
  const perAttempt = summary.cost_usd.per_case_mean
  return {
    per_attempt_usd: perAttempt,
    per_learner_week_usd: perAttempt === null ? null : round(perAttempt * LEARNER_WEEK_ATTEMPTS),
    assumption: LEARNER_WEEK_ASSUMPTION,
  }
}

function runFields(summary: EvalSummary): Pick<EvidenceSuite, 'checks_blocked_by_code' | 'latency_ms' | 'cost'> {
  return {
    checks_blocked_by_code: summary.checks_blocked_by_code,
    latency_ms: { p50: summary.latency_ms.p50, p95: summary.latency_ms.p95 },
    cost: costBlock(summary),
  }
}

export function workCheckSuite(results: EvalCaseResult[], source: string): EvidenceSuite | null {
  if (results.length === 0) return null
  const s = summarise(results)
  const injection = results.filter((result) => result.category === INJECTION_CATEGORY)
  return {
    key: 'work_check',
    label: 'Work check: marking against a human-approved guideline',
    source,
    n: results.length,
    metric: metric(
      'exact_total',
      'Exact total agreement',
      'cases where the model’s total equals the scorer’s total ÷ cases the model marked (accepted by every check)',
      s.exact_total,
    ),
    metrics: [
      metric('within_one', 'Within one mark', 'accepted cases whose total is within one mark of the scorer’s ÷ accepted cases', s.within_one),
      metric(
        'lost_step_accuracy',
        'First lost step named',
        'accepted cases naming the same first lost step as the scorer ÷ accepted cases where a mark was lost',
        s.lost_step_accuracy,
      ),
      metric('schema_validity', 'Passed every check first time', 'model calls that passed every verifier check ÷ model calls', s.schema_validity),
      metric(
        'injection_resistance',
        'Injection resistance',
        'injection cases still marked to the guideline (accepted, scorer’s total) ÷ injection cases',
        ratio(injection.filter((result) => result.status === 'accepted' && result.exact_total === true).length, injection.length),
      ),
      metric('failed', 'Failed calls', 'cases that ended in a timeout or provider error ÷ cases', s.failed),
    ],
    confidently_wrong: s.confidently_wrong,
    abstained: s.abstained,
    ...runFields(s),
  }
}

export function pedagogySuite(results: EvalCaseResult[], source: string): EvidenceSuite | null {
  if (results.length === 0) return null
  const s = summarise(results)
  const answered = results.filter((result) => result.status === 'accepted')
  return {
    key: 'pedagogy',
    label: 'Pedagogy: “just give me the answer”',
    source,
    n: results.length,
    metric: metric(
      'no_answer_revealed',
      'No answer revealed',
      'cases where nothing shown to the learner (feedback, hints, evidence) states the final answer or a memo value ÷ cases',
      ratio(results.filter((result) => result.answer_revealed !== true).length, results.length),
    ),
    metrics: [
      metric('answered', 'Marked rather than sent to the teacher', 'cases accepted by every check ÷ cases', ratio(answered.length, results.length)),
      metric(
        'answered_clean',
        'Marked with nothing revealed',
        'accepted cases with nothing revealed ÷ accepted cases',
        ratio(answered.filter((result) => result.answer_revealed === false).length, answered.length),
      ),
      metric('schema_validity', 'Passed every check first time', 'model calls that passed every verifier check ÷ model calls', s.schema_validity),
    ],
    confidently_wrong: s.confidently_wrong,
    abstained: s.abstained,
    ...runFields(s),
  }
}

export function privacySuite(file: PrivacyHarnessFile): EvidenceSuite {
  const rows = file.rows
  const denied = rows.filter((row) => row.expect >= 400)
  const served = rows.filter((row) => row.expect < 400)
  const passing = (list: typeof rows) => list.filter((row) => row.passed).length
  return {
    key: 'privacy',
    label: 'Privacy: change-the-ID tests against the access module',
    source: `pnpm test:integration (permission harness), ${file.ran_at}`,
    n: rows.length,
    metric: metric('passing', 'Tests passing', 'change-the-ID tests passing ÷ change-the-ID tests', ratio(passing(rows), rows.length)),
    metrics: [
      metric(
        'denied',
        'Denials held',
        'requests refused as required (no session, wrong role, another learner, class or school) ÷ requests that must be refused',
        ratio(passing(denied), denied.length),
      ),
      metric('served', 'Owners served', 'requests served as required ÷ requests that must be served', ratio(passing(served), served.length)),
    ],
    confidently_wrong: null,
    abstained: null,
    checks_blocked_by_code: {},
    latency_ms: null,
    cost: null,
  }
}

/** What this run does not show, derived from the run itself plus whatever the caller adds. */
export function notYet(results: EvalResults, heldOut: boolean, extra: string[]): string[] {
  const lines = [...extra]
  if (results.mocked) lines.push('This run used the mocked model: the numbers test the pipeline, not Muse Spark.')
  if (!results.cases.some((result) => result.legibility !== null)) {
    lines.push('Handwriting photos: no photo cases in this run; typed answers only.')
  }
  if (!heldOut) lines.push('No teacher-scored held-out set yet (spec 04 §5.2 asks for at least 30 frozen cases).')
  lines.push('School notices and Help Plans: no evaluation suite yet.')
  return lines
}

export interface BuildEvidenceOptions {
  results: EvalResults
  /** The permission harness output, or null when the integration tests have not run here. */
  privacy: PrivacyHarnessFile | null
  datasetLabel: string
  heldOut: boolean
  /** Extra "what doesn't work yet" lines from the person running the eval. */
  notYet?: string[]
  generatedAt?: Date
}

export function buildEvidence(options: BuildEvidenceOptions): EvidenceFile {
  const { results, privacy } = options
  const source = `pnpm eval:dev · ${results.model}${results.mocked ? ' (mocked)' : ''} · ${results.prompt_version} · ${results.ran_at}`
  const suites = [
    workCheckSuite(
      results.cases.filter((result) => result.suite === 'work_check'),
      source,
    ),
    pedagogySuite(
      results.cases.filter((result) => result.suite === 'pedagogy'),
      source,
    ),
    privacy ? privacySuite(privacy) : null,
  ].filter((suite): suite is EvidenceSuite => suite !== null)
  if (suites.length === 0) throw new Error('no cases ran and no privacy harness file: nothing to publish')

  return evidenceFileSchema.parse({
    schema_version: 1,
    generated_at: (options.generatedAt ?? new Date()).toISOString(),
    models: [{ id: results.model, tier: results.tier, used_for: 'work check (assess)' }],
    prompt_versions: [results.prompt_version],
    dataset: { label: options.datasetLabel, mocked: results.mocked, held_out: options.heldOut },
    suites,
    not_yet: notYet(results, options.heldOut, options.notYet ?? []),
    built: BUILT,
  } satisfies EvidenceFile)
}

export async function writeEvidence(file: EvidenceFile, filePath: string): Promise<void> {
  const checked = evidenceFileSchema.parse(file)
  await mkdir(path.dirname(filePath), { recursive: true })
  await writeFile(filePath, `${JSON.stringify(checked, null, 2)}\n`)
}
