import { readFile, readdir } from 'node:fs/promises'
import path from 'node:path'
import type { EvidenceFile, EvidenceMetric, EvidenceRatio, EvidenceSuite, GuideOutput } from '@guardian-book/shared'
import type { Gateway } from '../gateway/gateway.js'
import type { ImageInput } from '../gateway/transport.js'
import { PromptSafetyError } from '../gateway/promptSafety.js'
import { verifiedCall, type VerifiedRun } from '../gateway/verifiedCall.js'
import { GUIDE_CHECK_PROMPT_VERSION, GUIDE_MAX_TOKENS, GUIDE_PROMPT_VERSION, GUIDE_TIMEOUT_MS, buildGuideSystem, buildGuideUser } from '../guide/prompt.v1.js'
import { chooseRead, decideGuide } from '../guide/service.js'
import type { CheckCode } from '../verify/types.js'
import { normaliseAnswer } from '../verify/checks/guide.js'
import type { EvalCase } from './cases.js'
import { guideCaseSchema, type GuideCase } from './guideCases.js'
import { summarise, type EvalCaseResult } from './runner.js'
import { percentile, ratio } from './stats.js'

/**
 * Phase C of brief B17: measured on the held-out NSC session (D31), with the official memo
 * as truth. Two suites go into `evals/results/latest.json` beside B08's development suites,
 * each with its own dataset label:
 *
 * - `nsc_guide`: B15's guide (two independent reads, as the app runs it) on each question
 *   typed in; does the answer it shows match the memo's final answer? A question printed
 *   with a figure goes in typed with the figure's crop attached, the stand-in for a learner's
 *   photo (the app itself takes typed text or a photo); the suite reports both kinds apart.
 * - `nsc_work_check`: the work check on the memo's own working with the final step's value
 *   changed; does it name that step as the first one lost? The unchanged memo working is
 *   the control (full marks expected).
 *
 * The comparison of answers is fixed and deterministic (`answersMatch`), so a correct
 * answer written in another form counts as a miss: the published rate can only understate.
 */

export const NSC_DATASET_LABEL = 'held-out NSC questions (newest session), memos as truth'
export const PERTURBED_CATEGORY = 'memo_perturbed_final_step'
export const CONTROL_CATEGORY = 'memo_model_answer'
export const NSC_LEARNER_WEEK = 5

// ── comparing a final answer with the memo's ─────────────────────────────────────────────

/**
 * Notation that differs between the memo and the guide without changing the answer: the
 * NSC's decimal comma ("2,5"), "≈" for "=", degree signs, a hat or bar on a name (ŷ), and
 * percent signs. Set after a first look at the 4 Nov misses; general rules, not per answer.
 */
export function notation(text: string): string {
  return text
    .replace(/(\d),(\d)/g, '$1.$2')
    .replace(/\\approx|≈/g, '=')
    .replace(/\^\s*\{?\\circ\}?|\\circ|°/g, '')
    .replace(/\\(?:hat|bar|overline)\s*\{([^{}]*)\}/g, '$1')
    .replace(/\\%|%/g, '')
}

/** "x=3" → "3", "f(x)=2x" → "2x", "=41" → "41": the value without the name it is assigned to. */
function withoutAssignment(part: string): string {
  return part.replace(/^[a-z][a-z0-9_']*(?:\([a-z0-9]*\))?=/i, '').replace(/^=/, '')
}

/** "±3" stands for two answers. */
function expandPlusMinus(part: string): string[] {
  return part.startsWith('±') ? [part.slice(1), `-${part.slice(1)}`] : [part]
}

function valuesOf(text: string): string[] {
  const parts = normaliseAnswer(notation(text))
    .split(',')
    .filter((part) => part.length > 0)
    .flatMap((part) => expandPlusMinus(withoutAssignment(part)))
  return [...new Set(parts)].sort()
}

/** A plain number from a part, units and a leading R (rand) dropped; null when it is not one. */
function numberOf(part: string): number | null {
  const cleaned = part
    .replace(/^r(?=-?\d)/i, '')
    .replace(/(?:°|\^circ|circ|degrees?|%|units?|cm\^?2?|mm|km|m\^?2?)$/i, '')
    .replace(/^\((-?[\d.]+)\)$/, '$1')
  return /^-?\d+(?:\.\d+)?$/.test(cleaned) ? Number(cleaned) : null
}

/**
 * Whether the guide's final answer is the memo's: the same values after `notation` and
 * B15's `normaliseAnswer` (the rule the app uses to decide two reads agree), with
 * assignments ("x =") dropped and ± expanded, or the same numbers within rounding (0.5%, at
 * least 0.01).
 */
export function answersMatch(memo: string, guide: string): boolean {
  const expected = valuesOf(memo)
  const actual = valuesOf(guide)
  if (expected.length === 0 || actual.length === 0) return false
  if (expected.join(',') === actual.join(',')) return true
  if (expected.length !== actual.length) return false
  const left = expected.map(numberOf)
  const right = actual.map(numberOf)
  if (left.some((value) => value === null) || right.some((value) => value === null)) return false
  const a = (left as number[]).sort((x, y) => x - y)
  const b = (right as number[]).sort((x, y) => x - y)
  return a.every((value, index) => Math.abs(value - (b[index] ?? Number.NaN)) <= Math.max(0.01, Math.abs(value) * 0.005))
}

// ── choosing the cases ───────────────────────────────────────────────────────────────────

/** `nsc-maths-p1-2026-jun-q…` for the session key `2026-may_june`. */
export function sessionCasePattern(sessionKey: string): RegExp {
  const [year, session] = sessionKey.split('-')
  const short = session === 'may_june' ? 'jun' : session === 'november' ? 'nov' : 'mar'
  return new RegExp(`^nsc-maths-p\\d-${year}-${short}-q`)
}

/** FNV-1a: a stable order for sampling, the same on every run. */
function stableHash(text: string): number {
  let hash = 0x811c9dc5
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return hash
}

export function stableSample<T>(items: T[], size: number, keyOf: (item: T) => string): T[] {
  return [...items].sort((a, b) => stableHash(keyOf(a)) - stableHash(keyOf(b)) || keyOf(a).localeCompare(keyOf(b))).slice(0, Math.max(0, size))
}

/** A question that asks to prove or show a given result prints its answer: it says nothing about reaching it. */
export const GIVEN_RESULT = /\b(?:prove|show that|verify that|show, without|hence show)\b/i

export interface GuideSelection {
  cases: GuideCase[]
  /** Of `cases`, how many carry a figure. */
  withFigure: number
  /** Left out: they ask to prove or show a result the question prints. */
  givenResult: number
}

export function selectGuideCases(all: GuideCase[], pattern: RegExp): GuideSelection {
  const inSession = all.filter((guide) => pattern.test(guide.item.slug))
  const cases = inSession.filter((guide) => !GIVEN_RESULT.test(guide.item.prompt_md))
  return { cases, withFigure: cases.filter((guide) => guide.diagram_path !== null).length, givenResult: inSession.length - cases.length }
}

/** The figure's crop for a case, read relative to the eval directory; null without one. */
export async function figureFor(guide: GuideCase, evalDir: string): Promise<ImageInput | null> {
  if (guide.diagram_path === null) return null
  return { kind: 'base64', mediaType: 'image/png', data: (await readFile(path.resolve(evalDir, guide.diagram_path))).toString('base64') }
}

export const FIGURE_LINE = 'The figure printed with the question is attached.'

/** The perturbed sample, and the unperturbed memo working for the same questions as the control. */
export function selectWorkCheckCases(all: EvalCase[], pattern: RegExp, sample: number): EvalCase[] {
  const inSession = all.filter((evalCase) => pattern.test(evalCase.item.slug))
  const perturbed = stableSample(
    inSession.filter((evalCase) => evalCase.category === PERTURBED_CATEGORY),
    sample,
    (evalCase) => evalCase.id,
  )
  const slugs = new Set(perturbed.map((evalCase) => evalCase.item.slug))
  const controls = inSession.filter((evalCase) => evalCase.category === CONTROL_CATEGORY && slugs.has(evalCase.item.slug))
  return [...perturbed, ...controls].sort((a, b) => a.id.localeCompare(b.id))
}

export async function loadGuideCases(dir: string): Promise<GuideCase[]> {
  const names = (await readdir(dir)).filter((name) => name.endsWith('.json')).sort()
  const cases: GuideCase[] = []
  for (const name of names) {
    const parsed = guideCaseSchema.safeParse(JSON.parse(await readFile(path.join(dir, name), 'utf8')))
    if (!parsed.success) throw new Error(`guide case ${name} is invalid: ${parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; ')}`)
    cases.push(parsed.data)
  }
  return cases
}

// ── running a guide case ─────────────────────────────────────────────────────────────────

export interface NscGuideResult {
  id: string
  /** As the app decides it (B15): `ready` shows worked steps; `unsure` only the first hint. */
  status: 'ready' | 'unsure' | 'failed'
  agreement: 'agree' | 'disagree' | 'skipped' | null
  /** The shown read's final answer matches the memo's; null when no read was accepted. */
  reached: boolean | null
  /** The question went in with its figure attached. */
  with_figure: boolean
  final_answer: string | null
  expected_final_answer: string
  calls: number
  cost_usd: number
  /** The two reads run in parallel: the longer one. */
  latency_ms: number
  runs: VerifiedRun[]
  error: string | null
}

export async function runGuideCase(guide: GuideCase, gateway: Gateway, figure: ImageInput | null = null): Promise<NscGuideResult> {
  const base = { id: guide.id, expected_final_answer: guide.expected_final_answer, with_figure: figure !== null }
  const withFigure = (user: ReturnType<typeof buildGuideUser>): ReturnType<typeof buildGuideUser> =>
    figure ? { text: `${user.text}\n${FIGURE_LINE}`, images: [figure] } : user
  let users: Array<{ version: string; user: ReturnType<typeof buildGuideUser> }>
  try {
    users = [
      { version: GUIDE_PROMPT_VERSION, user: withFigure(buildGuideUser({ kind: 'text', text: guide.item.prompt_md }, 'first')) },
      { version: GUIDE_CHECK_PROMPT_VERSION, user: withFigure(buildGuideUser({ kind: 'text', text: guide.item.prompt_md }, 'check')) },
    ]
  } catch (err) {
    if (!(err instanceof PromptSafetyError)) throw err
    return { ...base, status: 'failed', agreement: null, reached: null, final_answer: null, calls: 0, cost_usd: 0, latency_ms: 0, runs: [], error: `prompt_refused:${err.reason}` }
  }
  const reads = await Promise.all(
    users.map(async ({ version, user }) => {
      const result = await verifiedCall({
        gateway,
        purpose: 'guide',
        promptVersion: version,
        system: buildGuideSystem(),
        user: user.text,
        images: user.images,
        context: { otherFinalAnswer: null },
        maxTokens: GUIDE_MAX_TOKENS,
        timeoutMs: GUIDE_TIMEOUT_MS,
      })
      const output: GuideOutput | null = result.status === 'accepted' ? result.output : null
      return { output, result }
    }),
  )
  const chosen = chooseRead(reads)
  const decision = decideGuide(
    reads.map((read) => read.output),
    chosen?.output ?? null,
  )
  const runs = reads.flatMap((read) => read.result.runs)
  const finalAnswer = chosen?.output?.final_answer ?? null
  return {
    ...base,
    status: decision.status === 'reading' ? 'failed' : decision.status,
    agreement: decision.agreement,
    reached: finalAnswer === null ? null : answersMatch(guide.expected_final_answer, finalAnswer),
    final_answer: finalAnswer,
    calls: runs.length,
    cost_usd: Math.round(reads.reduce((sum, read) => sum + read.result.totalCostUsd, 0) * 1e8) / 1e8,
    latency_ms: Math.max(...reads.map((read) => read.result.totalLatencyMs)),
    runs,
    error: reads.map((read) => read.result.error?.code).find((code): code is NonNullable<typeof code> => Boolean(code)) ?? null,
  }
}

/** The saved results scored again with the current comparison: no model call, the same outputs. */
export function rescoreGuide(results: NscGuideResult[]): NscGuideResult[] {
  return results.map((result) => ({ ...result, reached: result.final_answer === null ? null : answersMatch(result.expected_final_answer, result.final_answer) }))
}

// ── the two suites ───────────────────────────────────────────────────────────────────────

const round = (value: number): number => Math.round(value * 1e8) / 1e8
const metric = (key: string, label: string, definition: string, value: EvidenceRatio): EvidenceMetric => ({ key, label, definition, ratio: value })

function blockedByCode(runs: VerifiedRun[]): Record<string, number> {
  const blocked: Record<string, number> = {}
  for (const run of runs) for (const check of run.checks) if (!check.passed) blocked[check.code] = (blocked[check.code as CheckCode] ?? 0) + 1
  return blocked
}

function latencyOf(runs: VerifiedRun[]): EvidenceSuite['latency_ms'] {
  const latencies = runs.filter((run) => run.status !== 'failed').map((run) => run.latencyMs)
  return latencies.length ? { p50: percentile(latencies, 50), p95: percentile(latencies, 95) } : null
}

function costOf(total: number, cases: number, assumption: string): EvidenceSuite['cost'] {
  const perAttempt = cases > 0 ? round(total / cases) : null
  return { per_attempt_usd: perAttempt, per_learner_week_usd: perAttempt === null ? null : round(perAttempt * NSC_LEARNER_WEEK), assumption }
}

const DATASET = { label: NSC_DATASET_LABEL, held_out: true }

/**
 * A person's reading of each miss (`<EVAL_DIR>/guide-reading.json`, outside the repo): true
 * when the guide's answer is the memo's in another form. Used only when it covers every miss.
 */
export interface GuideReading {
  read_by: string
  equivalent: Record<string, boolean>
}

export function nscGuideSuite(results: NscGuideResult[], source: string, reading: GuideReading | null = null): EvidenceSuite | null {
  if (results.length === 0) return null
  const runs = results.flatMap((result) => result.runs)
  const calls = runs.filter((run) => run.status !== 'failed')
  const shown = results.filter((result) => result.reached !== null)
  const ready = results.filter((result) => result.status === 'ready')
  const reachedOf = (list: NscGuideResult[]) => ratio(list.filter((result) => result.reached === true).length, list.length)
  return {
    key: 'nsc_guide',
    label: 'Help me with a question: the guide against the memo’s final answer',
    dataset: DATASET,
    source,
    n: results.length,
    metric: metric(
      'memo_answer_reached',
      'Reached the memo’s final answer',
      'questions where the answer the guide shows matches the memo’s (same values after normalising notation; another correct form counts as a miss) ÷ questions the guide read',
      reachedOf(shown),
    ),
    metrics: [
      metric('reached_typed', 'Typed questions', 'questions without a figure, typed in: the memo’s final answer reached ÷ such questions the guide read', reachedOf(shown.filter((result) => !result.with_figure))),
      metric(
        'reached_with_figure',
        'Questions with a figure',
        'questions printed with a figure, typed in with the figure’s crop attached as a photo: the memo’s final answer reached ÷ such questions the guide read',
        reachedOf(shown.filter((result) => result.with_figure)),
      ),
      metric('ready', 'Worked steps shown', 'questions where two independent reads agreed and were confident, so the app shows worked steps ÷ questions', ratio(ready.length, results.length)),
      metric(
        'ready_reached',
        'Worked steps shown and the memo’s answer',
        'questions with worked steps shown whose answer matches the memo’s ÷ questions with worked steps shown',
        ratio(ready.filter((result) => result.reached === true).length, ready.length),
      ),
      metric(
        'ready_other_answer',
        'Worked steps shown with another answer',
        'questions with worked steps shown whose answer does not match the memo’s (wrong, or right in another form) ÷ questions with worked steps shown',
        ratio(ready.filter((result) => result.reached === false).length, ready.length),
      ),
      ...readingMetrics(shown, ready, reading),
      metric('schema_validity', 'Passed every check first time', 'model calls that passed every verifier check ÷ model calls', ratio(calls.filter((run) => run.checks.every((check) => check.passed)).length, calls.length)),
      metric('failed', 'Failed', 'questions where no read was accepted (timeout, provider error, checks) ÷ questions', ratio(results.filter((result) => result.status === 'failed').length, results.length)),
    ],
    confidently_wrong: null,
    abstained: null,
    checks_blocked_by_code: blockedByCode(runs),
    latency_ms: latencyOf(runs),
    cost: costOf(
      results.reduce((sum, result) => sum + result.cost_usd, 0),
      results.length,
      `one learner asks for help with ${NSC_LEARNER_WEEK} questions a week; each question is two reads; cost per learner-week is the mean cost per question × ${NSC_LEARNER_WEEK}`,
    ),
  }
}

function readingMetrics(shown: NscGuideResult[], ready: NscGuideResult[], reading: GuideReading | null): EvidenceMetric[] {
  if (!reading) return []
  const misses = shown.filter((result) => result.reached === false)
  if (misses.some((result) => reading.equivalent[result.id] === undefined)) return []
  const same = (result: NscGuideResult): boolean => result.reached === true || reading.equivalent[result.id] === true
  return [
    metric(
      'reached_by_reading',
      'Reached, counting other forms of the same answer',
      `as the headline, with each miss read by ${reading.read_by}: a miss counts when it states the memo’s answer in another form ÷ questions the guide read`,
      ratio(shown.filter(same).length, shown.length),
    ),
    metric(
      'ready_different_by_reading',
      'Worked steps shown with a different answer, by reading',
      `questions with worked steps shown whose answer differs from the memo’s after that reading ÷ questions with worked steps shown`,
      ratio(ready.filter((result) => result.reached !== null && !same(result)).length, ready.length),
    ),
  ]
}

export function nscWorkCheckSuite(results: EvalCaseResult[], source: string): EvidenceSuite | null {
  if (results.length === 0) return null
  const s = summarise(results)
  const perturbed = results.filter((result) => result.category === PERTURBED_CATEGORY)
  const control = results.filter((result) => result.category === CONTROL_CATEGORY)
  const accepted = (list: EvalCaseResult[]) => list.filter((result) => result.status === 'accepted')
  return {
    key: 'nsc_work_check',
    label: 'Work check: naming the lost step on memo working with one step changed',
    dataset: DATASET,
    source,
    n: results.length,
    metric: metric(
      'lost_step_named',
      'Lost step named',
      'changed answers (the memo’s working with the final step’s value altered) where the first step marked down is the changed one ÷ changed answers the checks accepted',
      ratio(accepted(perturbed).filter((result) => result.lost_step_match === true).length, accepted(perturbed).length),
    ),
    metrics: [
      metric(
        'changed_total',
        'Changed answers: exact total',
        'changed answers given exactly the marks minus the changed step’s ÷ changed answers the checks accepted',
        ratio(accepted(perturbed).filter((result) => result.exact_total === true).length, accepted(perturbed).length),
      ),
      metric(
        'memo_full_marks',
        'Memo’s own working: full marks',
        'the unchanged memo working for the same questions given full marks ÷ those the checks accepted',
        ratio(accepted(control).filter((result) => result.exact_total === true).length, accepted(control).length),
      ),
      metric('schema_validity', 'Passed every check first time', 'model calls that passed every verifier check ÷ model calls', s.schema_validity),
      metric('failed', 'Failed calls', 'cases that ended in a timeout or provider error ÷ cases', s.failed),
    ],
    confidently_wrong: s.confidently_wrong,
    abstained: s.abstained,
    checks_blocked_by_code: s.checks_blocked_by_code,
    latency_ms: { p50: s.latency_ms.p50, p95: s.latency_ms.p95 },
    cost: costOf(
      s.cost_usd.total,
      results.length,
      `one learner submits ${NSC_LEARNER_WEEK} pieces of work a week; cost per learner-week is the mean cost per attempt × ${NSC_LEARNER_WEEK}`,
    ),
  }
}

/** The committed file with the NSC suites replaced, models and prompts added, and the "not yet" lines for this run. */
export function withNscSuites(
  existing: EvidenceFile,
  options: { suites: EvidenceSuite[]; model: string; promptVersions: string[]; notYet: string[]; generatedAt: Date },
): EvidenceFile {
  const models = [...existing.models]
  for (const usedFor of ['guide (help me with a question), held-out NSC', 'work check (assess), held-out NSC']) {
    if (!models.some((model) => model.id === options.model && model.used_for === usedFor)) models.push({ id: options.model, tier: 'standard', used_for: usedFor })
  }
  return {
    ...existing,
    generated_at: options.generatedAt.toISOString(),
    models,
    prompt_versions: [...new Set([...existing.prompt_versions, ...options.promptVersions])],
    suites: [...existing.suites.filter((suite) => !suite.key.startsWith('nsc_')), ...options.suites],
    not_yet: [...existing.not_yet.filter((line) => !line.startsWith('Held-out NSC')), ...options.notYet],
  }
}
