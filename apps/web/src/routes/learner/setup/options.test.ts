import { describe, expect, it } from 'vitest'
import { CAPS_FET_SUBJECTS, EMPTY_TAPS, chosenSubjects, composeAnswers, isBlank } from './options'

/** B16 §1: taps become the four answers the profile call already takes. */
describe('composeAnswers', () => {
  it('turns the taps into plain sentences, with the grade in "how I learn"', () => {
    const answers = composeAnswers({ grade: '12', subjects: ['Mathematics', 'Physical Sciences'], otherSubject: '', hardest: 'Mathematics', dream: 'be an engineer', learn: 'someone shows me an example' })
    expect(answers).toEqual({
      dream: 'One day I want to be an engineer.',
      subjects: 'Mathematics, Physical Sciences',
      hardestSubject: 'Mathematics',
      howILearn: 'I am in Grade 12. I learn best when someone shows me an example.',
    })
  })

  it('does not repeat "I want to" when the learner typed the whole sentence, and drops a stray full stop', () => {
    expect(composeAnswers({ ...EMPTY_TAPS, dream: 'One day I want to be a nurse.' }).dream).toBe('One day I want to be a nurse.')
    expect(composeAnswers({ ...EMPTY_TAPS, dream: 'i want to start a business!' }).dream).toBe('One day I want to start a business.')
  })

  it('keeps the hardest subject only when it is one of the chosen subjects', () => {
    expect(composeAnswers({ ...EMPTY_TAPS, subjects: ['History'], hardest: 'Mathematics' }).hardestSubject).toBe('')
    expect(composeAnswers({ ...EMPTY_TAPS, subjects: ['History'], hardest: 'History' }).hardestSubject).toBe('History')
  })

  it('adds an "Other" subject once, and says "rewriting matric" in words', () => {
    expect(chosenSubjects({ subjects: ['Tourism', 'Tourism'], otherSubject: ' Marine Sciences ' })).toEqual(['Tourism', 'Marine Sciences'])
    expect(composeAnswers({ ...EMPTY_TAPS, grade: 'rewriting' }).howILearn).toBe('I have finished school and I am rewriting matric.')
  })

  it('caps the subjects at the card limit and every answer at its length limit', () => {
    const all = chosenSubjects({ subjects: [...CAPS_FET_SUBJECTS], otherSubject: 'Other one' })
    expect(all).toHaveLength(12)
    const answers = composeAnswers({ ...EMPTY_TAPS, subjects: [...CAPS_FET_SUBJECTS], dream: 'x'.repeat(600) })
    for (const value of Object.values(answers)) expect(value.length).toBeLessThanOrEqual(500)
  })

  it('nothing tapped is blank, so setup can skip without a model call', () => {
    expect(isBlank(EMPTY_TAPS)).toBe(true)
    expect(isBlank({ ...EMPTY_TAPS, grade: '10' })).toBe(false)
  })
})
