import { normaliseMaths, squash, tokenOverlap } from '../verify/text.js'

/**
 * Does a read-back match a question in the bank (brief B15 §4: "a link Check my own
 * working to the bank flow when the question matches a bank item")? Pure and simple
 * enough to explain: when the item has maths, its longest maths expression must appear
 * in the read-back; otherwise most of the item's words must. Nothing is marked by this;
 * it only decides whether the link is offered.
 */

export const MATCH_WORD_OVERLAP = 0.8

/** `$…$` and `$$…$$` contents, normalised and squashed, longest first. */
export function mathsOf(text: string): string[] {
  const found = [...text.matchAll(/\$\$([\s\S]+?)\$\$|\$([^$\n]+?)\$/g)].map((m) => squash((m[1] ?? m[2] ?? '').replace(/\\[,;!]/g, '')))
  return [...new Set(found.filter((tex) => tex.length > 0))].sort((a, b) => b.length - a.length)
}

/** The text with its dollars dropped, normalised, with every space removed. */
function flat(text: string): string {
  return squash(text.replace(/\$/g, ''))
}

export function questionMatches(questionMd: string, itemPromptMd: string): boolean {
  const itemMaths = mathsOf(itemPromptMd)
  const readBack = flat(questionMd)
  if (readBack.length === 0) return false
  const longest = itemMaths[0]
  if (longest !== undefined && longest.length >= 4) return readBack.includes(longest)
  const itemWords = normaliseMaths(itemPromptMd.replace(/\$/g, ''))
  const questionWords = normaliseMaths(questionMd.replace(/\$/g, ''))
  return tokenOverlap(itemWords, questionWords) >= MATCH_WORD_OVERLAP && tokenOverlap(questionWords, itemWords) >= MATCH_WORD_OVERLAP
}

/** The first bank item (in the order given) the read-back matches, or null. */
export function matchBankItem<T extends { id: string; promptMd: string }>(questionMd: string, items: readonly T[]): T | null {
  return items.find((item) => questionMatches(questionMd, item.promptMd)) ?? null
}
