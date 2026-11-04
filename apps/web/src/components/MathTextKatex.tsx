import katex from 'katex'
import 'katex/dist/katex.min.css'
import type { Segment } from './MathText.logic'

/**
 * The KaTeX half of `MathText`, in its own chunk. Only KaTeX's own output is set as HTML:
 * it escapes the source, `trust: false` keeps \url, \href and \includegraphics out, and
 * `throwOnError: false` shows a broken expression as its source in the current colour
 * (never red: colour carries no judgement here, A7). The MathML twin is there for screen
 * readers.
 */
export function MathTextKatex({ segments }: { segments: Segment[] }) {
  return (
    <>
      {segments.map((segment, index) =>
        segment.kind === 'text' ? (
          <span key={index}>{segment.text}</span>
        ) : (
          <span
            key={index}
            className={segment.display ? 'block overflow-x-auto py-1' : ''}
            // KaTeX's rendered markup only; the TeX source never reaches the DOM unescaped.
            dangerouslySetInnerHTML={{
              __html: katex.renderToString(segment.tex, {
                displayMode: segment.display,
                throwOnError: false,
                errorColor: 'currentColor',
                trust: false,
                strict: 'ignore',
                output: 'htmlAndMathml',
              }),
            }}
          />
        ),
      )}
    </>
  )
}
