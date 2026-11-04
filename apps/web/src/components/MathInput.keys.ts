/**
 * The maths keypad's keys and the pure text edit each one makes (brief B15 §8). A key
 * inserts a TeX snippet: inside `$…$` it goes in bare; outside, it is wrapped in `$…$` so
 * everything downstream (`MathText`, the guide, the work check) already understands it.
 * `•` marks where the caret lands; `‣` a second slot the caret moves to when a selection
 * filled the first (select "1", tap fraction: `\frac{1}{|}`).
 */

export interface MathKey {
  id: string
  /** What the key shows. */
  label: string
  /** What a screen reader says. */
  aria: string
  snippet: string
}

export const MATH_KEYS: readonly MathKey[] = [
  { id: 'fraction', label: 'a⁄b', aria: 'Fraction', snippet: '\\frac{•}{‣}' },
  { id: 'power', label: 'xⁿ', aria: 'Power', snippet: '^{•}' },
  { id: 'square', label: 'x²', aria: 'Squared', snippet: 'x^{2}•' },
  { id: 'cube', label: 'x³', aria: 'Cubed', snippet: 'x^{3}•' },
  { id: 'sqrt', label: '√', aria: 'Square root', snippet: '\\sqrt{•}' },
  { id: 'nthroot', label: 'ⁿ√', aria: 'nth root', snippet: '\\sqrt[•]{‣}' },
  { id: 'subscript', label: 'x₂', aria: 'Subscript', snippet: '_{•}' },
  { id: 'brackets', label: '( )', aria: 'Brackets', snippet: '(•)' },
  { id: 'abs', label: '|x|', aria: 'Absolute value', snippet: '|•|' },
  { id: 'pi', label: 'π', aria: 'Pi', snippet: '\\pi{}•' },
  { id: 'theta', label: 'θ', aria: 'Theta', snippet: '\\theta{}•' },
  { id: 'e', label: 'e', aria: 'Euler’s number e', snippet: 'e•' },
  { id: 'pm', label: '±', aria: 'Plus or minus', snippet: '\\pm{}•' },
  { id: 'times', label: '×', aria: 'Times', snippet: '\\times{}•' },
  { id: 'divide', label: '÷', aria: 'Divided by', snippet: '\\div{}•' },
  { id: 'le', label: '≤', aria: 'Less than or equal to', snippet: '\\le{}•' },
  { id: 'ge', label: '≥', aria: 'Greater than or equal to', snippet: '\\ge{}•' },
  { id: 'ne', label: '≠', aria: 'Not equal to', snippet: '\\ne{}•' },
  { id: 'degree', label: '°', aria: 'Degrees', snippet: '^{\\circ}•' },
  { id: 'sin', label: 'sin', aria: 'Sine', snippet: '\\sin(•)' },
  { id: 'cos', label: 'cos', aria: 'Cosine', snippet: '\\cos(•)' },
  { id: 'tan', label: 'tan', aria: 'Tangent', snippet: '\\tan(•)' },
  { id: 'log', label: 'log', aria: 'Logarithm', snippet: '\\log(•)' },
  { id: 'ln', label: 'ln', aria: 'Natural logarithm', snippet: '\\ln(•)' },
]

/** True when position `at` sits inside an open `$…$` or `$$…$$` (an odd number of unescaped `$` before it). */
export function insideMaths(value: string, at: number): boolean {
  const before = value.slice(0, at).replace(/\\\$/g, '')
  const dollars = (before.match(/\$/g) ?? []).length
  return dollars % 2 === 1
}

export interface Edit {
  value: string
  caret: number
}

/**
 * Applies a key to `value` with the selection `[start, end)`. Pure. The selection (if any)
 * fills the first slot; the caret lands in the second slot when there is one, else after
 * the selection, else in the first slot.
 */
export function applyKey(value: string, start: number, end: number, key: MathKey): Edit {
  const from = Math.max(0, Math.min(start, end))
  const to = Math.min(value.length, Math.max(start, end))
  const selected = value.slice(from, to)
  const inside = insideMaths(value, from)

  let text = key.snippet
  const firstSlot = text.indexOf('•')
  let caretInSnippet: number
  if (selected.length > 0 && firstSlot !== -1) {
    text = text.replace('•', selected)
    const second = text.indexOf('‣')
    if (second !== -1) {
      caretInSnippet = second
      text = text.replace('‣', '')
    } else {
      caretInSnippet = firstSlot + selected.length
    }
  } else {
    caretInSnippet = firstSlot === -1 ? text.length : firstSlot
    text = text.replace('•', '').replace('‣', '')
  }

  const wrapped = inside ? text : `$${text}$`
  const offset = inside ? 0 : 1
  return {
    value: value.slice(0, from) + wrapped + value.slice(to),
    caret: from + offset + caretInSnippet,
  }
}
