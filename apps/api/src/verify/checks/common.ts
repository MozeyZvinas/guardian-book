import { FORBIDDEN_INFERENCE_TERMS, JARGON_TERMS } from '../lists.js'
import { findTerms, median, sentences, wordCount } from '../text.js'
import { fail, pass, type CheckOutcome } from '../types.js'

/** Rules shared by several purposes, parameterised by how to pull text out of an output. */

export const PLAIN_LANGUAGE_MAX_MEDIAN_WORDS = 18

/** Every string value in an object, at any depth, with its JSON path. */
export function stringsIn(value: unknown, path = '$'): Array<{ path: string; text: string }> {
  if (typeof value === 'string') return [{ path, text: value }]
  if (Array.isArray(value)) return value.flatMap((item, index) => stringsIn(item, `${path}[${index}]`))
  if (value !== null && typeof value === 'object') {
    return Object.entries(value).flatMap(([key, item]) => stringsIn(item, `${path}.${key}`))
  }
  return []
}

/** INFERENCE_FORBIDDEN over every string in the output (or the subset given). */
export function inferenceForbidden(texts: Array<{ path: string; text: string }>): CheckOutcome {
  const hits: string[] = []
  for (const { path, text } of texts) {
    const found = findTerms(text, FORBIDDEN_INFERENCE_TERMS)
    if (found.length > 0) hits.push(`${path} uses "${found.join('", "')}"`)
  }
  if (hits.length === 0) return pass('no mood, health, ability or personality inference')
  return fail(`speak about the work, not the person: ${hits.join('; ')}`)
}

/** PLAIN_LANGUAGE_FAIL: median sentence ≤ 18 words and no word from the jargon list. */
export function plainLanguage(texts: Array<{ path: string; text: string }>): CheckOutcome {
  const problems: string[] = []
  const lengths: number[] = []
  for (const { path, text } of texts) {
    for (const sentence of sentences(text)) lengths.push(wordCount(sentence))
    const jargon = findTerms(text, JARGON_TERMS)
    if (jargon.length > 0) problems.push(`${path} uses jargon "${jargon.join('", "')}"`)
  }
  const medianWords = median(lengths)
  if (medianWords > PLAIN_LANGUAGE_MAX_MEDIAN_WORDS) {
    problems.push(`median sentence is ${medianWords} words; keep it at ${PLAIN_LANGUAGE_MAX_MEDIAN_WORDS} or fewer`)
  }
  if (problems.length === 0) return pass(`median sentence ${medianWords} words; no jargon`)
  return fail(problems.join('; '))
}

/** EVIDENCE_REF_UNKNOWN: every citation names at least one known evidence ID. */
export function evidenceRefs(
  statements: Array<{ path: string; evidence_ids: string[] }>,
  knownEvidenceIds: readonly string[],
): CheckOutcome {
  const known = new Set(knownEvidenceIds)
  const problems: string[] = []
  for (const { path, evidence_ids } of statements) {
    if (evidence_ids.length === 0) problems.push(`${path} cites no evidence`)
    const unknown = evidence_ids.filter((id) => !known.has(id))
    if (unknown.length > 0) problems.push(`${path} cites unknown evidence ${unknown.join(', ')}`)
  }
  if (problems.length === 0) return pass('every statement cites known evidence')
  return fail(`${problems.join('; ')}; known IDs: ${[...known].join(', ') || '(none)'}`)
}
