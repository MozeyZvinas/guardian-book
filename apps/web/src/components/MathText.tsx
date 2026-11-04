import { lazy, Suspense, type ElementType } from 'react'
import { hasMath, normaliseMath, segments } from './MathText.logic'

/**
 * MathText (D37: `katex` for maths on screen). Renders a string whose maths is written
 * TeX-style between `$…$` (inline) or `$$…$$` (display) through KaTeX; everything else is
 * plain text, never HTML. KaTeX (about 75 KB gzipped plus its CSS and fonts) is loaded
 * only when a string actually contains maths, so the shell and the route chunks stay
 * inside spec 06 §6's budget; until it arrives, the source text shows as written.
 *
 * B16: the string is normalised first (`MathText.logic.ts`), so `\( … \)`, `\[ … \]` and
 * bare `\frac{a}{b}` pasted from elsewhere render too; a learner never sees a raw backslash.
 *
 * Use it wherever an item prompt, a guideline criterion or a hint reaches the screen.
 */

export { MATH_PATTERN, hasMath, normaliseMath, segments, type Segment } from './MathText.logic'

const KatexText = lazy(() => import('./MathTextKatex').then((m) => ({ default: m.MathTextKatex })))

export interface MathTextProps {
  text: string
  /** The wrapping element; `span` by default so it sits inside any paragraph or label. */
  as?: ElementType
  className?: string
}

export function MathText({ text, as: Tag = 'span', className }: MathTextProps) {
  const normalised = normaliseMath(text)
  if (!hasMath(normalised)) return <Tag className={className}>{normalised}</Tag>
  return (
    <Tag className={className}>
      <Suspense fallback={normalised}>
        <KatexText segments={segments(normalised)} />
      </Suspense>
    </Tag>
  )
}
