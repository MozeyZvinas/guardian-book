import { describe, expect, it } from 'vitest'
import { MATH_KEYS, applyKey, insideMaths } from './MathInput.keys'

const key = (id: string) => {
  const found = MATH_KEYS.find((k) => k.id === id)
  if (!found) throw new Error(`no key ${id}`)
  return found
}

describe('the maths keypad', () => {
  it('has the keys the brief lists, each labelled for a screen reader', () => {
    const ids = MATH_KEYS.map((k) => k.id)
    for (const wanted of ['fraction', 'power', 'sqrt', 'nthroot', 'pi', 'pm', 'times', 'divide', 'le', 'ge', 'ne', 'brackets', 'abs', 'sin', 'cos', 'tan', 'log', 'ln', 'e', 'theta', 'degree', 'square', 'cube', 'subscript']) {
      expect(ids).toContain(wanted)
    }
    expect(MATH_KEYS.every((k) => k.aria.length > 0 && k.label.length > 0)).toBe(true)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('knows when the caret is inside maths', () => {
    expect(insideMaths('Solve $x^2', 10)).toBe(true)
    expect(insideMaths('Solve $x^2$ for', 12)).toBe(false)
    expect(insideMaths('costs \\$5 and $x', 15)).toBe(true)
    expect(insideMaths('', 0)).toBe(false)
  })

  it('wraps a key in $…$ outside maths and puts the caret in the first slot', () => {
    const edit = applyKey('between ', 8, 8, key('fraction'))
    expect(edit.value).toBe('between $\\frac{}{}$')
    expect(edit.caret).toBe('between $\\frac{'.length)
  })

  it('inserts bare TeX inside maths', () => {
    const edit = applyKey('$\\frac{1}{4}$', 1, 1, key('sqrt'))
    expect(edit.value).toBe('$\\sqrt{}\\frac{1}{4}$')
    expect(edit.caret).toBe('$\\sqrt{'.length)
  })

  it('fills the first slot with the selection and moves the caret to the second', () => {
    const edit = applyKey('$1$', 1, 2, key('fraction'))
    expect(edit.value).toBe('$\\frac{1}{}$')
    expect(edit.caret).toBe('$\\frac{1}{'.length)
    const sq = applyKey('x', 0, 1, key('sqrt'))
    expect(sq.value).toBe('$\\sqrt{x}$')
    expect(sq.caret).toBe('$\\sqrt{x'.length)
  })

  it('symbol keys leave the caret after the symbol, inside the maths, so typing carries on as maths', () => {
    const pi = applyKey('Area is ', 8, 8, key('pi'))
    expect(pi.value).toBe('Area is $\\pi{}$')
    expect(pi.caret).toBe('Area is $\\pi{}'.length)
    const sq = applyKey('$y = $', 5, 5, key('square'))
    expect(sq.value).toBe('$y = x^{2}$')
    expect(sq.caret).toBe('$y = x^{2}'.length)
    const deg = applyKey('$30$', 3, 3, key('degree'))
    expect(deg.value).toBe('$30^{\\circ}$')
  })

  it('every snippet is balanced and renders through $…$', () => {
    for (const k of MATH_KEYS) {
      const edit = applyKey('', 0, 0, k)
      expect(edit.value.startsWith('$') && edit.value.endsWith('$')).toBe(true)
      const opens = (edit.value.match(/\{/g) ?? []).length
      const closes = (edit.value.match(/\}/g) ?? []).length
      expect(opens, k.id).toBe(closes)
      expect(edit.value).not.toContain('•')
      expect(edit.value).not.toContain('‣')
      expect(edit.caret).toBeGreaterThanOrEqual(1)
      expect(edit.caret).toBeLessThan(edit.value.length)
    }
  })
})
