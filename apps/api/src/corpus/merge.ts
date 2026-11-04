import {
  MAX_ATTRIBUTION_CHARS,
  PENDING_REVIEWER,
  itemFileSchema,
  paperPath,
  paperTitle,
  skillGroupLabel,
  type ExtractEntry,
  type ExtractOutput,
  type ExtractStep,
  type ItemFile,
  type PaperRef,
  type PaperSession,
} from '@guardian-book/shared'
import { unbalancedMaths } from '../verify/checks/guide.js'

/**
 * From page reads to questions (brief B17 phase A §2–§5). Pure. The paper's pages give
 * the numbered entries; the memo's pages give the steps; `buildQuestions` lines them up
 * by number, composes each question's prompt from its stems, and runs the cross-document
 * checks: a question has text and marks, its memo entry exists with at least one step,
 * the step marks sum to the paper's marks, and every piece of maths balances. A question
 * that passes becomes a loader item (`toItemFile`); one that fails keeps its reasons and
 * is written as a draft, never loaded.
 */

export interface PageRead {
  /** 1-based page number in the document. */
  page: number
  output: ExtractOutput
}

export interface MergedEntry {
  number: string
  kind: ExtractEntry['kind']
  text_md: string
  marks: number | null
  diagram: { page: number; box: NonNullable<ExtractEntry['diagram']> } | null
  topic: string
  skill_tag: string
  steps: ExtractStep[]
  final_answer: string | null
  /** The pages the entry was read from, in order. */
  pages: number[]
}

/** Entries across a document's pages, continuations joined onto the entry they continue. */
export function mergeEntries(reads: PageRead[]): MergedEntry[] {
  const merged: MergedEntry[] = []
  const byNumber = new Map<string, MergedEntry>()
  for (const read of [...reads].sort((a, b) => a.page - b.page)) {
    for (const entry of read.output.entries) {
      const existing = byNumber.get(entry.number)
      if (existing && entry.continues) {
        existing.text_md = [existing.text_md, entry.text_md].filter((text) => text.trim().length > 0).join('\n\n')
        existing.marks = existing.marks ?? entry.marks
        existing.diagram = existing.diagram ?? (entry.diagram ? { page: read.page, box: entry.diagram } : null)
        existing.steps.push(...entry.steps)
        existing.final_answer = entry.final_answer ?? existing.final_answer
        existing.pages.push(read.page)
        continue
      }
      // A number read twice without a continuation (a memo's alternative method, a misread): the first read stands.
      if (existing) continue
      const next: MergedEntry = {
        number: entry.number,
        kind: entry.kind,
        text_md: entry.text_md,
        marks: entry.marks,
        diagram: entry.diagram ? { page: read.page, box: entry.diagram } : null,
        topic: entry.topic,
        skill_tag: entry.skill_tag,
        steps: [...entry.steps],
        final_answer: entry.final_answer,
        pages: [read.page],
      }
      merged.push(next)
      byNumber.set(entry.number, next)
    }
  }
  return merged
}

export const DRAFT_REASONS = [
  'question_text_missing',
  'no_marks',
  'memo_missing',
  'memo_steps_missing',
  'marks_mismatch',
  'maths_unbalanced',
  'too_long',
  'loader_invalid',
  'read_failed',
] as const
export type DraftReason = (typeof DRAFT_REASONS)[number]

export interface BuiltQuestion {
  number: string
  /** The stems' text (outermost first) and the question's own, joined. */
  prompt_md: string
  marks: number | null
  topic: string
  skill_tag: string
  diagram: MergedEntry['diagram']
  /** The number of the entry the diagram was printed with (the question or a stem); null without one. */
  diagramOwner: string | null
  steps: ExtractStep[]
  final_answer: string | null
  memoMarks: number | null
  reasons: DraftReason[]
  /** Plain words for each reason, for the draft file and the re-read. */
  details: string[]
  /** The memo pages the entry was read from (for a targeted re-read). */
  memoPages: number[]
  paperPages: number[]
}

/** "2.2" and "2" for "2.2.1", nearest first. */
export function ancestorNumbers(number: string): string[] {
  const parts = number.split('.')
  const ancestors: string[] = []
  for (let length = parts.length - 1; length >= 1; length -= 1) ancestors.push(parts.slice(0, length).join('.'))
  return ancestors
}

export function buildQuestions(paper: MergedEntry[], memo: MergedEntry[]): BuiltQuestion[] {
  const paperByNumber = new Map(paper.map((entry) => [entry.number, entry]))
  const memoByNumber = new Map(memo.map((entry) => [entry.number, entry]))
  const leaves = paper.filter((entry) => entry.kind === 'question')
  return leaves.map((leaf) => {
    const ancestors = ancestorNumbers(leaf.number)
      .map((number) => paperByNumber.get(number))
      .filter((entry): entry is MergedEntry => entry !== undefined)
    const stems = [...ancestors].reverse()
    const prompt_md = [...stems.map((stem) => stem.text_md), leaf.text_md].map((text) => text.trim()).filter((text) => text.length > 0).join('\n\n')
    const owner = leaf.diagram ? leaf : (ancestors.find((stem) => stem.diagram) ?? null)
    const diagram = owner?.diagram ?? null
    const memoEntry = memoByNumber.get(leaf.number)
    const steps = memoEntry?.steps ?? []
    const question: BuiltQuestion = {
      number: leaf.number,
      prompt_md,
      marks: leaf.marks,
      topic: leaf.topic,
      skill_tag: leaf.skill_tag,
      diagram,
      diagramOwner: owner?.number ?? null,
      steps,
      final_answer: memoEntry?.final_answer ?? null,
      memoMarks: memoEntry?.marks ?? null,
      reasons: [],
      details: [],
      memoPages: memoEntry?.pages ?? [],
      paperPages: leaf.pages,
    }
    verifyQuestion(question)
    return question
  })
}

/** The cross-document checks; sets `reasons` and `details` on the question. */
export function verifyQuestion(question: BuiltQuestion): void {
  const reasons: DraftReason[] = []
  const details: string[] = []
  if (question.prompt_md.trim().length === 0) {
    reasons.push('question_text_missing')
    details.push('the question has no text')
  }
  if (question.marks === null || question.marks < 1) {
    reasons.push('no_marks')
    details.push('the paper shows no marks for this part')
  }
  if (question.memoPages.length === 0) {
    reasons.push('memo_missing')
    details.push(`the memo has no answer numbered ${question.number}`)
  } else if (question.steps.length === 0) {
    reasons.push('memo_steps_missing')
    details.push(`the memo answer ${question.number} has no steps`)
  } else if (question.marks !== null) {
    const sum = question.steps.reduce((total, step) => total + step.marks, 0)
    if (sum !== question.marks) {
      reasons.push('marks_mismatch')
      details.push(`the paper gives (${question.marks}) for ${question.number} but the memo steps carry ${sum}; one step per tick, ✓✓ is 2`)
    }
  }
  const texts = [question.prompt_md, question.final_answer ?? '', ...question.steps.flatMap((step) => [step.criterion, step.working, step.notes ?? ''])]
  const unbalanced = texts.map((text) => unbalancedMaths(text)).filter((problem): problem is string => problem !== null)
  if (unbalanced.length > 0) {
    reasons.push('maths_unbalanced')
    details.push(`maths does not balance: ${unbalanced[0]}`)
  }
  if (question.prompt_md.length > 8000 || question.steps.some((step) => step.criterion.length > 500)) {
    reasons.push('too_long')
    details.push('the question text or a step is longer than the loader allows')
  }
  question.reasons = reasons
  question.details = details
}

const SESSION_SLUG: Record<PaperSession, string> = { feb_march: 'mar', may_june: 'jun', november: 'nov' }

/** `nsc-maths-p1-2026-jun-q1-1-1`. */
export function questionSlug(ref: PaperRef, number: string): string {
  return `nsc-maths-p${ref.paper}-${ref.year}-${SESSION_SLUG[ref.session]}-q${number.replace(/\./g, '-')}`
}

/** "NSC Mathematics P1, May/June 2026, Q1.1.1 · Department of Basic Education" (D40: shown wherever the question is). */
export function attributionLine(ref: PaperRef, number: string): string {
  return `${paperTitle(ref)}, Q${number} · Department of Basic Education`.slice(0, MAX_ATTRIBUTION_CHARS)
}

/** `library/dbe/mathematics/12/2026/may_june/p1/q5.png`: where the crop lives in the app's private bucket. */
export function diagramKeyFor(ref: PaperRef, ownerNumber: string): string {
  return `library/dbe/${paperPath(ref)}/q${ownerNumber.replace(/\./g, '-')}.png`
}

export const EXTRACT_AUTHOR = 'Department of Basic Education (NSC paper and marking guideline), read by Muse Spark'

/** "Algebra: quadratic equations", at most 100 characters. */
export function topicFor(skillTag: string, topic: string): string {
  const group = skillGroupLabel(skillTag)
  const detail = topic.trim()
  const lower = detail.length > 0 ? detail.charAt(0).toLowerCase() + detail.slice(1) : ''
  return (lower.length > 0 && lower !== group.toLowerCase() ? `${group}: ${lower}` : group).slice(0, 100)
}

/** The loader file for a question that passed every check; throws for one that did not. */
export function toItemFile(ref: PaperRef, question: BuiltQuestion, options: { heldOut: boolean; diagramKey: string | null }): ItemFile {
  if (question.reasons.length > 0) throw new Error(`question ${question.number} is a draft: ${question.reasons.join(', ')}`)
  const tags = [...new Set([question.skill_tag, ...question.steps.map((step) => step.skill_tag)])]
  const raw = {
    slug: questionSlug(ref, question.number),
    topic: topicFor(question.skill_tag, question.topic),
    skill_tags: tags,
    prompt_md: question.prompt_md,
    diagram_key: options.diagramKey,
    max_marks: question.marks,
    author: EXTRACT_AUTHOR,
    reviewer: PENDING_REVIEWER,
    reviewed_at: null,
    source: 'dbe_nsc',
    source_ref: { ...ref, question: question.number },
    attribution: attributionLine(ref, question.number),
    held_out: options.heldOut,
    provenance: 'licensed_content',
    guideline_steps: question.steps.map((step, index) => ({
      step_no: index + 1,
      step_type: step.step_type,
      criterion: step.criterion,
      marks: step.marks,
      skill_tag: step.skill_tag,
      notes: step.notes,
    })),
  }
  return itemFileSchema.parse(raw)
}

/** The loader's own verdict on a question, as a draft reason when it refuses the file. */
export function loaderProblem(ref: PaperRef, question: BuiltQuestion, options: { heldOut: boolean; diagramKey: string | null }): string | null {
  try {
    toItemFile(ref, question, options)
    return null
  } catch (err) {
    return err instanceof Error ? err.message.slice(0, 300) : String(err)
  }
}

export interface PaperCounts {
  questions: number
  memoAligned: number
  approved: number
  draft: number
  byReason: Record<string, number>
}

export function countQuestions(questions: BuiltQuestion[]): PaperCounts {
  const byReason: Record<string, number> = {}
  for (const question of questions) for (const reason of question.reasons) byReason[reason] = (byReason[reason] ?? 0) + 1
  return {
    questions: questions.length,
    // The memo's answer was found by number, has its steps, and its step marks agree with the paper.
    memoAligned: questions.filter((question) => question.steps.length > 0 && !question.reasons.some((reason) => reason === 'memo_missing' || reason === 'memo_steps_missing' || reason === 'marks_mismatch')).length,
    approved: questions.filter((question) => question.reasons.length === 0).length,
    draft: questions.filter((question) => question.reasons.length > 0).length,
    byReason,
  }
}
