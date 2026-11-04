import { PLACEHOLDER_PATTERN } from '../verify/checks/translate.js'

/**
 * No personal data in prompts (D24; brief B12 §3). Before a text is translated, the
 * learner's nickname, the teacher's name and every link, date and number are replaced by
 * placeholders (`{{L}}`, `{{T}}`, `{{U1}}`, `{{D1}}`, `{{N1}}`…), each occurrence its own,
 * so the verifier can demand each one back exactly once. After the checks pass, the
 * placeholders are restored. Pure; tested for the round trip.
 */

export interface ProtectNames {
  learner: string | null
  teacher: string | null
}

export interface ProtectedText {
  /** The text with placeholders in place of names, links, dates and numbers. */
  text: string
  /** Every placeholder in the text, in order of first appearance. */
  placeholders: string[]
  /** Placeholder → the original text it stands for. */
  originals: Record<string, string>
}

const escapeRegExp = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** A link up to whitespace or a closing bracket, never ending in sentence punctuation ("see www.example.org."). */
const URL = String.raw`(?:https?://|www\.)[^\s)\]>]*[^\s)\]>.,;:!?]`
const ISO_DATE = String.raw`\d{4}-\d{2}-\d{2}`
const SLASH_DATE = String.raw`\d{1,2}/\d{1,2}/\d{2,4}`
const NUMBER = String.raw`\d+(?:[.,:]\d+)*`

/** A name as a whole word, any case: not glued to another letter or digit. */
const nameAlternative = (name: string): string => String.raw`(?<![\p{L}\p{N}])${escapeRegExp(name.trim()).replace(/\s+/g, String.raw`\s+`)}(?![\p{L}\p{N}])`

export function protectText(source: string, names: ProtectNames): ProtectedText {
  const alternatives: Array<{ group: string; pattern: string }> = [
    { group: 'url', pattern: URL },
    { group: 'date', pattern: `${ISO_DATE}|${SLASH_DATE}` },
  ]
  const learner = names.learner?.trim() ?? ''
  const teacher = names.teacher?.trim() ?? ''
  // The longer name first, so "Mma Lerato" is not cut to "{{L}}" by a shorter "Lerato".
  const nameGroups = [
    { group: 'learner', name: learner },
    { group: 'teacher', name: teacher },
  ]
    .filter((entry) => entry.name.length > 0)
    .sort((a, b) => b.name.length - a.name.length)
  for (const entry of nameGroups) alternatives.push({ group: entry.group, pattern: nameAlternative(entry.name) })
  alternatives.push({ group: 'number', pattern: NUMBER })

  const combined = new RegExp(alternatives.map((alt) => `(?<${alt.group}>${alt.pattern})`).join('|'), 'giu')
  const counters = { url: 0, date: 0, number: 0 }
  const placeholders: string[] = []
  const originals: Record<string, string> = {}

  const text = source.replace(combined, (match: string, ...rest: unknown[]) => {
    const groups = rest[rest.length - 1] as Record<string, string | undefined>
    let placeholder: string
    if (groups['url'] !== undefined) placeholder = `{{U${(counters.url += 1)}}}`
    else if (groups['date'] !== undefined) placeholder = `{{D${(counters.date += 1)}}}`
    else if (groups['learner'] !== undefined) placeholder = '{{L}}'
    else if (groups['teacher'] !== undefined) placeholder = '{{T}}'
    else placeholder = `{{N${(counters.number += 1)}}}`
    if (!placeholders.includes(placeholder)) placeholders.push(placeholder)
    // A name keeps the spelling of its first appearance; a number or link is its own.
    if (!(placeholder in originals)) originals[placeholder] = match
    return placeholder
  })

  // A name that appears twice is one placeholder in two places; the verifier counts
  // occurrences, so the text must carry it the same number of times. Collapse repeats:
  // the second and later occurrences of {{L}} or {{T}} become numbered name placeholders.
  let learnerSeen = 0
  let teacherSeen = 0
  const collapsed = text.replace(/\{\{(L|T)\}\}/g, (placeholder, kind: string) => {
    const seen = kind === 'L' ? (learnerSeen += 1) : (teacherSeen += 1)
    if (seen === 1) return placeholder
    const numbered = `{{${kind}${seen}}}`
    if (!placeholders.includes(numbered)) placeholders.push(numbered)
    originals[numbered] = originals[placeholder] ?? ''
    return numbered
  })

  return { text: collapsed, placeholders, originals }
}

/** Puts the originals back. An unknown placeholder (the verifier refuses them) is left as written. */
export function restoreText(translated: string, protectedText: ProtectedText): string {
  return translated.replace(PLACEHOLDER_PATTERN, (placeholder) => protectedText.originals[placeholder] ?? placeholder)
}
