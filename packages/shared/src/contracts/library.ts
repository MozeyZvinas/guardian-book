import { z } from 'zod'
import { guidelineStepSchema, itemSourceSchema, paperRefSchema, paperSessionSchema, skillTagSchema, sourceRefSchema, type PaperRef, type PaperSession } from './items.js'
import { isoDateSchema } from './model/common.js'

/**
 * The past-paper library, class practice and "what comes up" (brief B17 phase B; D40).
 * What the API accepts and serves, camelCase, plus the pure wording every screen shares.
 *
 * Rules that do not bend (D40): every question carries its attribution line wherever it is
 * shown; nothing here ever carries a PDF or bucket URL (a diagram is fetched through the
 * API by item ID); "Download" points at DBE's own free past-papers page.
 */

const uuid = z.string().uuid()
const classRef = z.object({ id: uuid, name: z.string() })
const personRef = z.object({ id: uuid, nickname: z.string() })

/** DBE's own page of free past papers: the only "download" link the app offers (D40). */
export const DBE_PAST_PAPERS_URL = 'https://www.education.gov.za/Curriculum/NationalSeniorCertificate(NSC)Examinations/NSCPastExaminationpapers.aspx'
export const DBE_PAST_PAPERS_LABEL = 'Download the paper from the Department of Basic Education'

export const SESSION_LABEL: Record<PaperSession, string> = { feb_march: 'Feb/March', may_june: 'May/June', november: 'November' }

/** `mathematics` from "Mathematics"; `physical-sciences` from "Physical Sciences". */
export function subjectSlug(subject: string): string {
  return subject
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

/** "NSC Mathematics P1, November 2023": the paper as a person names it. */
export function paperTitle(ref: PaperRef): string {
  return `NSC ${ref.subject} P${ref.paper}, ${SESSION_LABEL[ref.session]} ${ref.year}`
}

/** `mathematics/12/2023/november/p1`: the paper's path in the library (API and web). */
export function paperPath(ref: PaperRef): string {
  return `${subjectSlug(ref.subject)}/${ref.grade}/${ref.year}/${ref.session}/p${ref.paper}`
}

export function samePaper(a: PaperRef, b: PaperRef): boolean {
  return subjectSlug(a.subject) === subjectSlug(b.subject) && a.grade === b.grade && a.year === b.year && a.session === b.session && a.paper === b.paper
}

/** Question numbers sort by part: 1.1 < 1.2 < 1.10 < 2. */
export function compareQuestionNumbers(a: string, b: string): number {
  const parts = (q: string) => q.split('.').map((part) => Number(part))
  const left = parts(a)
  const right = parts(b)
  for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
    const difference = (left[index] ?? -1) - (right[index] ?? -1)
    if (difference !== 0) return difference
  }
  return 0
}

/** Newest first: year, then session (November before May/June), then paper number. */
export function comparePapersNewestFirst(a: PaperRef, b: PaperRef): number {
  if (a.year !== b.year) return b.year - a.year
  const order = (session: PaperSession) => paperSessionSchema.options.indexOf(session)
  if (a.session !== b.session) return order(b.session) - order(a.session)
  if (a.paper !== b.paper) return a.paper - b.paper
  return subjectSlug(a.subject).localeCompare(subjectSlug(b.subject)) || a.grade - b.grade
}

// ── the library ─────────────────────────────────────────────────────────────────────────

export const libraryPaperSchema = paperRefSchema.extend({
  subjectSlug: z.string(),
  sessionLabel: z.string(),
  title: z.string(),
  path: z.string(),
  questions: z.number().int().nonnegative(),
  marks: z.number().int().nonnegative(),
})
export type LibraryPaper = z.infer<typeof libraryPaperSchema>

/** `GET /api/library`: every paper with at least one approved question, newest first. Held-out sessions are absent (D31). */
export const libraryResponseSchema = z.object({ papers: z.array(libraryPaperSchema) })
export type LibraryResponse = z.infer<typeof libraryResponseSchema>

/** Where the caller stands on a question: nothing yet, a check in progress, feedback, or the teacher's review. */
export const QUESTION_PROGRESS = ['none', 'checking', 'checked', 'uncertain', 'reviewed'] as const
export const questionProgressSchema = z.enum(QUESTION_PROGRESS)
export type QuestionProgress = z.infer<typeof questionProgressSchema>

export const libraryQuestionSchema = z.object({
  id: uuid,
  /** "3.2": the number in the paper. */
  question: z.string(),
  topic: z.string(),
  skillTags: z.array(z.string()),
  promptMd: z.string(),
  maxMarks: z.number().int(),
  revision: z.number().int(),
  /** True when the item has a diagram: fetch it from `GET /api/library/items/:id/diagram`, never from a bucket. */
  hasDiagram: z.boolean(),
  attribution: z.string(),
  source: itemSourceSchema,
  sourceRef: sourceRefSchema,
  /** Learners: true when a class of theirs has this revision approved. Teachers: null. */
  approvedForYou: z.boolean().nullable(),
  progress: questionProgressSchema,
  /** The learner's latest attempt on it, for the progress mark. */
  attemptId: uuid.nullable(),
  /** The memo (marking steps): after the learner's own attempt, or for teachers; null until then. */
  memoSteps: z.array(guidelineStepSchema).nullable(),
})
export type LibraryQuestion = z.infer<typeof libraryQuestionSchema>

export const libraryPaperResponseSchema = z.object({
  paper: libraryPaperSchema,
  questions: z.array(libraryQuestionSchema),
  download: z.object({ label: z.string(), url: z.string() }),
})
export type LibraryPaperResponse = z.infer<typeof libraryPaperResponseSchema>

export const MAX_LIBRARY_QUERY_CHARS = 80

export const librarySearchResultSchema = libraryQuestionSchema.extend({ paper: libraryPaperSchema })
export const librarySearchResponseSchema = z.object({ query: z.string(), results: z.array(librarySearchResultSchema) })
export type LibrarySearchResponse = z.infer<typeof librarySearchResponseSchema>

// ── what comes up ───────────────────────────────────────────────────────────────────────

export const whatComesUpEntrySchema = z.object({
  skillTag: z.string(),
  /** Papers of this number the skill appears in, out of those loaded. */
  papers: z.number().int().nonnegative(),
  ofPapers: z.number().int().positive(),
  paperNo: z.number().int().positive(),
  /** The earliest year of the papers counted. */
  since: z.number().int(),
  /** Marks it carries in a paper it appears in, on average. */
  marks: z.number().nonnegative(),
  /** "In every Paper 1 since 2022, about 6 marks". */
  sentence: z.string(),
})
export type WhatComesUpEntry = z.infer<typeof whatComesUpEntrySchema>

/** Keyed by skill tag, so a chip looks its line up without a search. */
export const whatComesUpMapSchema = z.record(z.string(), whatComesUpEntrySchema)
export type WhatComesUpMap = z.infer<typeof whatComesUpMapSchema>

export const whatComesUpResponseSchema = z.object({ papers: z.number().int().nonnegative(), entries: z.array(whatComesUpEntrySchema) })
export type WhatComesUpResponse = z.infer<typeof whatComesUpResponseSchema>

/** The one sentence under a skill chip. Pure; the number words follow the counts. */
export function comesUpSentence(entry: Pick<WhatComesUpEntry, 'papers' | 'ofPapers' | 'paperNo' | 'since' | 'marks'>): string {
  const marks = Math.round(entry.marks)
  const about = `about ${marks} ${marks === 1 ? 'mark' : 'marks'}`
  if (entry.ofPapers === 1) return `In Paper ${entry.paperNo} ${entry.since}, ${about}`
  if (entry.papers === entry.ofPapers) return `In every Paper ${entry.paperNo} since ${entry.since}, ${about}`
  return `In ${entry.papers} of ${entry.ofPapers} Paper ${entry.paperNo}s since ${entry.since}, ${about}`
}

// ── class practice ──────────────────────────────────────────────────────────────────────

export const PRACTICE_KINDS = ['paper', 'topic'] as const
export const practiceKindSchema = z.enum(PRACTICE_KINDS)
export type PracticeKind = z.infer<typeof practiceKindSchema>

/** `POST /api/teacher/classes/:id/library/approve`: every question of one paper, for the class. */
export const approvePaperBodySchema = paperRefSchema
export type ApprovePaperBody = z.infer<typeof approvePaperBodySchema>

export const approvePaperResponseSchema = z.object({
  /** The paper, or null for a topic set. */
  paper: libraryPaperSchema.nullable(),
  title: z.string(),
  questions: z.number().int().nonnegative(),
  /** Questions approved by this call, and those this class had already approved at this revision. */
  approved: z.number().int().nonnegative(),
  alreadyApproved: z.number().int().nonnegative(),
})
export type ApprovePaperResponse = z.infer<typeof approvePaperResponseSchema>

/** `POST /api/teacher/classes/:id/practice`: a paper, or every library question on a skill, by a date. */
export const createClassPracticeBodySchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('paper'), paper: paperRefSchema, dueOn: isoDateSchema }).strict(),
  z.object({ kind: z.literal('topic'), skillTag: skillTagSchema, dueOn: isoDateSchema }).strict(),
])
export type CreateClassPracticeBody = z.infer<typeof createClassPracticeBodySchema>

export const classPracticeViewSchema = z.object({
  id: uuid,
  classId: uuid,
  kind: practiceKindSchema,
  /** "NSC Mathematics P1, November 2023" or the skill in teacher words. */
  title: z.string(),
  skillTag: z.string().nullable(),
  paper: libraryPaperSchema.nullable(),
  /** YYYY-MM-DD. */
  dueOn: z.string(),
  questions: z.number().int().nonnegative(),
  assignedBy: personRef,
  createdAt: z.string(),
})
export type ClassPracticeView = z.infer<typeof classPracticeViewSchema>

export const classPracticeResponseSchema = z.object({ practice: classPracticeViewSchema })
export type ClassPracticeResponse = z.infer<typeof classPracticeResponseSchema>
export const classPracticeListResponseSchema = z.object({ class: classRef, practice: z.array(classPracticeViewSchema) })
export type ClassPracticeListResponse = z.infer<typeof classPracticeListResponseSchema>

/** What a learner sees of it on Today: the set, the date, and how far they are. */
export const learnerPracticeSchema = z.object({
  id: uuid,
  kind: practiceKindSchema,
  title: z.string(),
  className: z.string(),
  skillTag: z.string().nullable(),
  /** The paper's library path, for the link; null for a topic set. */
  path: z.string().nullable(),
  dueOn: z.string(),
  daysAway: z.number().int(),
  done: z.number().int().nonnegative(),
  total: z.number().int().nonnegative(),
})
export type LearnerPractice = z.infer<typeof learnerPracticeSchema>

/** What a guardian sees of it under "What's coming": the title and the date, never a question. */
export const guardianPracticeSchema = z.object({ title: z.string(), className: z.string(), dueOn: z.string(), daysAway: z.number().int() })
export type GuardianPractice = z.infer<typeof guardianPracticeSchema>

/** The parent's "This week" line on past papers: counts and topics in parent words, never the work. */
export const pastPapersWeekSchema = z.object({
  questions: z.number().int().nonnegative(),
  /** Done in independent or retention mode (no hints). */
  alone: z.number().int().nonnegative(),
  topics: z.array(z.string()),
  sentence: z.string(),
})
export type PastPapersWeek = z.infer<typeof pastPapersWeekSchema>

/** "Lerato did 3 past exam questions on factorising; 2 without help." */
export function pastPapersSentence(nickname: string, counts: { questions: number; alone: number; topics: string[] }): string {
  const noun = counts.questions === 1 ? 'past exam question' : 'past exam questions'
  const on = counts.topics.length > 0 ? ` on ${listWords(counts.topics.map((topic) => topic.toLowerCase()))}` : ''
  const alone = counts.alone > 0 ? `; ${counts.alone} without help` : ''
  return `${nickname} did ${counts.questions} ${noun}${on}${alone}.`
}

function listWords(words: string[]): string {
  if (words.length <= 1) return words[0] ?? ''
  if (words.length === 2) return `${words[0]} and ${words[1]}`
  return `${words.slice(0, -1).join(', ')} and ${words[words.length - 1]}`
}
