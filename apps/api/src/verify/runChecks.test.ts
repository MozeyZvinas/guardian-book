import { describe, expect, it } from 'vitest'
import { goodOutput, quadraticContext, step } from './fixtures.js'
import { RULE_SETS, isRetryable, runChecks } from './runChecks.js'
import { CHECK_CODES } from './types.js'

describe('runChecks', () => {
  const context = quadraticContext()

  it('reports SCHEMA_INVALID alone when the output is malformed, with no data', () => {
    const result = runChecks('assess', { steps: 'nope' }, context)
    expect(result.passed).toBe(false)
    expect(result.data).toBeNull()
    expect(result.abstain).toBe(false)
    expect(result.checks).toHaveLength(1)
    expect(result.checks[0]?.code).toBe('SCHEMA_INVALID')
    expect(result.checks[0]?.detail).toContain('steps')
    expect(isRetryable('assess', result.failed)).toBe(true)
  })

  it('runs every rule for the purpose and passes a good output', () => {
    const result = runChecks('assess', goodOutput(), context)
    expect(result.passed).toBe(true)
    expect(result.abstain).toBe(false)
    expect(result.data?.total).toBe(3)
    expect(result.checks.map((check) => check.code)).toEqual([
      'SCHEMA_INVALID',
      'STEP_UNKNOWN',
      'STEP_MISSING',
      'STEP_DUPLICATE',
      'MARKS_OVER_MAX',
      'TOTAL_MISMATCH',
      'EVIDENCE_MISSING',
      'CA_INCONSISTENT',
      'HINT_LEAKS_ANSWER',
      'INFERENCE_FORBIDDEN',
      'CONFIDENCE_LOW',
    ])
    expect(result.checks.every((check) => check.passed)).toBe(true)
  })

  it('keeps running after a failure so every problem is listed, and marks retryable failures', () => {
    const out = goodOutput({ steps: [...goodOutput().steps, step({ step_id: 'S9', awarded: 1, evidence: 'not in the working' })], total: 3 })
    const result = runChecks('assess', out, context)
    expect(result.passed).toBe(false)
    expect(result.failed.map((check) => check.code)).toEqual(['STEP_UNKNOWN', 'TOTAL_MISMATCH', 'EVIDENCE_MISSING'])
    expect(result.abstain).toBe(false)
    expect(isRetryable('assess', result.failed)).toBe(true)
  })

  it('abstains on a non-retryable failure', () => {
    const out = goodOutput({ steps: [step({ step_id: 'S1', confidence: 'low' }), ...goodOutput().steps.slice(1)] })
    const result = runChecks('assess', out, context)
    expect(result.passed).toBe(false)
    expect(result.abstain).toBe(true)
    expect(result.failed.map((check) => check.code)).toEqual(['CONFIDENCE_LOW'])
    expect(isRetryable('assess', result.failed)).toBe(false)
  })

  it('applies the right rule set per purpose', () => {
    expect(runChecks('classify', { kind: 'notice', confidence: 'high', reason: 'A timetable.' }, {}).passed).toBe(true)
    expect(runChecks('notice', { events: [], not_a_notice: true }, { today: '2026-11-03', sourceText: null }).passed).toBe(true)
    expect(runChecks('note', { text: 'Short and clear.', evidence_event_ids: ['e1'] }, { knownEvidenceIds: ['e1'] }).passed).toBe(true)
    expect(runChecks('profile_cards', { dream: null, subjects: [], hardest_subject: null, how_i_learn: null }, {}).passed).toBe(true)
  })

  it('every rule code in every set is a known code, and no set is empty', () => {
    for (const [purpose, rules] of Object.entries(RULE_SETS)) {
      expect(rules.length, purpose).toBeGreaterThan(0)
      for (const rule of rules) expect(CHECK_CODES).toContain(rule.code)
    }
  })

  it('isRetryable is false with nothing failed', () => {
    expect(isRetryable('assess', [])).toBe(false)
  })
})
