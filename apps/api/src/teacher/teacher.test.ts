import { describe, expect, it } from 'vitest'
import { originAfterApproval, originForFeedback, publicOriginLabel } from '@guardian-book/shared'
import { PromptSafetyError } from '../gateway/promptSafety.js'
import { buildNoteUser } from '../notes/notePrompt.v1.js'
import { citedEventIds, weekSummary } from '../notes/service.js'
import { eventSkillOutcome, repeatedSkills, reviewEvidencePayload, sharedGaps, skillOutcomes, type AttemptOutcome } from './outcomes.js'
import { sortQueue } from './queue.js'
import { buildReviewSteps } from './review.js'
import { sastDatePlus, weekStartSast } from './week.js'

const step = (stepNo: number, skillTag: string, awarded: number, available = 1, criterion = `step ${stepNo}`) => ({ stepId: `s${stepNo}`, stepNo, criterion, skillTag, awarded, available })

const outcome = (learnerId: string, at: string, steps: AttemptOutcome['steps'], extra: Partial<AttemptOutcome> = {}): AttemptOutcome => ({
  attemptId: `a-${learnerId}-${at}`,
  learnerId,
  itemId: 'item-1',
  itemSlug: 'alg-12-factorise-trinomial',
  itemTopic: 'Algebra: equations',
  mode: 'assisted',
  basis: 'model_high',
  occurredAt: new Date(at),
  steps,
  ...extra,
})

describe('trusted outcomes → skills, gaps, repeats', () => {
  it('a skill is lost when any of its steps lost a mark; correct only when every step was full', () => {
    const steps = [step(1, 'factorise', 1), step(2, 'factorise', 0), step(3, 'solve', 1), step(4, 'solve', 1)]
    expect(skillOutcomes(steps)).toEqual({ correct: ['solve'], lost: ['factorise'] })
    expect(reviewEvidencePayload(steps, 'independent', { review_id: 'r1' })).toEqual({ review_id: 'r1', skills_correct: ['solve'], skills_lost: ['factorise'], mode: 'independent' })
  })

  it('shared gaps count learners by their LATEST result on the skill, with the step most often lost as the example', () => {
    const outcomes = [
      outcome('L1', '2026-11-02T08:00:00Z', [step(1, 'factorise', 1), step(2, 'solve', 0)]),
      outcome('L2', '2026-11-02T09:00:00Z', [step(1, 'factorise', 0), step(2, 'solve', 0)]),
      outcome('L2', '2026-11-03T09:00:00Z', [step(1, 'factorise', 1), step(2, 'solve', 0)]), // L2 fixed factorising
      outcome('L3', '2026-11-03T10:00:00Z', [step(1, 'factorise', 1), step(2, 'solve', 1)]),
      outcome('X9', '2026-11-03T10:00:00Z', [step(1, 'factorise', 0), step(2, 'solve', 0)]), // not a member
    ]
    const gaps = sharedGaps(outcomes, ['L1', 'L2', 'L3', 'L4'])
    expect(gaps).toEqual([
      { skillTag: 'solve', learners: 2, of: 4, learnerIds: ['L1', 'L2'], example: { itemSlug: 'alg-12-factorise-trinomial', itemTopic: 'Algebra: equations', stepNo: 2, criterion: 'step 2' } },
    ])
  })

  it('repeated skills: lost on two or more attempts', () => {
    const mine = [
      outcome('L2', '2026-11-02T09:00:00Z', [step(1, 'factorise', 0), step(2, 'solve', 0)]),
      outcome('L2', '2026-11-03T09:00:00Z', [step(1, 'factorise', 1), step(2, 'solve', 0)]),
    ]
    expect(repeatedSkills(mine)).toEqual(['solve'])
  })

  it('reads a skill outcome out of an event as the reducer does: either payload shape, mode by kind, never from basis none', () => {
    expect(eventSkillOutcome({ kind: 'retention_check_completed', basis: 'model_high', skillTag: 'solve', payload: { correct: true } }, 'solve')).toEqual({ correct: true, mode: 'retention' })
    expect(eventSkillOutcome({ kind: 'review_released', basis: 'teacher_confirmed', skillTag: null, payload: { skills_lost: ['solve'], skills_correct: ['factorise'], mode: 'assisted' } }, 'solve')).toEqual({ correct: false, mode: 'assisted' })
    expect(eventSkillOutcome({ kind: 'assessed', basis: 'model_high', skillTag: 'solve', payload: { skills_lost: ['solve'] } }, 'factorise')).toBeNull()
    expect(eventSkillOutcome({ kind: 'assessed', basis: 'none', skillTag: 'solve', payload: { correct: false } }, 'solve')).toBeNull()
    expect(eventSkillOutcome({ kind: 'intervention_assigned', basis: 'none', skillTag: 'solve', payload: {} }, 'solve')).toBeNull()
  })
})

describe('the review', () => {
  const guideline = [
    { id: 's1', stepNo: 1, marks: 1, skillTag: 'factorise' },
    { id: 's2', stepNo: 2, marks: 2, skillTag: 'solve' },
  ]
  const proposal = [{ step_id: 's1', step_no: 1, skill_tag: 'factorise', awarded: 1, available: 1, confidence: 'high' as const, evidence: 'quoted', feedback: 'Correct.', misconception_tag: null, hint: null, box: null }]

  it('builds the stored steps over the guideline, copying the proposal’s words, with the teacher’s award', () => {
    const built = buildReviewSteps(guideline, proposal, [
      { stepId: 's2', awarded: 1 },
      { stepId: 's1', awarded: 0 },
    ])
    expect(built.total).toBe(1)
    expect(built.steps.map((s) => [s.step_no, s.awarded, s.available, s.evidence])).toEqual([
      [1, 0, 1, 'quoted'],
      [2, 1, 2, ''],
    ])
  })

  it('refuses a missing, duplicate, unknown or over-marked step', () => {
    expect(() => buildReviewSteps(guideline, proposal, [{ stepId: 's1', awarded: 1 }])).toThrow(/every step/i)
    expect(() => buildReviewSteps(guideline, proposal, [{ stepId: 's1', awarded: 1 }, { stepId: 's1', awarded: 1 }, { stepId: 's2', awarded: 0 }])).toThrow(/once/)
    expect(() => buildReviewSteps(guideline, proposal, [{ stepId: 's1', awarded: 1 }, { stepId: 's2', awarded: 3 }])).toThrow(/2 mark/)
    expect(() => buildReviewSteps(guideline, proposal, [{ stepId: 's1', awarded: 1 }, { stepId: 's2', awarded: 1 }, { stepId: 's9', awarded: 0 }])).toThrow(/Unknown/)
  })

  it('queue order: unreviewed uncertain, then proposed, then the rest; confirmed, then released; newest first within a group', () => {
    const row = (attemptId: string, status: 'uncertain' | 'proposed' | 'failed' | 'assessing' | 'submitted', createdAt: string, review: { id: string; state: 'confirmed' | 'released'; total: number } | null = null) => ({
      attemptId,
      learner: { id: '019a0b02-0000-7000-8000-000000000101', nickname: 'L' },
      itemId: '019a0b02-0000-7000-8000-000000000f01',
      itemSlug: 'x',
      itemTopic: 'x',
      kind: 'typed' as const,
      mode: 'assisted' as const,
      status,
      proposedTotal: null,
      maxMarks: 4,
      review,
      createdAt,
    })
    const sorted = sortQueue([
      row('released', 'proposed', '2026-11-03T10:00:00Z', { id: 'r', state: 'released', total: 3 }),
      row('old-proposed', 'proposed', '2026-11-01T10:00:00Z'),
      row('confirmed', 'uncertain', '2026-11-03T11:00:00Z', { id: 'r2', state: 'confirmed', total: 3 }),
      row('new-proposed', 'proposed', '2026-11-03T10:00:00Z'),
      row('running', 'assessing', '2026-11-03T12:00:00Z'),
      row('uncertain', 'uncertain', '2026-11-02T10:00:00Z'),
    ])
    expect(sorted.map((r) => r.attemptId)).toEqual(['uncertain', 'new-proposed', 'old-proposed', 'running', 'confirmed', 'released'])
  })

  it('origins: feedback kinds and note approval', () => {
    expect(originForFeedback('agree')).toBe('teacher_approved')
    expect(originForFeedback('correct')).toBe('teacher_revised')
    expect(originForFeedback('add')).toBe('teacher_added')
    expect(originAfterApproval('ai_suggested', 'Hello there.', 'Hello there. ')).toBe('teacher_approved')
    expect(originAfterApproval('ai_suggested', 'Hello there.', 'Hello, there.')).toBe('teacher_revised')
    expect(originAfterApproval('teacher_added', 'Mine.', 'Mine, edited.')).toBe('teacher_added')
    expect(publicOriginLabel('teacher_approved', 'Ms Dlamini')).toBe('Teacher-reviewed')
    expect(publicOriginLabel('teacher_revised', 'Ms Dlamini')).toBe('Teacher-reviewed')
    expect(publicOriginLabel('teacher_added', 'Ms Dlamini')).toBe('From Ms Dlamini')
    expect(publicOriginLabel('ai_suggested', 'Ms Dlamini')).not.toMatch(/teacher/i)
  })
})

describe('notes home', () => {
  it('the week starts on Monday 00:00 SAST', () => {
    expect(weekStartSast(new Date('2026-11-04T10:00:00Z')).toISOString()).toBe('2026-11-01T22:00:00.000Z') // Mon 2 Nov 00:00 SAST
    expect(weekStartSast(new Date('2026-11-01T22:30:00Z')).toISOString()).toBe('2026-11-01T22:00:00.000Z') // just after midnight SAST on Monday
    expect(weekStartSast(new Date('2026-11-01T21:30:00Z')).toISOString()).toBe('2026-10-25T22:00:00.000Z') // still Sunday in SAST
    expect(sastDatePlus(new Date('2026-11-04T23:30:00Z'), 2)).toBe('2026-11-07')
  })

  it('the week summary carries counts, plain skill words and evidence results, and nothing about the person', () => {
    const mine = [outcome('L1', '2026-11-03T09:00:00Z', [step(1, 'factorise-trinomial', 1), step(2, 'solve-quadratic-by-factors', 0, 1, 'Both solutions stated.')])]
    const summary = weekSummary(mine, [{ id: '019a0b02-0000-7000-8000-00000000e001', kind: 'assessed', attemptId: mine[0]!.attemptId }], '2026-11-02')
    expect(summary).toEqual({
      week_start: '2026-11-02',
      attempts: 1,
      steps_found: 1,
      steps_lost: 1,
      topics: ['Algebra: equations'],
      lost_steps: [{ skill: 'Solve quadratic by factors', step: 'Both solutions stated.', topic: 'Algebra: equations', times: 1 }],
      found_skills: ['Factorise trinomial'],
      evidence: [{ id: 'E1', kind: 'assessed', result: 'lost' }],
    })
    const user = buildNoteUser(summary)
    expect(user).toContain('<<<EVIDENCE\nE1 · assessed · lost\nEVIDENCE>>>')
    expect(user).not.toMatch(/name|email|guardian|019a0b02/i)
    expect(citedEventIds(['E1', 'E9', 'E1'], [{ id: '019a0b02-0000-7000-8000-00000000e001' }])).toEqual(['019a0b02-0000-7000-8000-00000000e001'])
  })

  it('the prompt builder refuses contact details and forbidden keys', () => {
    const base = weekSummary([], [], '2026-11-02')
    expect(() => buildNoteUser({ ...base, topics: ['call 011 555 1234 56'] })).toThrow(PromptSafetyError)
    expect(() => buildNoteUser({ ...base, topics: ['mail me@example.com'] })).toThrow(PromptSafetyError)
    // A forbidden key anywhere in the structure is a bug upstream, not something to filter.
    expect(() => buildNoteUser({ ...base, ...({ learner_name: 'x' } as object) })).toThrow(PromptSafetyError)
  })
})
