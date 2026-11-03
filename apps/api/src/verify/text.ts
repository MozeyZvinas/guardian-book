/**
 * Text helpers for the rules. All pure. Normalisation is deliberately simple and
 * documented, because a rule's behaviour must be explainable to a teacher.
 */

const OPERATORS = /\s*([=+\-*/^()<>])\s*/g

/**
 * Lowercases, unifies unicode maths signs, collapses whitespace and removes spaces around
 * operators, so "x = −3" and "x=-3" compare equal while words keep their boundaries.
 * Commas stay as written: they are prose punctuation and, in South Africa, decimal marks.
 */
export function normaliseMaths(text: string): string {
  return text
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[−–—]/g, '-')
    .replace(/[×·]/g, '*')
    .replace(/÷/g, '/')
    .replace(/\s+/g, ' ')
    .replace(OPERATORS, '$1')
    .trim()
}

/** `normaliseMaths` with every remaining space removed: for substring (evidence) matching. */
export function squash(text: string): string {
  return normaliseMaths(text).replace(/\s+/g, '')
}

export function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * True when `value` occurs in `haystack` as a whole token: not glued to another letter or
 * digit, and not part of a longer decimal ("3" is not in "3.5" or "2.3"). A full stop that
 * ends a sentence does not hide a value. Both sides should already be normalised.
 */
export function containsValue(haystack: string, value: string): boolean {
  if (value.length === 0) return false
  const pattern = new RegExp(`(?<![a-z0-9])(?<!\\d[.,])${escapeRegExp(value)}(?![a-z0-9])(?![.,]\\d)`, 'i')
  return pattern.test(haystack)
}

/** True when `term` (one or more words) occurs in `text` on word boundaries, any case. */
export function containsTerm(text: string, term: string): boolean {
  const pattern = new RegExp(`(?<![a-z0-9])${escapeRegExp(term.toLowerCase()).replace(/\s+/g, '\\s+')}(?![a-z0-9])`, 'i')
  return pattern.test(text.toLowerCase())
}

export function findTerms(text: string, terms: readonly string[]): string[] {
  return terms.filter((term) => containsTerm(text, term))
}

/** Splits prose into sentences on . ! ? (and newlines); drops empties. */
export function sentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+|\n+/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length > 0)
}

export function wordCount(sentence: string): number {
  return sentence.split(/\s+/).filter((word) => /[a-z0-9]/i.test(word)).length
}

export function median(values: number[]): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  const lower = sorted[mid - 1]
  const upper = sorted[mid]
  if (upper === undefined) return 0
  return sorted.length % 2 === 0 && lower !== undefined ? (lower + upper) / 2 : upper
}

/** Tokens of a normalised maths string worth comparing: words and numbers of 2+ chars, or any digit. */
export function contentTokens(normalised: string): string[] {
  return normalised.split(/[\s,;:]+/).filter((token) => token.length >= 2 || /^\d$/.test(token))
}

/** Share of `needle`'s tokens that appear in `haystack` (both normalised); 0 when needle has none. */
export function tokenOverlap(needle: string, haystack: string): number {
  const need = contentTokens(needle)
  if (need.length === 0) return 0
  const have = new Set(contentTokens(haystack))
  const hits = need.filter((token) => have.has(token)).length
  return hits / need.length
}

/**
 * Numbers inside a value worth guarding on their own: anything with 2+ characters
 * ("-2", "36", "2.5") or a single digit other than 0 and 1, which are structural in maths
 * ("set it equal to 0") and would make every hint leak.
 */
export function guardedNumbers(value: string): string[] {
  const found = normaliseMaths(value).match(/-?\d+(?:\.\d+)?/g) ?? []
  return found.filter((n) => n.length >= 2 || !['0', '1'].includes(n))
}

/** Drops "step 2", "line 3", "question 1", "2 marks": references a hint may make legitimately. */
export function stripStructuralNumbers(normalisedHint: string): string {
  return normalisedHint
    .replace(/\b(step|steps|line|lines|part|parts|question|row|mark|marks)\s*\d+(?:\.\d+)?/g, '$1')
    .replace(/\b\d+(?:\.\d+)?\s*(mark|marks)\b/g, '$1')
}
