import { lazy, Suspense, type ElementType } from 'react'

/**
 * MathText (D37: `katex` for maths on screen). Renders a string whose maths is written
 * TeX-style between `$…$` (inline) or `$$…$$` (display) through KaTeX; everything else is
 * plain text, never HTML. KaTeX (about 75 KB gzipped plus its CSS and fonts) is loaded
 * only when a string actually contains maths, so the shell and the route chunks stay
 * inside spec 06 §6's budget; until it arrives, the source text shows as written.
 *
 * Use it wherever an item prompt, a guideline criterion or a hint reaches the screen.
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

const KatexText = lazy(() => import('./MathTextKatex').then((m) => ({ default: m.MathTextKatex })))

export interface MathTextProps {
  text: string
  /** The wrapping element; `span` by default so it sits inside any paragraph or label. */
  as?: ElementType
  className?: string
}

export function MathText({ text, as: Tag = 'span', className }: MathTextProps) {
  if (!hasMath(text)) return <Tag className={className}>{text}</Tag>
  return (
    <Tag className={className}>
      <Suspense fallback={text}>
        <KatexText segments={segments(text)} />
      </Suspense>
    </Tag>
  )
}
