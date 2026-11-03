import type { PlanOutput } from '@guardian-book/shared'
import { describe, expect, it } from 'vitest'
import type { PlanContext } from '../types.js'
import { CLASSIFY_RULES, NOTE_RULES, PROFILE_CARDS_RULES, planEvidenceRefs, planInferenceForbidden, planPlainLanguage, resourceUnvetted, stepsExceeded, toolUnknown } from './plan.js'

const cited = (text: string, evidence_ids: string[] = ['ev-1']) => ({ text, evidence_ids })

const plan = (overrides: Partial<PlanOutput> = {}): PlanOutput => ({
  gap_skill_tag: 'factorise-quadratic',
  learner_view: {
    tonight_step: cited('Redo question 2 and set each bracket to zero.'),
    hint: 'Look for two numbers that multiply to the constant.',
    why_it_matters: cited('Factorising comes up in every paper.'),
  },
  guardian_view: {
    gap: cited('Factorising needs one more go.'),
    one_action: cited('Ask them to teach you step 2 in ten minutes.'),
    something_to_celebrate: cited('Three questions done this week without help.'),
  },
  teacher_view: {
    who_shares_this_gap: cited('Four learners in 12A share this gap.', ['ev-1', 'ev-2']),
    suggested_intervention: cited('A ten-minute starter on factorising.'),
  },
  evidence_event_ids: ['ev-1', 'ev-2'],
  resource_ids: ['res-1'],
  ...overrides,
})

const context: PlanContext = {
  knownEvidenceIds: ['ev-1', 'ev-2', 'ev-3'],
  vettedResourceIds: ['res-1', 'res-2'],
  allowedTools: ['read_evidence', 'read_calendar', 'read_profile', 'list_resources'],
  maxSteps: 8,
  trace: [{ tool: 'read_evidence' }, { tool: 'list_resources' }],
}

describe('EVIDENCE_REF_UNKNOWN', () => {
  it('passes when every statement cites known evidence', () => {
    expect(planEvidenceRefs(plan(), context).passed).toBe(true)
  })
  it('fails on an unknown ID or an uncited statement', () => {
    const bad = plan({ guardian_view: { ...plan().guardian_view, gap: cited('Gap.', ['ev-9']), one_action: cited('Do it.', []) } })
    const result = planEvidenceRefs(bad, context)
    expect(result.passed).toBe(false)
    expect(result.detail).toContain('guardian_view.gap cites unknown evidence ev-9')
    expect(result.detail).toContain('guardian_view.one_action cites no evidence')
  })
})

describe('RESOURCE_UNVETTED', () => {
  it('fails on a resource outside the vetted list', () => {
    const result = resourceUnvetted(plan({ resource_ids: ['res-1', 'youtube-xyz'] }), context)
    expect(result.passed).toBe(false)
    expect(result.detail).toContain('youtube-xyz')
  })
  it('passes with vetted or no resources', () => {
    expect(resourceUnvetted(plan(), context).passed).toBe(true)
    expect(resourceUnvetted(plan({ resource_ids: [] }), context).passed).toBe(true)
  })
})

describe('PLAIN_LANGUAGE_FAIL', () => {
  it('passes short, jargon-free guardian text', () => {
    const result = planPlainLanguage(plan())
    expect(result.passed).toBe(true)
    expect(result.detail).toContain('median sentence')
  })
  it('fails when the median sentence runs past 18 words', () => {
    const long = 'This week your child worked through a number of factorising questions and found that the second bracket was the part that kept going wrong each time.'
    const bad = plan({ guardian_view: { gap: cited(long), one_action: cited(long), something_to_celebrate: cited(long) } })
    const result = planPlainLanguage(bad)
    expect(result.passed).toBe(false)
    expect(result.detail).toContain('median sentence is')
  })
  it('fails on jargon', () => {
    const bad = plan({ guardian_view: { ...plan().guardian_view, gap: cited('A misconception about factorising remains.') } })
    const result = planPlainLanguage(bad)
    expect(result.passed).toBe(false)
    expect(result.detail).toContain('misconception')
  })
  it('does not judge the learner or teacher views', () => {
    const out = plan({ teacher_view: { ...plan().teacher_view, suggested_intervention: cited('Address the misconception with a formative task.') } })
    expect(planPlainLanguage(out).passed).toBe(true)
  })
})

describe('INFERENCE_FORBIDDEN (plan)', () => {
  it('fails on a learning-style label anywhere in the views', () => {
    const bad = plan({ learner_view: { ...plan().learner_view, why_it_matters: cited('As a visual learner you will like diagrams.') } })
    const result = planInferenceForbidden(bad)
    expect(result.passed).toBe(false)
    expect(result.detail).toContain('visual learner')
  })
  it('passes the good plan', () => {
    expect(planInferenceForbidden(plan()).passed).toBe(true)
  })
})

describe('TOOL_UNKNOWN', () => {
  it('fails when the agent trace used a tool outside the allowed list', () => {
    const result = toolUnknown(plan(), { ...context, trace: [{ tool: 'read_evidence' }, { tool: 'web_search' }] })
    expect(result.passed).toBe(false)
    expect(result.detail).toContain('web_search')
  })
  it('passes an allowed trace', () => {
    expect(toolUnknown(plan(), context).passed).toBe(true)
  })
})

describe('STEPS_EXCEEDED', () => {
  it('fails past the step limit', () => {
    const trace = Array.from({ length: 9 }, () => ({ tool: 'read_evidence' }))
    const result = stepsExceeded(plan(), { ...context, trace })
    expect(result.passed).toBe(false)
    expect(result.detail).toContain('9 steps')
  })
  it('passes at the limit', () => {
    const trace = Array.from({ length: 8 }, () => ({ tool: 'read_evidence' }))
    expect(stepsExceeded(plan(), { ...context, trace }).passed).toBe(true)
  })
})

describe('note, profile card and classify rule sets', () => {
  const run = (rules: Array<{ code: string; run: (o: never, c: never) => { passed: boolean; detail: string } }>, output: unknown, ctx: unknown) =>
    rules.map((rule) => ({ code: rule.code, ...rule.run(output as never, ctx as never) }))

  it('a note must cite known evidence, read plainly and infer nothing', () => {
    const good = run(NOTE_RULES, { text: 'This week the factorising step went wrong twice. Ten minutes on it at home would help.', evidence_event_ids: ['ev-1'] }, { knownEvidenceIds: ['ev-1'] })
    expect(good.every((r) => r.passed)).toBe(true)
    const bad = run(NOTE_RULES, { text: 'Your child seems depressed about the rubric.', evidence_event_ids: ['ev-9'] }, { knownEvidenceIds: ['ev-1'] })
    expect(bad.map((r) => [r.code, r.passed])).toEqual([
      ['EVIDENCE_REF_UNKNOWN', false],
      ['PLAIN_LANGUAGE_FAIL', false],
      ['INFERENCE_FORBIDDEN', false],
    ])
  })

  it('profile cards may not carry a learning-style or personality label', () => {
    const bad = run(PROFILE_CARDS_RULES, { dream: 'Engineer', subjects: ['Maths'], hardest_subject: 'Maths', how_i_learn: 'I am a kinesthetic learner with an introverted personality.' }, {})
    expect(bad[0]?.passed).toBe(false)
    const good = run(PROFILE_CARDS_RULES, { dream: 'Engineer', subjects: ['Maths'], hardest_subject: 'Maths', how_i_learn: 'Worked examples first, then practice.' }, {})
    expect(good[0]?.passed).toBe(true)
  })

  it('a low-confidence classification abstains (non-retryable)', () => {
    expect(CLASSIFY_RULES[0]?.retryable).toBe(false)
    expect(run(CLASSIFY_RULES, { kind: 'work', confidence: 'low', reason: 'Unclear.' }, {})[0]?.passed).toBe(false)
    expect(run(CLASSIFY_RULES, { kind: 'work', confidence: 'medium', reason: 'Working shown.' }, {})[0]?.passed).toBe(true)
  })
})
