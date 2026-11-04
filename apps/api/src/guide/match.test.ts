import { describe, expect, it } from 'vitest'
import { matchBankItem, mathsOf, questionMatches } from './match.js'

const quadratic = { id: 'q1', promptMd: 'Solve for $x$:\n\n$$x^2 - 5x + 6 = 0$$' }
const roots = { id: 'q2', promptMd: 'For which value of $k$ does $x^2 + 6x + k = 0$ have equal roots?' }
const words = { id: 'w1', promptMd: 'Explain why a square is also a rectangle.' }

describe('mathsOf', () => {
  it('lists the maths in an item, longest first, squashed', () => {
    expect(mathsOf(quadratic.promptMd)).toEqual(['x^2-5x+6=0', 'x'])
    expect(mathsOf(words.promptMd)).toEqual([])
  })
})

describe('questionMatches', () => {
  it('matches a read-back that carries the item’s equation, however it is laid out', () => {
    expect(questionMatches('Solve for $x$: $x^2 - 5x + 6 = 0$', quadratic.promptMd)).toBe(true)
    expect(questionMatches('Solve $$x^{2} − 5x + 6 = 0$$', quadratic.promptMd)).toBe(false) // braces differ: a stricter miss, never a false link
    expect(questionMatches('Solve $$x^2 − 5x + 6 = 0$$', quadratic.promptMd)).toBe(true)
  })
  it('does not match a different equation or a different question on the same topic', () => {
    expect(questionMatches('Solve for $x$: $x^2 + x - 12 = 0$', quadratic.promptMd)).toBe(false)
    expect(questionMatches('Find two rational numbers between $\\frac{1}{4}$ and $\\frac{7}{8}$.', quadratic.promptMd)).toBe(false)
    expect(questionMatches('For which $k$ is the discriminant zero?', roots.promptMd)).toBe(false)
  })
  it('matches a wordy item on its words', () => {
    expect(questionMatches('Explain why a square is also a rectangle.', words.promptMd)).toBe(true)
    expect(questionMatches('Explain why a rhombus is a parallelogram.', words.promptMd)).toBe(false)
  })
})

describe('matchBankItem', () => {
  it('returns the first matching item, else null', () => {
    expect(matchBankItem('Solve $x^2 - 5x + 6 = 0$', [roots, quadratic, words])?.id).toBe('q1')
    expect(matchBankItem('What is $2 + 2$?', [roots, quadratic, words])).toBeNull()
    expect(matchBankItem('', [quadratic])).toBeNull()
  })
})
