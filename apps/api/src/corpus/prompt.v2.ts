import { EXTRACT_PAGE_KINDS, KNOWN_SKILL_TAGS, SESSION_LABEL, paperTitle, skillLabel, type PaperRef } from '@guardian-book/shared'
import { assertPromptSafe } from '../gateway/promptSafety.js'
import type { ImageInput } from '../gateway/transport.js'
import type { ExtractContext } from '../verify/types.js'

/**
 * The extraction prompt, version 2 (brief B17 phase A §2; `purpose = extract`). Immutable
 * once shipped: a changed word means `extract-v3` in a new file, because the version is
 * stored on every run. Version 1, which every extraction run of 4 and 5 Nov 2026 recorded
 * as `extract-v1`, differed only in the format example of a memo step's criterion: that
 * example matched a real paper's working, so it is kept out of the repo (D40). One call reads one page image; the user message says which
 * document and page it is and, on a targeted re-read, which numbers to return.
 *
 * Nothing about any person goes in (D24): the page is an examination paper, the metadata
 * is the paper's title and page number, and `assertPromptSafe` runs on the text.
 */

export const EXTRACT_PROMPT_VERSION = 'extract-v2' as const
/** A dense memo page is thirty steps of working after the model's own reasoning. */
export const EXTRACT_MAX_TOKENS = 10_000
export const EXTRACT_TIMEOUT_MS = 150_000

const TAG_LINES = KNOWN_SKILL_TAGS.map((tag) => `${tag} (${skillLabel(tag, 'teacher')})`).join('\n')

export const EXTRACT_SYSTEM = `You read ONE page of a South African National Senior Certificate (NSC) Mathematics Grade 12 examination document and reply with one JSON object matching the schema you are given, nothing else. The page is from the question paper or from the marking guideline (the memo). Read the English only; ignore Afrikaans.

page_kind: ${EXTRACT_PAGE_KINDS.join(', ')}. A page with numbered questions is "questions"; a page of worked answers with ticks is "memo"; the front page is "cover"; the formula sheet is "information_sheet"; a blank page, diagram sheet or answer-book page is "other".

Entries: one entry per numbered item on the page, in reading order, numbered exactly as printed ("1", "1.1", "1.1.1"). A heading such as "QUESTION 2" is the entry "2" (a stem). A stem is a numbered item with no marks of its own: a heading, or the shared text its parts refer to (for example "1.1 Solve for x:", or the introduction and graph of QUESTION 5). A question is a numbered part with marks printed in round brackets at its right, such as (4). Totals in square brackets, such as [23], are not marks of any entry.

text_md (question pages): the entry's own text exactly as printed, in Markdown. Write every piece of maths TeX-style between dollar signs: $…$ inline, $$…$$ on its own line. Never \\( \\) or \\[ \\]. Copy every number exactly; never simplify, shorten or solve the question. A stem's text_md holds only the text shared by its parts (an empty string when a heading has none). On memo pages text_md is an empty string.

marks: the number in round brackets to the right of a question; null for a stem. continues: true when the entry carries on from the previous page (the first lines of this page belong to an item numbered on an earlier page); then the number is that item's. continues_on_next_page: true when the entry is cut off at the foot of this page.

diagram: when a question or stem needs a figure, graph, table or sketch printed on this page, give its bounding box on a 0–1000 grid over the whole page (x0, y0 top-left; x1, y1 bottom-right), tight around the figure with its labels; otherwise null.

topic: a short topic name ("Quadratic equations", "Annuities", "Circle geometry"). skill_tag: the closest tag from this list, nothing else:
${TAG_LINES}

Memo pages: for each numbered answer on the page, one entry of kind "question" with marks = the number in round brackets at the end of that answer, steps = one step per tick (✓) in the marking column, in order, and final_answer = the final result of the first method, short, with $…$ maths. Each step: criterion = the tick's label and the working it refers to, in one line ("Correct factors: $(2x + 5)(x - 4) = 0$"); working = that working alone, as a learner would write it; marks = the number of ticks for it (✓✓ is 2); step_type = "M" for a method (a correct substitution, standard form, isolating a term, a formula applied, a diagram or table set up), "A" for a correct value or answer, "CA" when the memo says CA or follow-through; notes = alternatives the memo allows ("OR" methods earn the same marks), one line, or null. Follow the first method only; when the memo gives an alternative method, say so in the notes of the first step. Never invent a tick, a mark or a line that is not on the page.

Rules: an entries list that is empty when the page has no numbered items; nothing about any person; copy, never compose; and when a line cannot be read, say so in notes rather than guessing.`

export interface ExtractPageInput {
  ref: PaperRef
  document: 'paper' | 'memo'
  page: number
  pages: number
  image: ImageInput
  /** A targeted re-read: only these numbers, with the earlier failures appended. */
  onlyNumbers?: string[]
  failures?: string[]
}

export function buildExtractSystem(): string {
  return EXTRACT_SYSTEM
}

export function buildExtractUser(input: ExtractPageInput): { text: string; images: ImageInput[] } {
  const title = paperTitle(input.ref)
  const document = input.document === 'paper' ? 'the question paper (English)' : 'the marking guideline (memo, bilingual: read the English)'
  const lines = [`Document: ${title}, ${SESSION_LABEL[input.ref.session]} ${input.ref.year}: ${document}.`, `Page ${input.page} of ${input.pages}. Read this page.`]
  if (input.onlyNumbers && input.onlyNumbers.length > 0) {
    lines.push(`Return only the entries numbered ${input.onlyNumbers.join(', ')} (every entry for each, including a continuation), and nothing else from the page.`)
  }
  if (input.failures && input.failures.length > 0) {
    lines.push('', 'An earlier read of this page failed these checks; fix every one:', ...input.failures.map((failure) => `- ${failure}`))
  }
  const text = lines.join('\n')
  assertPromptSafe(text, 'extract')
  return { text, images: [input.image] }
}

export function extractContext(input: Pick<ExtractPageInput, 'document' | 'onlyNumbers'>): ExtractContext {
  return { document: input.document, onlyNumbers: input.onlyNumbers ?? [] }
}
