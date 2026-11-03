import { describe, expect, it } from 'vitest'
import {
  MODEL_OUTPUT_SCHEMAS,
  MODEL_PURPOSES,
  modelJsonSchema,
  noticeOutputSchema,
  planOutputSchema,
  profileCardsSchema,
  workCheckOutputSchema,
} from './index.js'

describe('model output contracts', () => {
  it('every purpose has a contract that fits the strict subset', () => {
    for (const purpose of MODEL_PURPOSES) {
      expect(MODEL_OUTPUT_SCHEMAS[purpose]).toBeDefined()
      const json = modelJsonSchema(purpose)
      expect(json.strict).toBe(true)
      expect(json.schema['type']).toBe('object')
      expect(JSON.stringify(json.schema)).not.toContain('$ref')
    }
  })

  it('WorkCheckOutput rejects unknown keys and out-of-range marks', () => {
    const step = {
      step_id: 's1',
      awarded: 1,
      available: 1,
      confidence: 'high',
      evidence: 'x = 3 in line 2',
      feedback: 'Correct substitution.',
      misconception_tag: null,
      hint: null,
      box: null,
    }
    const good = { steps: [step], total: 1, transcription: 'x = 3', transcription_confidence: 'high', uncertainty_codes: [] }
    expect(workCheckOutputSchema.safeParse(good).success).toBe(true)
    expect(workCheckOutputSchema.safeParse({ ...good, extra: 1 }).success).toBe(false)
    expect(workCheckOutputSchema.safeParse({ ...good, steps: [{ ...step, awarded: -1 }] }).success).toBe(false)
    expect(workCheckOutputSchema.safeParse({ ...good, steps: [{ ...step, awarded: 0.5 }] }).success).toBe(false)
    expect(workCheckOutputSchema.safeParse({ ...good, steps: [{ ...step, box: [1, 2, 3] }] }).success).toBe(false)
    expect(workCheckOutputSchema.safeParse({ ...good, steps: [{ ...step, box: [0, 0, 1000, 1000] }] }).success).toBe(true)
    expect(workCheckOutputSchema.safeParse({ ...good, uncertainty_codes: ['made_up'] }).success).toBe(false)
  })

  it('NoticeOutput requires an ISO date and a source line on every event', () => {
    const event = { title: 'Maths P1', subject: 'Maths', paper: 'P1', on_date: '2026-11-20', source_line: 'Maths P1: 20 Nov', confidence: 'high' }
    expect(noticeOutputSchema.safeParse({ events: [event], not_a_notice: false }).success).toBe(true)
    expect(noticeOutputSchema.safeParse({ events: [{ ...event, on_date: '20 Nov' }], not_a_notice: false }).success).toBe(false)
    expect(noticeOutputSchema.safeParse({ events: [{ ...event, confidence: 'medium' }], not_a_notice: false }).success).toBe(false)
  })

  it('ProfileCards has no field for a personality or learning-style label', () => {
    const keys = Object.keys(profileCardsSchema.shape)
    expect(keys).toEqual(['dream', 'subjects', 'hardest_subject', 'how_i_learn'])
    expect(profileCardsSchema.safeParse({ dream: null, subjects: [], hardest_subject: null, how_i_learn: null, learning_style: 'visual' }).success).toBe(false)
  })

  it('PlanOutput needs at least one evidence reference', () => {
    const cited = { text: 'Factorising needs one more go.', evidence_ids: ['e1'] }
    const plan = {
      gap_skill_tag: 'factorise-quadratic',
      learner_view: { tonight_step: cited, hint: 'Look for two numbers that multiply to the constant.', why_it_matters: cited },
      guardian_view: { gap: cited, one_action: cited, something_to_celebrate: cited },
      teacher_view: { who_shares_this_gap: cited, suggested_intervention: cited },
      evidence_event_ids: ['e1'],
      resource_ids: [],
    }
    expect(planOutputSchema.safeParse(plan).success).toBe(true)
    expect(planOutputSchema.safeParse({ ...plan, evidence_event_ids: [] }).success).toBe(false)
  })
})
