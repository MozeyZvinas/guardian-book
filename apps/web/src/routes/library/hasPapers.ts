import { useEffect, useState } from 'react'
import { libraryPapers } from '../../api/library'

/**
 * Whether the past-paper library has any papers loaded, from the existing `/api/library`.
 * The ways into the library (Today's line, Brain's "What comes up" sentence, the teacher's
 * nav item) show only once this is `true`; `/library` itself keeps its own empty state.
 * `null` while unknown and `false` on an error, so a failed check hides the way in rather
 * than pointing at an empty page. A successful answer is kept for the page's life, so
 * moving between screens does not ask again; an error is not kept.
 */
let known: boolean | null = null

export function useHasPapers(): boolean | null {
  const [hasPapers, setHasPapers] = useState<boolean | null>(known)
  useEffect(() => {
    if (known !== null) return
    let cancelled = false
    libraryPapers()
      .then((result) => {
        known = result.papers.length > 0
        if (!cancelled) setHasPapers(known)
      })
      .catch(() => {
        if (!cancelled) setHasPapers(false)
      })
    return () => {
      cancelled = true
    }
  }, [])
  return hasPapers
}
