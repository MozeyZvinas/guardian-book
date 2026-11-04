import { describe, expect, it } from 'vitest'
import { hasMath, normaliseMath, segments, wrapBareTex } from './MathText.logic'

/** B16 §4: pasted `\( … \)`, `\[ … \]` and bare `\frac{a}{b}` render; no raw backslash reaches a learner. */
describe('normaliseMath', () => {
  it('turns \\( … \\) into inline maths and \\[ … \\] into display maths', () => {
    expect(normaliseMath('Add \\(\\frac{1}{4}\\) and \\(\\frac{7}{8}\\).')).toBe('Add $\\frac{1}{4}$ and $\\frac{7}{8}$.')
    expect(normaliseMath('Solve \\[x^2 - 5x + 6 = 0\\] first.')).toBe('Solve $$x^2 - 5x + 6 = 0$$ first.')
  })

  it('trims inside the delimiters and joins a multi-line expression onto one line', () => {
    expect(normaliseMath('\\( x = 2 \\)')).toBe('$x = 2$')
    expect(normaliseMath('\\(a\n  + b\\)')).toBe('$a + b$')
    expect(normaliseMath('empty \\( \\) here')).toBe('empty  here')
  })

  it('wraps bare commands, keeping sentence punctuation outside the maths', () => {
    expect(normaliseMath('Add \\frac{1}{4} and \\frac{7}{8}.')).toBe('Add $\\frac{1}{4}$ and $\\frac{7}{8}$.')
    expect(normaliseMath('\\frac{1}{4}+\\frac{7}{8}')).toBe('$\\frac{1}{4}+\\frac{7}{8}$')
    expect(normaliseMath('so \\sqrt{x + 1}, then \\pi.')).toBe('so $\\sqrt{x + 1}$, then $\\pi$.')
    expect(normaliseMath('x=\\frac{-b\\pm\\sqrt{b^2-4ac}}{2a}')).toBe('$x=\\frac{-b\\pm\\sqrt{b^2-4ac}}{2a}$')
  })

  it('leaves text already in $…$ alone, and text with no backslash untouched', () => {
    expect(normaliseMath('Factorise $x^2 - 5x + 6$ fully.')).toBe('Factorise $x^2 - 5x + 6$ fully.')
    expect(normaliseMath('It costs $5 and $10 today.')).toBe('It costs $5 and $10 today.')
    expect(normaliseMath('Already $\\frac{1}{2}$ here.')).toBe('Already $\\frac{1}{2}$ here.')
  })

  it('handles the three forms mixed in one string', () => {
    expect(normaliseMath('Use \\(x=2\\) in $y=x^2$ and \\frac{a}{b}')).toBe('Use $x=2$ in $y=x^2$ and $\\frac{a}{b}$')
  })

  it('never leaves a command in a text segment', () => {
    const samples = ['\\frac{1}{4}', 'see \\(\\frac{1}{4}\\) and \\sqrt{2}', 'a \\[\\int_0^1 x\\,dx\\] b', '\\alpha+\\beta=\\gamma, ok?', 'Then \\frac{1}{2}\\times\\frac{3}{4}.']
    for (const sample of samples) {
      const out = normaliseMath(sample)
      expect(hasMath(out), sample).toBe(true)
      for (const segment of segments(out)) {
        if (segment.kind === 'text') expect(segment.text, `${sample} → ${out}`).not.toMatch(/\\[a-zA-Z]/)
      }
    }
  })
})

describe('wrapBareTex', () => {
  it('leaves ordinary words alone', () => {
    expect(wrapBareTex('no maths here, just words.')).toBe('no maths here, just words.')
  })
})
