/**
 * The pure half of `MathText` (no React): where the maths is in a string, and the
 * normaliser (B16) that turns what a learner or another app pasted into the `$…$` form
 * KaTeX is given: `\( … \)`, `\[ … \]`, and bare commands such as `\frac{1}{4}` with no
 * delimiters at all. A learner never sees a raw backslash.
 */

/**
 * `$$…$$` anywhere; `$…$` only when the delimiters hug the expression (no space inside)
 * and the closer is not followed by a digit (pandoc's rule), so "costs $5 and $10" stays text.
 */
export const MATH_PATTERN = /\$\$([\s\S]+?)\$\$|\$(?!\s)([^$\n]+?)(?<!\s)\$(?!\d)/

export function hasMath(text: string): boolean {
  return MATH_PATTERN.test(text)
}

export type Segment = { kind: 'text'; text: string } | { kind: 'math'; tex: string; display: boolean }

/** Splits text into plain and maths segments; a lone or unmatched `$` stays as text. */
export function segments(text: string): Segment[] {
  const out: Segment[] = []
  const pattern = new RegExp(MATH_PATTERN.source, 'g')
  let last = 0
  for (const match of text.matchAll(pattern)) {
    const start = match.index
    if (start > last) out.push({ kind: 'text', text: text.slice(last, start) })
    if (match[1] !== undefined) out.push({ kind: 'math', tex: match[1], display: true })
    else if (match[2] !== undefined) out.push({ kind: 'math', tex: match[2], display: false })
    last = start + match[0].length
  }
  if (last < text.length) out.push({ kind: 'text', text: text.slice(last) })
  return out
}

// A TeX command with its brace arguments (one level of nesting, spaces allowed inside):
// `\frac{1}{4}`, `\sqrt{x + 1}`, `\pi`.
const BRACE_GROUP = String.raw`\{(?:[^{}]|\{[^{}]*\})*\}`
const COMMAND = String.raw`\\[a-zA-Z]+(?:${BRACE_GROUP})*`
// A run of non-space characters that holds at least one command: `\frac{1}{4}+\frac{7}{8}`.
const BARE_RUN = new RegExp(String.raw`(?:${COMMAND}|[^\s\\$])*${COMMAND}(?:${COMMAND}|[^\s\\$])*`, 'g')
const TRAILING_PUNCTUATION = /^([\s\S]*?)([.,;:!?]*)$/

/** Wraps each bare TeX run in `$…$`, leaving sentence punctuation outside. */
export function wrapBareTex(text: string): string {
  return text.replace(BARE_RUN, (run) => {
    const parts = TRAILING_PUNCTUATION.exec(run)
    const core = parts?.[1] ?? run
    const tail = parts?.[2] ?? ''
    return core.length === 0 ? run : `$${core}$${tail}`
  })
}

const oneLine = (tex: string): string => tex.trim().replace(/\s+/g, ' ')

/**
 * `\( … \)` → `$…$`, `\[ … \]` → `$$…$$`, then any bare command outside maths is wrapped.
 * Text already in `$…$` is left exactly as it was. Text with no backslash is returned as is.
 */
export function normaliseMath(text: string): string {
  if (!text.includes('\\')) return text
  const delimited = text
    .replace(/\\\[([\s\S]*?)\\\]/g, (_match, tex: string) => (oneLine(tex) ? `$$${oneLine(tex)}$$` : ''))
    .replace(/\\\(([\s\S]*?)\\\)/g, (_match, tex: string) => (oneLine(tex) ? `$${oneLine(tex)}$` : ''))
  return segments(delimited)
    .map((segment) => {
      if (segment.kind === 'math') return segment.display ? `$$${segment.tex}$$` : `$${segment.tex}$`
      return wrapBareTex(segment.text)
    })
    .join('')
}
