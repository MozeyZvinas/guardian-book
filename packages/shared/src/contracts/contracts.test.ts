import { describe, expect, it } from 'vitest'
import { isUuid, uuidv7, uuidv7Time } from '../ids.js'
import { signUpBodySchema } from './auth.js'
import { CODE_ALPHABET, CODE_LENGTH, codeSchema, normaliseCode } from './circle.js'
import { LEARNING_EVENT_KINDS, learningEventInputSchema } from './events.js'
import { itemFileSchema } from './items.js'
import { PROVENANCE_KINDS, provenanceColumns, provenanceFor, provenanceSchema } from './provenance.js'

const LEARNER = '019a5a2e-0000-7000-8000-000000000001'
const ATTEMPT = '019a5a2e-0000-7000-8000-000000000002'

describe('uuidv7', () => {
  it('produces valid, time-ordered v7 UUIDs', () => {
    const a = uuidv7(1_700_000_000_000, () => new Uint8Array(10))
    const b = uuidv7(1_700_000_000_001, () => new Uint8Array(10))
    expect(a).toBe('018bcfe5-6800-7000-8000-000000000000')
    expect(isUuid(a)).toBe(true)
    expect(a < b).toBe(true)
    expect(uuidv7Time(a)).toBe(1_700_000_000_000)
    expect(uuidv7Time('123e4567-e89b-42d3-a456-426614174000')).toBeNull()
  })

  it('sets version and variant bits over random bytes', () => {
    const id = uuidv7(0, () => new Uint8Array(10).fill(0xff))
    expect(id).toBe('00000000-0000-7fff-bfff-ffffffffffff')
    expect(isUuid(uuidv7())).toBe(true)
  })
})

describe('provenance contract', () => {
  it('maps every kind to a provenance and never grants training permission', () => {
    for (const kind of PROVENANCE_KINDS) {
      expect(provenanceSchema.safeParse(provenanceFor(kind)).success).toBe(true)
      if (kind === 'model_output') continue
      expect(provenanceColumns(kind).trainingPermission).toBe('not_permitted')
      expect(provenanceColumns(kind).provenanceDetail).toBeNull()
    }
  })

  it('requires the model detail for model output and refuses it elsewhere', () => {
    expect(() => provenanceColumns('model_output')).toThrow(/model_generated/)
    const detail = { provider: 'meta', model: 'muse-spark-1.3', version: 'mark-v1', model_run_id: ATTEMPT }
    expect(provenanceColumns('model_output', detail)).toEqual({
      provenance: 'model_generated',
      provenanceDetail: detail,
      trainingPermission: 'not_permitted',
    })
    expect(() => provenanceColumns('seed_item', detail)).toThrow(/does not take/)
  })
})

describe('learning event schema', () => {
  it('accepts every kind with a tokens-only payload and defaults nulls', () => {
    for (const kind of LEARNING_EVENT_KINDS) {
      const basis = kind === 'assessed' ? 'model_high' : 'none'
      const parsed = learningEventInputSchema.parse({
        learnerId: LEARNER,
        kind,
        basis,
        payload: { attemptNo: 1, ok: true, ids: [ATTEMPT] },
      })
      expect(parsed.attemptId).toBeNull()
      expect(parsed.skillTag).toBeNull()
    }
  })

  it('rejects unknown kinds, free text in the payload, and basis on support events', () => {
    const base = { learnerId: LEARNER, kind: 'attempt_submitted', basis: 'none' }
    expect(learningEventInputSchema.safeParse({ ...base, kind: 'marked' }).success).toBe(false)
    expect(
      learningEventInputSchema.safeParse({ ...base, payload: { note: 'the answer was x = 3' } }).success,
    ).toBe(false)
    expect(learningEventInputSchema.safeParse({ ...base, extra: 1 }).success).toBe(false)
    expect(
      learningEventInputSchema.safeParse({ learnerId: LEARNER, kind: 'support_given', basis: 'model_high' })
        .success,
    ).toBe(false)
  })
})

describe('sign-up body', () => {
  it('requires the attestation to be literally true and a self-assignable role', () => {
    const ok = { nickname: 'Lerato', email: 'L@Example.com', password: 'longenough', role: 'learner' }
    expect(signUpBodySchema.parse({ ...ok, ageAttested: true }).email).toBe('l@example.com')
    expect(signUpBodySchema.safeParse({ ...ok, ageAttested: false }).success).toBe(false)
    expect(signUpBodySchema.safeParse({ ...ok, ageAttested: 'true' }).success).toBe(false)
    expect(signUpBodySchema.safeParse(ok).success).toBe(false)
    expect(signUpBodySchema.safeParse({ ...ok, ageAttested: true, role: 'admin' }).success).toBe(false)
    expect(signUpBodySchema.safeParse({ ...ok, ageAttested: true, password: 'short' }).success).toBe(false)
  })
})

describe('codes', () => {
  it('uses an unambiguous alphabet and forgives typing', () => {
    expect(CODE_ALPHABET).not.toMatch(/[01OIL]/)
    expect(CODE_ALPHABET.length).toBe(30)
    expect(normaliseCode(' ab2d-ef3g ')).toBe('AB2DEF3G')
    expect(codeSchema.parse('abcd efgh')).toBe('ABCDEFGH')
    expect(codeSchema.safeParse('ABCDEFG').success).toBe(false)
    expect(codeSchema.safeParse('ABCD0FGH').success).toBe(false)
    expect('A'.repeat(CODE_LENGTH)).toHaveLength(8)
  })
})

describe('item file', () => {
  const item = {
    slug: 'sample',
    topic: 'Algebra',
    skill_tags: ['factorise-trinomial'],
    prompt_md: 'Solve for $x$.',
    max_marks: 3,
    author: 'planning',
    reviewer: 'pending',
    source: 'original',
    provenance: 'original_human',
    guideline_steps: [
      { step_no: 1, step_type: 'M', criterion: 'factorise', marks: 2, skill_tag: 'factorise-trinomial' },
      { step_no: 2, step_type: 'A', criterion: 'both roots', marks: 1, skill_tag: 'factorise-trinomial' },
    ],
  }

  it('accepts a well-formed item and rejects a marks-sum error', () => {
    expect(itemFileSchema.safeParse(item).success).toBe(true)
    expect(itemFileSchema.safeParse({ ...item, max_marks: 4 }).success).toBe(false)
    expect(itemFileSchema.safeParse({ ...item, source: 'dbe' }).success).toBe(false)
    expect(itemFileSchema.safeParse({ ...item, provenance: 'model_generated' }).success).toBe(false)
    const badType = { ...item, guideline_steps: [{ ...item.guideline_steps[0], step_type: 'B', marks: 3 }] }
    expect(itemFileSchema.safeParse(badType).success).toBe(false)
  })
})
