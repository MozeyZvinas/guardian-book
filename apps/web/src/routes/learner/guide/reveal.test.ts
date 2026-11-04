import { describe, expect, it } from 'vitest'
import { answerVisible, initialReveal, reveal, stepState, type Reveal } from './reveal'

const total = 3
const run = (actions: Parameters<typeof reveal>[1][], from: Reveal = initialReveal) => actions.reduce((state, action) => reveal(state, action, total), from)

describe('the guide reveal (B15 §4)', () => {
  it('starts with step 1 current, the rest locked, and the answer hidden', () => {
    expect(stepState(initialReveal, 1)).toBe('current')
    expect(stepState(initialReveal, 2)).toBe('locked')
    expect(answerVisible(initialReveal, total)).toBe(false)
  })

  it('unlocks the next step only after the current one is shown', () => {
    const one = run([{ type: 'show-step' }])
    expect(stepState(one, 1)).toBe('done')
    expect(stepState(one, 2)).toBe('current')
    expect(stepState(one, 3)).toBe('locked')
    expect(answerVisible(one, total)).toBe(false)
  })

  it('shows the answer only after the last step', () => {
    const two = run([{ type: 'show-step' }, { type: 'show-step' }])
    expect(answerVisible(two, total)).toBe(false)
    const three = reveal(two, { type: 'show-step' }, total)
    expect(answerVisible(three, total)).toBe(true)
    expect(reveal(three, { type: 'show-step' }, total)).toEqual(three)
  })

  it('"Show the answer" asks first; the answer appears only on confirm', () => {
    const asked = run([{ type: 'ask-answer' }])
    expect(asked.confirming).toBe(true)
    expect(answerVisible(asked, total)).toBe(false)
    expect(answerVisible(reveal(asked, { type: 'keep-going' }, total), total)).toBe(false)
    const confirmed = reveal(asked, { type: 'confirm-answer' }, total)
    expect(answerVisible(confirmed, total)).toBe(true)
    expect(confirmed.confirming).toBe(false)
    // Showing a step while the confirm is open closes it.
    expect(reveal(asked, { type: 'show-step' }, total).confirming).toBe(false)
  })

  it('opens a hint on the current step, never on a locked one', () => {
    expect(run([{ type: 'hint', step: 1 }]).hints).toEqual([1])
    expect(run([{ type: 'hint', step: 2 }]).hints).toEqual([])
    expect(run([{ type: 'hint', step: 1 }, { type: 'hint', step: 1 }]).hints).toEqual([1])
    expect(run([{ type: 'show-step' }, { type: 'hint', step: 2 }]).hints).toEqual([2])
  })

  it('with no steps, nothing is visible and nothing changes', () => {
    expect(answerVisible(initialReveal, 0)).toBe(false)
    expect(reveal(initialReveal, { type: 'show-step' }, 0)).toEqual(initialReveal)
  })
})
