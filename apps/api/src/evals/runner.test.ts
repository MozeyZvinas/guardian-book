import { mkdtemp, readFile, rm, writeFile, readdir } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { loadConfig } from '../config.js'
import { createGateway } from '../gateway/gateway.js'
import { capturingLogger, okResponse, scriptedTransport } from '../gateway/testing.js'
import type { EvalCase } from './cases.js'
import { createMockGateway, expectedOutputFor } from './mockGateway.js'
import { firstLostStep, loadCases, runEval, summarise } from './runner.js'

const quadGuideline: EvalCase['guideline'] = [
  { step_id: 'S1', step_no: 1, kind: 'M', criterion: 'Factorise', marks: 1, notes: null, expected: '(x - 2)(x - 3) = 0' },
  { step_id: 'S2', step_no: 2, kind: 'A', criterion: 'First root', marks: 1, notes: null, expected: 'x = 2' },
  { step_id: 'S3', step_no: 3, kind: 'CA', criterion: 'Second root', marks: 1, notes: null, expected: 'x = 3' },
]

const cases: EvalCase[] = [
  {
    id: 'quad-correct',
    category: 'fully_correct',
    legibility: null,
    item: { slug: 'alg-quad-01', prompt_md: 'Solve $x^2 - 5x + 6 = 0$', max_marks: 3 },
    guideline: quadGuideline,
    final_answer: 'x = 2 or x = 3',
    answer: { kind: 'typed', text: 'x^2 - 5x + 6 = 0\n(x - 2)(x - 3) = 0\nx = 2 or x = 3' },
    mode: 'assisted',
    expected: { total: 3, awarded: { S1: 1, S2: 1, S3: 1 }, first_lost_step: null },
  },
  {
    id: 'quad-sign-error',
    category: 'clear_conceptual_error',
    legibility: null,
    item: { slug: 'alg-quad-01', prompt_md: 'Solve $x^2 - 5x + 6 = 0$', max_marks: 3 },
    guideline: quadGuideline,
    final_answer: 'x = 2 or x = 3',
    answer: { kind: 'typed', text: 'x^2 - 5x + 6 = 0\n(x + 2)(x + 3) = 0\nx = -2 or x = -3' },
    mode: 'assisted',
    expected: { total: 1, awarded: { S1: 0, S2: 0, S3: 1 }, first_lost_step: 'S1' },
  },
]

describe('eval runner', () => {
  let evalDir: string
  let outDir: string

  beforeEach(async () => {
    evalDir = await mkdtemp(path.join(os.tmpdir(), 'gb-eval-cases-'))
    outDir = await mkdtemp(path.join(os.tmpdir(), 'gb-eval-results-'))
    for (const evalCase of cases) await writeFile(path.join(evalDir, `${evalCase.id}.json`), JSON.stringify(evalCase))
  })

  afterEach(async () => {
    await rm(evalDir, { recursive: true, force: true })
    await rm(outDir, { recursive: true, force: true })
  })

  it('loads and validates case files, rejecting a bad one by name', async () => {
    expect((await loadCases(evalDir)).map((c) => c.id)).toEqual(['quad-correct', 'quad-sign-error'])
    await writeFile(path.join(evalDir, 'zz-bad.json'), JSON.stringify({ id: 'bad' }))
    await expect(loadCases(evalDir)).rejects.toThrow(/zz-bad\.json is invalid/)
  })

  it('runs 2 local cases through a mocked model and writes a results file with denominators', async () => {
    const config = loadConfig({ META_API_KEY: 'mock-not-real' }).meta
    const { logger, lines } = capturingLogger()
    const gateway = createMockGateway(config, logger, cases)
    const seen: string[] = []
    const { results, filePath, latestPath } = await runEval({
      evalDir,
      outDir,
      gateway,
      mocked: true,
      now: () => new Date('2026-11-03T12:00:00Z'),
      onCase: (result) => seen.push(result.id),
    })

    expect(seen).toEqual(['quad-correct', 'quad-sign-error'])
    expect(results.model).toBe('muse-spark-1.3')
    expect(results.tier).toBe('standard')
    expect(results.prompt_version).toBe('work-check-v1')
    expect(results.mocked).toBe(true)
    expect(results.summary.cases).toBe(2)
    expect(results.summary.calls).toBe(2)
    expect(results.summary.schema_validity).toMatchObject({ n: 2, d: 2, rate: 1 })
    expect(results.summary.exact_total).toMatchObject({ n: 2, d: 2 })
    expect(results.summary.within_one).toMatchObject({ n: 2, d: 2 })
    expect(results.summary.lost_step_accuracy).toMatchObject({ n: 1, d: 1 })
    expect(results.summary.confidently_wrong).toMatchObject({ n: 0, d: 2 })
    expect(results.summary.abstained).toMatchObject({ n: 0, d: 2 })
    expect(results.summary.failed).toMatchObject({ n: 0, d: 2 })
    expect(results.summary.checks_blocked_by_code).toEqual({})
    expect(results.summary.cost_usd.total).toBeGreaterThan(0)
    expect(results.summary.exact_total.ci95?.[0]).toBeGreaterThan(0)

    expect(path.basename(filePath)).toBe('2026-11-03T12-00-00-000Z-muse-spark-1.3-mock.json')
    expect(path.basename(latestPath)).toBe('latest.json')
    const written = JSON.parse(await readFile(latestPath, 'utf8')) as typeof results
    expect(written.summary.cases).toBe(2)
    expect(written.cases[1]?.model_first_lost_step).toBe('S1')
    expect((await readdir(outDir)).sort()).toEqual(['2026-11-03T12-00-00-000Z-muse-spark-1.3-mock.json', 'latest.json'])
    // The gateway logged each call without any answer text.
    expect(lines.join('\n')).not.toContain('(x + 2)(x + 3)')
  })

  it('counts abstentions, failures and blocked checks', async () => {
    const config = loadConfig({ META_API_KEY: 'mock-not-real' }).meta
    const first = cases[0]
    const second = cases[1]
    if (!first || !second) throw new Error('fixtures')
    const low = expectedOutputFor(first)
    low.steps[0] = { ...low.steps[0]!, confidence: 'low' }
    const bad = { ...expectedOutputFor(second), total: 99 }
    const scripted = scriptedTransport([okResponse(low), okResponse(bad), okResponse(bad), { ok: false, kind: 'timeout' }])
    const gateway = createGateway({ config, logger: capturingLogger().logger, transport: scripted.transport, sleep: async () => {} })
    const { results } = await runEval({ evalDir, outDir, gateway, mocked: true })
    expect(results.cases.map((c) => c.status)).toEqual(['exhausted', 'failed'])
    expect(results.summary.abstained).toMatchObject({ n: 1, d: 2 })
    expect(results.summary.abstained_on_imperfect).toMatchObject({ n: 0, d: 1 })
    expect(results.summary.failed).toMatchObject({ n: 1, d: 2 })
    expect(results.summary.calls).toBe(4)
    expect(results.summary.schema_validity).toMatchObject({ n: 0, d: 3 })
    expect(results.summary.checks_blocked_by_code).toEqual({ CONFIDENCE_LOW: 1, TOTAL_MISMATCH: 2 })
    expect(results.summary.exact_total).toMatchObject({ n: 0, d: 0, rate: null, ci95: null })
  })

  it('firstLostStep follows guideline order and summarise handles no results', () => {
    const output = expectedOutputFor(cases[1]!)
    expect(firstLostStep(output, ['S1', 'S2', 'S3'])).toBe('S1')
    expect(firstLostStep(expectedOutputFor(cases[0]!), ['S1', 'S2', 'S3'])).toBeNull()
    const empty = summarise([])
    expect(empty.cases).toBe(0)
    expect(empty.cost_usd.per_case_mean).toBeNull()
    expect(empty.latency_ms.p50).toBe(0)
  })
})
