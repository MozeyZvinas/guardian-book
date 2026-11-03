import { describe, expect, it } from 'vitest'
import { evidencePayload, outcomesOf } from '@guardian-book/shared'
import { assessedSkills } from './service.js'

/** The `assessed` event's payload is the shape B05's reducer reads (D37). */
describe('assessedSkills', () => {
  const step = (skill_tag: string, awarded: number, available = 1) => ({ skill_tag, awarded, available })

  it('lists fully earned tags and tags of steps that lost marks, once each, in step order', () => {
    const steps = [step('factorise-trinomial', 1), step('factorise-trinomial', 0), step('solve-quadratic-by-factors', 1), step('solve-quadratic-by-factors', 1)]
    expect(assessedSkills(steps)).toEqual({ skillsCorrect: ['factorise-trinomial', 'solve-quadratic-by-factors'], skillsLost: ['factorise-trinomial'] })
  })

  it('a partly earned step is a lost one; no steps means nothing to count', () => {
    expect(assessedSkills([step('discriminant', 1, 2)])).toEqual({ skillsCorrect: [], skillsLost: ['discriminant'] })
    expect(assessedSkills([])).toEqual({ skillsCorrect: [], skillsLost: [] })
  })

  it('reads back through the reducer: a tag lost on one step counts as lost even when earned on another', () => {
    const { skillsCorrect, skillsLost } = assessedSkills([step('factorise-trinomial', 1), step('factorise-trinomial', 0), step('solve-quadratic-by-factors', 1)])
    const outcomes = outcomesOf({
      id: 'e1',
      kind: 'assessed',
      attemptId: 'a1',
      itemId: 'i1',
      skillTag: skillsLost[0] ?? null,
      basis: 'model_high',
      payload: evidencePayload({ skills_correct: skillsCorrect, skills_lost: skillsLost, mode: 'assisted' }, { status: 'proposed', total: 2 }),
      occurredAt: new Date('2026-11-04T08:00:00Z'),
    })
    expect(outcomes).toEqual([
      { skillTag: 'solve-quadratic-by-factors', correct: true, mode: 'assisted', sure: null },
      { skillTag: 'factorise-trinomial', correct: false, mode: 'assisted', sure: null },
    ])
  })
})
