import { describe, expect, it } from 'vitest'
import { containsTerm, containsValue, guardedNumbers, median, normaliseMaths, sentences, squash, stripStructuralNumbers, tokenOverlap, wordCount } from './text.js'

describe('text helpers', () => {
  it('normaliseMaths unifies signs, spacing and case', () => {
    expect(normaliseMaths('X = −3')).toBe('x=-3')
    expect(normaliseMaths('( x - 2 ) ( x - 3 ) = 0')).toBe('(x-2)(x-3)=0')
    expect(normaliseMaths('2 × 3   ÷ 4')).toBe('2*3/4')
    expect(squash('x = 2  or  x = 3')).toBe('x=2orx=3')
  })

  it('containsValue needs whole tokens', () => {
    expect(containsValue('the root is 3', '3')).toBe(true)
    expect(containsValue('the root is 30', '3')).toBe(false)
    expect(containsValue('the root is 3.5', '3')).toBe(false)
    expect(containsValue('the root is 2.3', '3')).toBe(false)
    expect(containsValue('the root is 0,3', '3')).toBe(false)
    expect(containsValue('the root is 3.', '3')).toBe(true)
    expect(containsValue('x=3 here', 'x=3')).toBe(true)
    expect(containsValue('so x=3.', 'x=3')).toBe(true)
    expect(containsValue('anything', '')).toBe(false)
  })

  it('containsTerm matches multi-word terms on word boundaries', () => {
    expect(containsTerm('Mood swings aside', 'mood')).toBe(true)
    expect(containsTerm('moody', 'mood')).toBe(false)
    expect(containsTerm('a visual  learner', 'visual learner')).toBe(true)
    expect(containsTerm('add it up', 'adhd')).toBe(false)
  })

  it('sentences, wordCount and median', () => {
    expect(sentences('One two. Three four five! Six?\nSeven')).toEqual(['One two.', 'Three four five!', 'Six?', 'Seven'])
    expect(wordCount('One two three.')).toBe(3)
    expect(wordCount('- -')).toBe(0)
    expect(median([])).toBe(0)
    expect(median([5])).toBe(5)
    expect(median([1, 9, 3])).toBe(3)
    expect(median([1, 2, 3, 4])).toBe(2.5)
  })

  it('tokenOverlap is the share of needle tokens present', () => {
    expect(tokenOverlap('subtract six from both sides', 'you subtract six from the left')).toBe(0.6)
    expect(tokenOverlap('', 'anything')).toBe(0)
  })

  it('guardedNumbers keeps multi-character numbers and digits other than 0 and 1', () => {
    expect(guardedNumbers('x = 2 or x = 3')).toEqual(['2', '3'])
    expect(guardedNumbers('x = 0 or x = 1')).toEqual([])
    expect(guardedNumbers('x = -2.5 or 10')).toEqual(['-2.5', '10'])
  })

  it('stripStructuralNumbers drops step, line and mark references', () => {
    expect(stripStructuralNumbers(normaliseMaths('Check step 3, line 2 and question 1 for 2 marks'))).toBe('check step, line and question for marks')
  })
})
