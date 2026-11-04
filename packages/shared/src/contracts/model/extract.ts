import { z } from 'zod'
import { KNOWN_SKILL_TAGS } from '../../brain/skills.js'
import { GUIDELINE_STEP_TYPES } from '../items.js'
import { shortText } from './common.js'

/**
 * Past-paper extraction (brief B17 phase A §2; D40). Muse Spark reads ONE page of an NSC
 * question paper or its marking guideline (memo) and returns every numbered entry on it:
 * the question text with `$…$` maths and its marks, a diagram box when the question needs
 * a figure, and, on a memo page, the marking steps (criterion, M/A/CA, marks) and the
 * final answer. The output is untrusted until `apps/api/src/verify` passes it, and the
 * merge step then checks the paper against the memo question by question.
 *
 * Sent to Meta as a strict JSON schema (see `common.ts`): closed objects, nullable not
 * optional, snake_case keys.
 */

export const EXTRACT_PAGE_KINDS = ['cover', 'instructions', 'questions', 'information_sheet', 'memo', 'other'] as const
export const extractPageKindSchema = z.enum(EXTRACT_PAGE_KINDS)
export type ExtractPageKind = z.infer<typeof extractPageKindSchema>

/** A `stem` is a numbered heading or shared context with no marks of its own; a `question` carries marks. */
export const EXTRACT_ENTRY_KINDS = ['stem', 'question'] as const
export const extractEntryKindSchema = z.enum(EXTRACT_ENTRY_KINDS)
export type ExtractEntryKind = z.infer<typeof extractEntryKindSchema>

/** "3", "3.2", "3.2.1": the number as printed. */
export const QUESTION_NUMBER_PATTERN = /^[0-9]+(?:\.[0-9]+)*$/
export const questionNumberSchema = z.string().max(20).regex(QUESTION_NUMBER_PATTERN)

/** The model may use only the taxonomy's tags (`packages/shared/src/brain/skills.ts`). */
export const extractSkillTagSchema = z.enum(KNOWN_SKILL_TAGS as [string, ...string[]])

/** One tick (or run of ticks) in the memo's marking column, as a guideline step. */
export const extractStepSchema = z.strictObject({
  /** What earns the mark, with the memo's working for it: "Correct factors: $(2x + 5)(x - 4) = 0$". ≤ 500. */
  criterion: shortText(500),
  /** The memo's working for this step alone, maths only, as a learner would write it. ≤ 300. */
  working: shortText(300),
  step_type: z.enum(GUIDELINE_STEP_TYPES),
  /** The ticks for this step (✓✓ = 2). */
  marks: z.number().int().min(1).max(20),
  skill_tag: extractSkillTagSchema,
  /** Alternatives the memo allows ("OR" methods), one line, or null. ≤ 400. */
  notes: shortText(400).nullable(),
})
export type ExtractStep = z.infer<typeof extractStepSchema>

/** A box on a 0–1000 grid over the page image, top-left origin. */
export const extractBoxSchema = z.strictObject({
  x0: z.number().min(0).max(1000),
  y0: z.number().min(0).max(1000),
  x1: z.number().min(0).max(1000),
  y1: z.number().min(0).max(1000),
})
export type ExtractBox = z.infer<typeof extractBoxSchema>

export const extractEntrySchema = z.strictObject({
  number: questionNumberSchema,
  kind: extractEntryKindSchema,
  /** True when this entry continues one that began on an earlier page. */
  continues: z.boolean(),
  /** True when this entry is cut off at the foot of the page. */
  continues_on_next_page: z.boolean(),
  /** Question pages: the text as printed, Markdown with `$…$` maths. Memo pages: empty. ≤ 4000. */
  text_md: shortText(4000),
  /** The bracketed marks "(4)" for a question; null for a stem or when none is printed. */
  marks: z.number().int().min(0).max(100).nullable(),
  /** The figure, graph or table the entry needs, or null. */
  diagram: extractBoxSchema.nullable(),
  /** A short topic name, for example "Quadratic equations". ≤ 80. */
  topic: shortText(80),
  skill_tag: extractSkillTagSchema,
  /** Memo pages only: one step per tick, in order. Empty on a question page. */
  steps: z.array(extractStepSchema).max(30),
  /** Memo pages only: the final result of the first method, short, maths in `$…$`; null elsewhere. ≤ 300. */
  final_answer: shortText(300).nullable(),
})
export type ExtractEntry = z.infer<typeof extractEntrySchema>

export const extractOutputSchema = z.strictObject({
  page_kind: extractPageKindSchema,
  /** Every numbered entry on the page, in reading order; empty on a cover, instruction or formula page. */
  entries: z.array(extractEntrySchema).max(60),
  /** Anything the reader should know about this page (a diagram sheet, an unreadable line), or empty. ≤ 300. */
  notes: shortText(300),
})
export type ExtractOutput = z.infer<typeof extractOutputSchema>
