import { existsSync } from 'node:fs'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { evidenceFileSchema } from '@guardian-book/shared'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { loadConfig } from '../config.js'
import { workCheckContext } from '../gateway/prompts/workCheck.v1.js'
import { capturingLogger } from '../gateway/testing.js'
import { createMockGateway, expectedOutputFor } from './mockGateway.js'
import { answerRevealed } from './pedagogy.js'
import { readPrivacyHarness, writePrivacyHarness, type PrivacyHarnessFile } from './privacyHarness.js'
import { loadCases, runEval, type EvalResults } from './runner.js'
import { LEARNER_WEEK_ATTEMPTS, buildEvidence, notYet, privacySuite, writeEvidence } from './summary.js'

const fixturesDir = path.resolve(import.meta.dirname, 'fixtures/cases')
const committedLatest = path.resolve(import.meta.dirname, '../../../../evals/results/latest.json')

const harness: PrivacyHarnessFile = {
  schema_version: 1,
  ran_at: '2026-11-03T11:00:00.000Z',
  rows: [
    { name: 'anonymous reads /api/me', expect: 401, passed: true },
    { name: 'learner A revokes learner B’s guardian', expect: 404, passed: true },
    { name: 'Riverside teacher → Sentinel class 12A', expect: 404, passed: false },
    { name: 'teacher 12A reads class 12A', expect: 200, passed: true },
  ],
}

describe('evidence summary', () => {
  let outDir: string
  let results: EvalResults

  beforeEach(async () => {
    outDir = await mkdtemp(path.join(os.tmpdir(), 'gb-evidence-'))
    const cases = await loadCases(fixturesDir)
    const gateway = createMockGateway(loadConfig({ META_API_KEY: 'mock-not-real' }).meta, capturingLogger().logger, cases)
    results = (await runEval({ evalDir: fixturesDir, outDir, gateway, mocked: true, now: () => new Date('2026-11-03T12:00:00Z') })).results
  })

  afterEach(async () => {
    await rm(outDir, { recursive: true, force: true })
  })

  it('builds one suite per kind of case, every rate with its denominator', async () => {
    const evidence = buildEvidence({ results, privacy: harness, datasetLabel: 'dev set, synthetic', heldOut: false, notYet: ['Voice input.'] })
    expect(evidence.suites.map((suite) => [suite.key, suite.n])).toEqual([
      ['work_check', 8],
      ['pedagogy', 4],
      ['privacy', 4],
    ])
    const work = evidence.suites[0]!
    expect(work.metric.key).toBe('exact_total')
    expect(work.metric.ratio).toMatchObject({ n: 8, d: 8, rate: 1 })
    expect(work.metrics.find((m) => m.key === 'injection_resistance')?.ratio).toMatchObject({ n: 1, d: 1 })
    expect(work.confidently_wrong).toMatchObject({ n: 0, d: 8 })
    expect(work.abstained).toMatchObject({ n: 0, d: 8 })
    expect(work.cost?.per_learner_week_usd).toBeCloseTo((work.cost?.per_attempt_usd ?? 0) * LEARNER_WEEK_ATTEMPTS, 8)
    expect(work.cost?.assumption).toContain(String(LEARNER_WEEK_ATTEMPTS))

    const pedagogy = evidence.suites[1]!
    expect(pedagogy.metric.key).toBe('no_answer_revealed')
    expect(pedagogy.metric.ratio).toMatchObject({ n: 4, d: 4 })

    expect(evidence.models).toEqual([{ id: 'muse-spark-1.3', tier: 'standard', used_for: 'work check (assess)' }])
    expect(evidence.prompt_versions).toEqual(['work-check-v1'])
    expect(evidence.dataset).toEqual({ label: 'dev set, synthetic', mocked: true, held_out: false })
    expect(evidence.not_yet[0]).toBe('Voice input.')
    expect(evidence.not_yet.join('\n')).toMatch(/mocked model/)
    expect(evidence.not_yet.join('\n')).toMatch(/held-out/)
    expect(evidence.built.steps.some((step) => step.id === 'B08')).toBe(true)

    const latest = path.join(outDir, 'latest.json')
    await writeEvidence(evidence, latest)
    expect(evidenceFileSchema.parse(JSON.parse(await readFile(latest, 'utf8')))).toEqual(evidence)
    // The summary carries no answer text, no transcription and no per-case output.
    expect(await readFile(latest, 'utf8')).not.toMatch(/transcription|"steps":\s*\[\s*\{\s*"step_id"/)
  })

  it('leaves the privacy suite out without a harness file and counts denials and owners apart', async () => {
    const without = buildEvidence({ results, privacy: null, datasetLabel: 'x', heldOut: false })
    expect(without.suites.map((suite) => suite.key)).toEqual(['work_check', 'pedagogy'])

    const suite = privacySuite(harness)
    expect(suite.metric.ratio).toMatchObject({ n: 3, d: 4 })
    expect(suite.metrics.map((m) => [m.key, m.ratio.n, m.ratio.d])).toEqual([
      ['denied', 2, 3],
      ['served', 1, 1],
    ])
    expect(suite.latency_ms).toBeNull()
    expect(suite.cost).toBeNull()

    const file = path.join(outDir, 'privacy.json')
    await writePrivacyHarness(harness, file)
    expect(await readPrivacyHarness(file)).toEqual(harness)
    expect(await readPrivacyHarness(path.join(outDir, 'missing.json'))).toBeNull()
  })

  it('answerRevealed catches a value from the answer or the memo in anything the learner sees', async () => {
    const cases = await loadCases(fixturesDir)
    const pedagogy = cases.find((c) => c.id === 'ped-01-quad-answer')
    if (!pedagogy || pedagogy.answer.kind !== 'typed') throw new Error('fixture')
    const context = workCheckContext({ item: pedagogy.item, guideline: pedagogy.guideline, answer: pedagogy.answer, mode: 'assisted', final_answer: pedagogy.final_answer })
    const clean = expectedOutputFor(pedagogy)
    expect(answerRevealed(clean, context)).toBe(false)
    const leaky = { ...clean, steps: clean.steps.map((step, i) => (i === 0 ? { ...step, feedback: 'No working. The roots are x = 2 and x = 3.' } : step)) }
    expect(answerRevealed(leaky, context)).toBe(true)
    const hinted = { ...clean, steps: clean.steps.map((step, i) => (i === 1 ? { ...step, hint: 'Set each factor equal to zero; see step 2.' } : step)) }
    expect(answerRevealed(hinted, context)).toBe(false)
  })

  it('states what a run does not show', () => {
    const lines = notYet({ ...results, mocked: false }, true, [])
    expect(lines.join('\n')).not.toMatch(/mocked|held-out/)
    expect(lines.join('\n')).toMatch(/photo/)
  })

  it('the committed latest.json, when present, passes the schema and never claims a held-out set by accident', async () => {
    if (!existsSync(committedLatest)) return
    const parsed = evidenceFileSchema.parse(JSON.parse(await readFile(committedLatest, 'utf8')))
    expect(parsed.dataset.label.length).toBeGreaterThan(0)
    if (parsed.dataset.held_out) expect(parsed.dataset.label).toMatch(/held[- ]out/i)
  })
})
