import { useState } from 'react'
import { TRANSLATED_BY_AI_LABEL, TRANSLATION_PENDING_LABEL, type TranslationView } from '@guardian-book/shared'

/**
 * A parent-facing text in the parent's language (B12): the translation when it is ready,
 * under a quiet label that says it is model text translated from the teacher-reviewed
 * English, with "Show English" beside it; the English with "Translation on its way" while
 * the background job writes it; the English alone when there is no translation.
 * Teacher-reviewed labels are rendered by the caller and stay as they are.
 */

/** The text a share button carries: what the screen shows first. */
export function shownText(english: string, translation: TranslationView | null): string {
  return translation?.status === 'ready' && translation.text ? translation.text : english
}

export function isPending(translation: TranslationView | null | undefined): boolean {
  return translation?.status === 'pending'
}

export function TranslatedText({ english, translation, className = 'm-0' }: { english: string; translation: TranslationView | null; className?: string }) {
  const [showEnglish, setShowEnglish] = useState(false)
  if (!translation || translation.status === 'unavailable') return <p className={className}>{english}</p>
  if (translation.status !== 'ready' || !translation.text) {
    return (
      <div className="flex flex-col gap-1">
        <p className={className}>{english}</p>
        <p className="m-0 text-xs text-fg-muted" aria-live="polite">
          {TRANSLATION_PENDING_LABEL}
        </p>
      </div>
    )
  }
  return (
    <div className="flex flex-col gap-1">
      <p className={className} lang={translation.language}>
        {translation.text}
      </p>
      <div className="flex flex-wrap items-center gap-x-1 text-xs text-fg-muted">
        <span>{TRANSLATED_BY_AI_LABEL} ·</span>
        <button type="button" className="min-h-11 px-1 text-xs font-medium text-action underline" aria-expanded={showEnglish} onClick={() => setShowEnglish((value) => !value)}>
          {showEnglish ? 'Hide English' : 'Show English'}
        </button>
      </div>
      {showEnglish ? (
        <p className="m-0 border-l-2 border-fg-muted/40 pl-3 text-sm" lang="en">
          {english}
        </p>
      ) : null}
    </div>
  )
}
