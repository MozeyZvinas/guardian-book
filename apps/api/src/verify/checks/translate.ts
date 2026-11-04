import type { TranslationOutput } from '@guardian-book/shared'
import { fail, pass, type CheckOutcome, type CheckRule, type TranslateContext } from '../types.js'

/**
 * Rules for a translation (brief B12 §3). The source reached the model with every name,
 * number, date and link replaced by a placeholder, so the output must carry each
 * placeholder back exactly once, stay within 0.5–2.5× the source's length, introduce no
 * digit and no link, and not still be English. All retryable: each failure is a model
 * mistake a re-ask can fix; after three calls the English stands (recorded `exhausted`).
 */

/** `{{L}}`, `{{T}}`, `{{N1}}`, `{{D2}}`, `{{U1}}`: capital letters, then an optional index. */
export const PLACEHOLDER_PATTERN = /\{\{[A-Z]+\d*\}\}/g

export const LENGTH_MIN_RATIO = 0.5
export const LENGTH_MAX_RATIO = 2.5
/** Fail when at least this share of the source's content words is still in the output. */
export const NOT_TRANSLATED_RATIO = 0.5
/** Only words this long count for NOT_TRANSLATED: short words ("is", "die", "van") are shared across languages. */
const CONTENT_WORD_MIN = 4

/** The text with every placeholder removed (a space keeps word boundaries). */
export function stripPlaceholders(text: string): string {
  return text.replace(PLACEHOLDER_PATTERN, ' ')
}

function countOf(haystack: string, needle: string): number {
  let count = 0
  let from = 0
  for (;;) {
    const at = haystack.indexOf(needle, from)
    if (at === -1) return count
    count += 1
    from = at + needle.length
  }
}

export function placeholderMissing(output: TranslationOutput, context: TranslateContext): CheckOutcome {
  const problems: string[] = []
  for (const placeholder of context.placeholders) {
    const times = countOf(output.text, placeholder)
    if (times === 0) problems.push(`${placeholder} is missing`)
    else if (times > 1) problems.push(`${placeholder} appears ${times} times`)
  }
  const known = new Set(context.placeholders)
  const unknown = [...new Set((output.text.match(PLACEHOLDER_PATTERN) ?? []).filter((placeholder) => !known.has(placeholder)))]
  if (unknown.length > 0) problems.push(`${unknown.join(', ')} ${unknown.length === 1 ? 'is' : 'are'} not in the source`)
  if (problems.length === 0) return pass(context.placeholders.length === 0 ? 'no placeholders to carry' : 'every placeholder is back exactly once')
  return fail(`${problems.join('; ')}; copy each placeholder exactly once, as written: ${context.placeholders.join(', ') || '(none)'}`)
}

export function lengthOutOfRange(output: TranslationOutput, context: TranslateContext): CheckOutcome {
  const source = context.sourceText.trim().length
  const target = output.text.trim().length
  if (source === 0) return target === 0 ? pass('empty source, empty translation') : fail('the source is empty; the translation must be too')
  const ratio = Math.round((target / source) * 100) / 100
  if (ratio < LENGTH_MIN_RATIO) return fail(`the translation is ${ratio}× the source's length; it must be at least ${LENGTH_MIN_RATIO}×: translate the whole text`)
  if (ratio > LENGTH_MAX_RATIO) return fail(`the translation is ${ratio}× the source's length; it must be at most ${LENGTH_MAX_RATIO}×: add nothing`)
  return pass(`${ratio}× the source's length`)
}

export function numberAdded(output: TranslationOutput): CheckOutcome {
  const digits = stripPlaceholders(output.text).match(/\d+(?:[.,:]\d+)*/g) ?? []
  if (digits.length === 0) return pass('no digit introduced')
  return fail(`the translation introduces ${[...new Set(digits)].join(', ')}; every number in the source is a placeholder, add none`)
}

const URL_LIKE = /https?:\/\/\S+|\bwww\.\S+|\b[a-z0-9-]+\.(?:com|org|net|me|app|co\.za|org\.za|ac\.za)\b/gi

export function urlAdded(output: TranslationOutput): CheckOutcome {
  const links = stripPlaceholders(output.text).match(URL_LIKE) ?? []
  if (links.length === 0) return pass('no link introduced')
  return fail(`the translation introduces a link (${[...new Set(links)].join(', ')}); every link in the source is a placeholder, add none`)
}

/** Lower-case words of letters (any alphabet) of at least CONTENT_WORD_MIN characters, placeholders excluded. */
export function translationWords(text: string): Set<string> {
  return new Set(
    stripPlaceholders(text)
      .toLowerCase()
      .split(/[^\p{L}']+/u)
      .map((word) => word.replace(/^'+|'+$/g, ''))
      .filter((word) => word.length >= CONTENT_WORD_MIN),
  )
}

export function notTranslated(output: TranslationOutput, context: TranslateContext): CheckOutcome {
  const source = translationWords(context.sourceText)
  if (source.size === 0) return pass('the source has no content words to compare')
  const target = translationWords(output.text)
  const kept = [...source].filter((word) => target.has(word))
  const ratio = Math.round((kept.length / source.size) * 100) / 100
  if (ratio >= NOT_TRANSLATED_RATIO) {
    return fail(`${Math.round(ratio * 100)}% of the English words are still there (${kept.slice(0, 6).join(', ')}); translate into the language named, leaving only the placeholders as they are`)
  }
  return pass(`${Math.round(ratio * 100)}% of the English words remain`)
}

export const TRANSLATE_RULES: CheckRule<TranslationOutput, TranslateContext>[] = [
  { code: 'PLACEHOLDER_MISSING', retryable: true, run: placeholderMissing },
  { code: 'LENGTH_OUT_OF_RANGE', retryable: true, run: lengthOutOfRange },
  { code: 'NUMBER_ADDED', retryable: true, run: (output) => numberAdded(output) },
  { code: 'URL_ADDED', retryable: true, run: (output) => urlAdded(output) },
  { code: 'NOT_TRANSLATED', retryable: true, run: notTranslated },
]
