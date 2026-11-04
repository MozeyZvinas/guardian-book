/**
 * What the guide screen has revealed so far (brief B15 §4), as a pure reducer so the
 * rule "the answer only after the last step, or behind a confirm" has a test of its own.
 * One step at a time: step n is current once steps 1..n-1 have been shown; a hint may be
 * opened on the current step only; the next step unlocks when the current one is shown.
 */

export interface Reveal {
  /** How many steps have been shown in full (their worked line is visible). */
  shown: number
  /** Steps (1-based) whose hint is open. */
  hints: number[]
  /** The final answer is visible. */
  answer: boolean
  /** "Try the steps first?" is being asked. */
  confirming: boolean
}

export const initialReveal: Reveal = { shown: 0, hints: [], answer: false, confirming: false }

export type RevealAction =
  | { type: 'hint'; step: number }
  | { type: 'show-step' }
  | { type: 'ask-answer' }
  | { type: 'confirm-answer' }
  | { type: 'keep-going' }

export type StepState = 'done' | 'current' | 'locked'

export function stepState(state: Reveal, stepNo: number): StepState {
  if (stepNo <= state.shown) return 'done'
  if (stepNo === state.shown + 1) return 'current'
  return 'locked'
}

export function answerVisible(state: Reveal, totalSteps: number): boolean {
  return state.answer || (totalSteps > 0 && state.shown >= totalSteps)
}

export function reveal(state: Reveal, action: RevealAction, totalSteps: number): Reveal {
  switch (action.type) {
    case 'hint':
      // A hint opens on the current step (or stays open on a shown one); never on a locked step.
      if (stepState(state, action.step) === 'locked' || state.hints.includes(action.step)) return state
      return { ...state, hints: [...state.hints, action.step] }
    case 'show-step':
      if (state.shown >= totalSteps) return state
      return { ...state, shown: state.shown + 1, confirming: false }
    case 'ask-answer':
      if (answerVisible(state, totalSteps)) return state
      return { ...state, confirming: true }
    case 'confirm-answer':
      return { ...state, answer: true, confirming: false }
    case 'keep-going':
      return { ...state, confirming: false }
  }
}
