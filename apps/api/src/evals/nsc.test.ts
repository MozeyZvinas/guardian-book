import { evidenceFileSchema, evidenceSuiteSchema, type EvidenceFile, type GuideOutput } from '@guardian-book/shared'
import { describe, expect, it } from 'vitest'
import { loadConfig } from '../config.js'
import { createGateway } from '../gateway/gateway.js'
import { capturingLogger, okResponse } from '../gateway/testing.js'
import type { ChatRequest } from '../gateway/transport.js'
import type { EvalCase } from './cases.js'
import type { GuideCase } from './guideCases.js'
import { NSC_DATASET_LABEL, answersMatch, nscGuideSuite, nscWorkCheckSuite, runGuideCase, selectGuideCases, selectWorkCheckCases, sessionCasePattern, stableSample, withNscSuites } from './nsc.js'
import type { EvalCaseResult } from './runner.js'

/** Synthetic questions only (never DBE text). */
const ratioOf = (n: number, d: number) => ({ n, d, rate: n / d, ci95: [0.5, 1] as [number, number] })
const sampleEvidence = (): EvidenceFile => ({
  schema_version: 1,
  generated_at: '2026-11-03T12:00:00.000Z',
  models: [{ id: 'muse-spark-1.3', tier: 'standard', used_for: 'work check (assess)' }],
  prompt_versions: ['work-check-v1'],
  dataset: { label: 'development set', mocked: false, held_out: false },
  suites: [
    {
      key: 'work_check',
      label: 'Work check',
      source: 'pnpm eval:dev',
      n: 8,
      metric: { key: 'exact_total', label: 'Exact total', definition: 'exact ÷ accepted', ratio: ratioOf(8, 8) },
      metrics: [],
      confidently_wrong: null,
      abstained: null,
      checks_blocked_by_code: {},
      latency_ms: null,
      cost: null,
    },
  ],
  not_yet: ['Handwriting photos: no photo cases in this run.'],
  built: { from: '2026-10-26', to: '2026-11-04', steps: [{ id: 'B01', title: 'Scaffold' }] },
})
const guideCase = (over: Partial<GuideCase> = {}): GuideCase => ({
  id: 'nsc-maths-p1-2026-jun-q1-1-guide',
  item: { slug: 'nsc-maths-p1-2026-jun-q1-1', prompt_md: 'Solve for $x$: $x^2 - 49 = 0$' },
  diagram_path: null,
  expected_final_answer: '$x = 7$ or $x = -7$',
  ...over,
})

const guideOutput = (finalAnswer: string, confidence: GuideOutput['confidence'] = 'high'): GuideOutput => ({
  question_md: 'Solve for $x$: $x^2 - 49 = 0$',
  subject: 'Mathematics',
  topic: 'Quadratic equations',
  steps: [
    { goal: 'Factorise the left side.', hint: 'Look for a difference of two squares.', worked: '$(x-7)(x+7) = 0$' },
    { goal: 'Solve each bracket.', hint: 'Set each bracket equal to zero.', worked: 'So the solutions follow from each bracket.' },
  ],
  final_answer: finalAnswer,
  confidence,
})

function gatewayAnswering(first: GuideOutput, check: GuideOutput) {
  const textOf = (request: ChatRequest): string => {
    const user = request.messages[1].content
    return typeof user === 'string' ? user : user.map((part) => (part.type === 'text' ? part.text : '')).join('\n')
  }
  return createGateway({
    config: loadConfig({ META_API_KEY: 'mock-not-real' }).meta,
    logger: capturingLogger().logger,
    transport: async (request) => okResponse(textOf(request).startsWith('Independent second read') ? check : first),
    sleep: async () => {},
  })
}

describe('comparing a final answer with the memo', () => {
  it('matches the same values written differently', () => {
    expect(answersMatch('$x = 7$ or $x = -7$', '$x = \\pm 7$')).toBe(true)
    expect(answersMatch('$x=-7$ or $x=7$', '$x = 7; x = -7$')).toBe(true)
    expect(answersMatch('$\\frac{9}{4}$', '$\\dfrac{9}{4}$')).toBe(true)
    expect(answersMatch('$n = 2.25$', '$2.250$')).toBe(true)
    expect(answersMatch('R 12 345.67', 'R12345.67')).toBe(true)
    expect(answersMatch('$x = 47.2°$', '$x = 47.20$')).toBe(true)
  })

  it('refuses a different value, a missing part or an empty answer', () => {
    expect(answersMatch('$x = 7$ or $x = -7$', '$x = 3$')).toBe(false)
    expect(answersMatch('$x = 3$', '$x = 4$')).toBe(false)
    expect(answersMatch('$2.25$', '$2.3$')).toBe(false)
    expect(answersMatch('$x = 3$', '')).toBe(false)
  })
})

describe('choosing the held-out cases', () => {
  it('keeps the session asked for, counts figures, and leaves out printed results', () => {
    const pattern = sessionCasePattern('2026-may_june')
    expect(pattern.test('nsc-maths-p2-2026-jun-q3-1')).toBe(true)
    expect(pattern.test('nsc-maths-p1-2025-nov-q3-1')).toBe(false)
    const selection = selectGuideCases(
      [
        guideCase(),
        guideCase({ id: 'b', item: { slug: 'nsc-maths-p2-2026-jun-q2', prompt_md: 'Find the gradient of $AB$.' }, diagram_path: '../../diagrams/x.png' }),
        guideCase({ id: 'c', item: { slug: 'nsc-maths-p2-2026-jun-q3', prompt_md: 'Prove that $\\tan x \\cdot \\cos x = \\sin x$.' } }),
        guideCase({ id: 'd', item: { slug: 'nsc-maths-p1-2025-nov-q1', prompt_md: 'Solve $x = 1$.' } }),
      ],
      pattern,
    )
    expect(selection.cases.map((guide) => guide.id)).toEqual(['nsc-maths-p1-2026-jun-q1-1-guide', 'b'])
    expect([selection.withFigure, selection.givenResult]).toEqual([1, 1])
  })

  it('samples changed answers the same way every run and pairs each with its unchanged control', () => {
    const evalCase = (slug: string, category: string): EvalCase =>
      ({ id: `${slug}-${category}`, category, item: { slug, prompt_md: 'x', max_marks: 2 } }) as unknown as EvalCase
    const slugs = ['a', 'b', 'c', 'd'].map((letter) => `nsc-maths-p1-2026-jun-q${letter}`)
    const all = slugs.flatMap((slug) => [evalCase(slug, 'memo_perturbed_final_step'), evalCase(slug, 'memo_model_answer')])
    const chosen = selectWorkCheckCases(all, sessionCasePattern('2026-may_june'), 2)
    expect(chosen).toHaveLength(4)
    expect(new Set(chosen.map((c) => c.item.slug)).size).toBe(2)
    expect(selectWorkCheckCases([...all].reverse(), sessionCasePattern('2026-may_june'), 2).map((c) => c.id)).toEqual(chosen.map((c) => c.id))
    expect(stableSample([1, 2, 3], 5, String)).toHaveLength(3)
  })
})

describe('running the guide on a held-out question', () => {
  it('shows worked steps when two reads agree, and checks the answer against the memo', async () => {
    const result = await runGuideCase(guideCase(), gatewayAnswering(guideOutput('$x = \\pm 7$'), guideOutput('$x=\\pm 7$', 'medium')))
    expect(result).toMatchObject({ status: 'ready', agreement: 'agree', reached: true, calls: 2, final_answer: '$x = \\pm 7$' })
  })

  it('attaches a figure to both reads when the question has one', async () => {
    const requests: ChatRequest[] = []
    const gateway = createGateway({
      config: loadConfig({ META_API_KEY: 'mock-not-real' }).meta,
      logger: capturingLogger().logger,
      transport: async (request) => {
        requests.push(request)
        return okResponse(guideOutput('$x = \\pm 7$'))
      },
      sleep: async () => {},
    })
    const figure = { kind: 'base64' as const, mediaType: 'image/png' as const, data: 'AAAA' }
    const result = await runGuideCase(guideCase({ diagram_path: 'x.png' }), gateway, figure)
    expect(result.with_figure).toBe(true)
    expect(requests).toHaveLength(2)
    for (const request of requests) expect(JSON.stringify(request.messages[1].content)).toContain('The figure printed with the question is attached.')
  })

  it('is unsure when the reads disagree, and records another answer as a miss', async () => {
    const result = await runGuideCase(guideCase(), gatewayAnswering(guideOutput('$x = 9$'), guideOutput('$x = 3$', 'medium')))
    expect(result.status).toBe('unsure')
    expect(result.agreement).toBe('disagree')
    expect(result.reached).toBe(false)
  })
})

describe('the held-out suites', () => {
  const guideResult = (reached: boolean | null, status: 'ready' | 'unsure' | 'failed', with_figure = false) => ({
    id: 'g',
    with_figure,
    status,
    agreement: null,
    reached,
    final_answer: null,
    expected_final_answer: '1',
    calls: 2,
    cost_usd: 0.03,
    latency_ms: 20_000,
    runs: [],
    error: null,
  })

  it('counts the guide over the questions it read, with its own dataset label', () => {
    const suite = nscGuideSuite([guideResult(true, 'ready'), guideResult(false, 'ready', true), guideResult(false, 'unsure'), guideResult(null, 'failed')], 'pnpm eval:nsc')
    expect(evidenceSuiteSchema.parse(suite)).toEqual(suite)
    expect(suite?.dataset).toEqual({ label: NSC_DATASET_LABEL, held_out: true })
    expect(suite?.metric.ratio).toMatchObject({ n: 1, d: 3 })
    const byKey = Object.fromEntries((suite?.metrics ?? []).map((m) => [m.key, m.ratio]))
    expect(byKey['ready']).toMatchObject({ n: 2, d: 4 })
    expect(byKey['reached_typed']).toMatchObject({ n: 1, d: 2 })
    expect(byKey['reached_with_figure']).toMatchObject({ n: 0, d: 1 })
    expect(byKey['ready_reached']).toMatchObject({ n: 1, d: 2 })
    expect(byKey['failed']).toMatchObject({ n: 1, d: 4 })
    expect(suite?.cost?.per_attempt_usd).toBe(0.03)
    expect(nscGuideSuite([], 'x')).toBeNull()
  })

  it('scores the lost step on changed answers and full marks on the control', () => {
    const result = (category: string, over: Partial<EvalCaseResult>): EvalCaseResult =>
      ({ id: category, suite: 'work_check', category, legibility: null, status: 'accepted', expected_total: 2, model_total: 2, exact_total: true, within_one: true, expected_first_lost_step: null, model_first_lost_step: null, lost_step_match: null, all_steps_high_confidence: true, answer_revealed: null, calls: 1, cost_usd: 0.01, latency_ms: 1000, output: null, runs: [], error: null, ...over }) as EvalCaseResult
    const suite = nscWorkCheckSuite(
      [
        result('memo_perturbed_final_step', { expected_first_lost_step: 'S2', model_first_lost_step: 'S2', lost_step_match: true }),
        result('memo_perturbed_final_step', { expected_first_lost_step: 'S3', model_first_lost_step: 'S2', lost_step_match: false, exact_total: false }),
        result('memo_model_answer', {}),
      ],
      'pnpm eval:nsc',
    )
    expect(evidenceSuiteSchema.parse(suite)).toEqual(suite)
    expect(suite?.metric.ratio).toMatchObject({ n: 1, d: 2 })
    const byKey = Object.fromEntries((suite?.metrics ?? []).map((m) => [m.key, m.ratio]))
    expect(byKey['memo_full_marks']).toMatchObject({ n: 1, d: 1 })
    expect(byKey['changed_total']).toMatchObject({ n: 1, d: 2 })
  })

  it('replaces only the NSC suites and lines in the committed file', () => {
    const existing = sampleEvidence()
    existing.not_yet.push('Held-out NSC guide: old line')
    const suite = nscGuideSuite([guideResult(true, 'ready')], 'pnpm eval:nsc')!
    const once = withNscSuites(existing, { suites: [suite], model: 'muse-spark-1.3', promptVersions: ['guide-v1'], notYet: ['Held-out NSC suites: new'], generatedAt: new Date('2026-11-05T00:00:00Z') })
    const twice = withNscSuites(once, { suites: [suite], model: 'muse-spark-1.3', promptVersions: ['guide-v1'], notYet: ['Held-out NSC suites: new'], generatedAt: new Date('2026-11-05T00:00:00Z') })
    expect(evidenceFileSchema.parse(twice)).toEqual(twice)
    expect(twice.suites.map((s) => s.key)).toEqual(['work_check', 'nsc_guide'])
    expect(twice.not_yet).toEqual(['Handwriting photos: no photo cases in this run.', 'Held-out NSC suites: new'])
    expect(twice.prompt_versions).toEqual(['work-check-v1', 'guide-v1'])
    expect(twice.models).toHaveLength(3)
  })
})
