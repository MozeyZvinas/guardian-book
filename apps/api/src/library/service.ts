import { and, asc, desc, eq, gte, inArray, lt, sql } from 'drizzle-orm'
import {
  DBE_PAST_PAPERS_LABEL,
  DBE_PAST_PAPERS_URL,
  SESSION_LABEL,
  comesUpSentence,
  comparePapersNewestFirst,
  compareQuestionNumbers,
  dayOf,
  daysBetween,
  paperPath,
  paperTitle,
  pastPapersSentence,
  provenanceColumns,
  samePaper,
  skillLabel,
  skillLabels,
  sourceRefSchema,
  subjectSlug,
  paperRefSchema,
  type ApprovePaperResponse,
  type ClassPracticeListResponse,
  type ClassPracticeView,
  type CreateClassPracticeBody,
  type GuardianPractice,
  type GuidelineStep,
  type LearnerPractice,
  type LibraryPaper,
  type LibraryPaperResponse,
  type LibraryQuestion,
  type LibraryResponse,
  type LibrarySearchResponse,
  type PaperRef,
  type PastPapersWeek,
  type QuestionProgress,
  type SourceRef,
  type WhatComesUpEntry,
  type WhatComesUpMap,
  type WhatComesUpResponse,
} from '@guardian-book/shared'
import { can } from '../access/index.js'
import { recordAudit } from '../audit/record.js'
import type { Actor } from '../auth/session.js'
import type { Db, DbOrTx } from '../db/client.js'
import { assessments, attempts, classMembers, classPractice, classes, guidelineApprovals, guidelineSteps, items, profiles, reviews } from '../db/schema.js'
import { HttpError, notFound } from '../lib/http.js'
import type { Storage, StoredObject } from '../storage/index.js'
import { approveGuideline } from '../teacher/guidelines.js'

/**
 * The past-paper library (brief B17 phase B; D40): real NSC questions, loaded with their
 * memos as `dbe_nsc` items, browsed Subject → Grade → Year → Session → Paper; a teacher
 * approves a whole paper for a class and sets a paper or a topic as class practice; the
 * Brain and the plan read "what comes up". Every question carries its attribution line.
 *
 * Held-out items (D31) never leave this module: `bankItems` excludes them, so the library,
 * search, practice, check-it-alone and "what comes up" never see the newest session.
 * No response here ever carries a PDF or bucket URL: a diagram is proxied by item ID.
 */

type ItemRow = typeof items.$inferSelect
export type BankItem = ItemRow & { ref: SourceRef }

export const DIAGRAM_CACHE_CONTROL = 'private, max-age=3600'

export const noQuestions = () => new HttpError(409, 'no_questions', 'There are no library questions on that yet.')
export const practiceNotApproved = (missing: number) =>
  new HttpError(409, 'guideline_not_approved', `Approve the ${missing === 1 ? 'question' : `${missing} questions`} for the class first; practice is only ever checked against a guideline you approved.`)

/** Approved, from DBE, not held out, with a readable paper reference. */
export async function bankItems(db: DbOrTx): Promise<BankItem[]> {
  const rows = await db
    .select()
    .from(items)
    .where(and(eq(items.status, 'approved'), eq(items.source, 'dbe_nsc'), eq(items.heldOut, false)))
  return rows.flatMap((row) => {
    const ref = sourceRefSchema.safeParse(row.sourceRef)
    return ref.success ? [{ ...row, ref: ref.data }] : []
  })
}

function paperView(ref: PaperRef, questions: readonly { maxMarks: number }[]): LibraryPaper {
  return {
    subject: ref.subject,
    grade: ref.grade,
    year: ref.year,
    session: ref.session,
    paper: ref.paper,
    subjectSlug: subjectSlug(ref.subject),
    sessionLabel: SESSION_LABEL[ref.session],
    title: paperTitle(ref),
    path: paperPath(ref),
    questions: questions.length,
    marks: questions.reduce((total, question) => total + question.maxMarks, 0),
  }
}

/** The bank grouped by paper, newest first. */
function groupByPaper(bank: readonly BankItem[]): Array<{ ref: PaperRef; items: BankItem[] }> {
  const byPath = new Map<string, { ref: PaperRef; items: BankItem[] }>()
  for (const item of bank) {
    const { question: _question, ...ref } = item.ref
    const key = paperPath(ref)
    const group = byPath.get(key) ?? { ref, items: [] }
    group.items.push(item)
    byPath.set(key, group)
  }
  return [...byPath.values()].sort((a, b) => comparePapersNewestFirst(a.ref, b.ref))
}

export async function listPapers(db: DbOrTx): Promise<LibraryResponse> {
  return { papers: groupByPaper(await bankItems(db)).map((group) => paperView(group.ref, group.items)) }
}

/** The paper a path names (`mathematics/12/2023/november/p1`), among the loaded papers. */
export interface PaperLocator {
  subjectSlug: string
  grade: number
  year: number
  session: PaperRef['session']
  paper: number
}

function matchesLocator(ref: PaperRef, locator: PaperLocator): boolean {
  return samePaper(ref, { subject: locator.subjectSlug, grade: locator.grade, year: locator.year, session: locator.session, paper: locator.paper })
}

// ── the caller's standing on each question ──────────────────────────────────────────────

interface Standing {
  progress: QuestionProgress
  attemptId: string | null
}

/** The latest own attempt per item (fix-it retries excluded) and what became of it. */
async function standings(db: DbOrTx, learnerId: string, itemIds: readonly string[]): Promise<Map<string, Standing>> {
  const result = new Map<string, Standing>()
  if (itemIds.length === 0) return result
  const rows = await db
    .select({ itemId: attempts.itemId, attemptId: attempts.id, assessingStartedAt: attempts.assessingStartedAt, assessment: assessments.status, review: reviews.state })
    .from(attempts)
    .leftJoin(assessments, eq(assessments.attemptId, attempts.id))
    .leftJoin(reviews, eq(reviews.assessmentId, assessments.id))
    .where(and(eq(attempts.learnerId, learnerId), inArray(attempts.itemId, [...itemIds]), sql`${attempts.parentAttemptId} is null`))
    .orderBy(desc(attempts.createdAt), desc(attempts.id))
  for (const row of rows) {
    if (result.has(row.itemId)) continue
    let progress: QuestionProgress = 'checking'
    if (row.review === 'released') progress = 'reviewed'
    else if (row.assessment === 'proposed') progress = 'checked'
    else if (row.assessment === 'uncertain' || row.assessment === 'failed') progress = 'uncertain'
    result.set(row.itemId, { progress, attemptId: row.attemptId })
  }
  return result
}

async function approvedForLearner(db: DbOrTx, learnerId: string): Promise<Set<string>> {
  const rows = await db
    .select({ itemId: guidelineApprovals.itemId, itemRevision: guidelineApprovals.itemRevision })
    .from(guidelineApprovals)
    .innerJoin(classMembers, and(eq(classMembers.classId, guidelineApprovals.classId), eq(classMembers.learnerId, learnerId)))
  return new Set(rows.map((row) => `${row.itemId}@${row.itemRevision}`))
}

async function stepsFor(db: DbOrTx, itemIds: readonly string[]): Promise<Map<string, GuidelineStep[]>> {
  const result = new Map<string, GuidelineStep[]>()
  if (itemIds.length === 0) return result
  const rows = await db
    .select({
      id: guidelineSteps.id,
      itemId: guidelineSteps.itemId,
      stepNo: guidelineSteps.stepNo,
      stepType: guidelineSteps.stepType,
      criterion: guidelineSteps.criterion,
      marks: guidelineSteps.marks,
      skillTag: guidelineSteps.skillTag,
      notes: guidelineSteps.notes,
    })
    .from(guidelineSteps)
    .where(inArray(guidelineSteps.itemId, [...itemIds]))
    .orderBy(asc(guidelineSteps.stepNo))
  for (const { itemId, ...step } of rows) {
    const list = result.get(itemId) ?? []
    list.push(step)
    result.set(itemId, list)
  }
  return result
}

/**
 * Questions as this caller sees them: the memo after the learner's own attempt (the same
 * rule as `access.can('item.guideline.read')`) or for a teacher; the progress mark from the
 * learner's latest attempt; never the diagram key, only whether there is one.
 */
async function questionViews(db: DbOrTx, actor: Actor, list: readonly BankItem[]): Promise<LibraryQuestion[]> {
  const ids = list.map((item) => item.id)
  const learner = actor.role === 'learner'
  const [standing, approved, steps] = await Promise.all([
    learner ? standings(db, actor.userId, ids) : Promise.resolve(new Map<string, Standing>()),
    learner ? approvedForLearner(db, actor.userId) : Promise.resolve(new Set<string>()),
    stepsFor(db, ids),
  ])
  return [...list]
    .sort((a, b) => compareQuestionNumbers(a.ref.question, b.ref.question))
    .map((item) => {
      const mine = standing.get(item.id) ?? null
      const memoVisible = actor.role === 'teacher' || actor.role === 'admin' || mine !== null
      return {
        id: item.id,
        question: item.ref.question,
        topic: item.topic,
        skillTags: item.skillTags,
        promptMd: item.promptMd,
        maxMarks: item.maxMarks,
        revision: item.revision,
        hasDiagram: item.diagramKey !== null,
        attribution: item.attribution ?? '',
        source: 'dbe_nsc',
        sourceRef: item.ref,
        approvedForYou: learner ? approved.has(`${item.id}@${item.revision}`) : null,
        progress: mine?.progress ?? 'none',
        attemptId: mine?.attemptId ?? null,
        memoSteps: memoVisible ? (steps.get(item.id) ?? []) : null,
      }
    })
}

export async function paperQuestions(db: DbOrTx, actor: Actor, locator: PaperLocator): Promise<LibraryPaperResponse> {
  const group = groupByPaper(await bankItems(db)).find((candidate) => matchesLocator(candidate.ref, locator))
  if (!group) throw notFound()
  return {
    paper: paperView(group.ref, group.items),
    questions: await questionViews(db, actor, group.items),
    download: { label: DBE_PAST_PAPERS_LABEL, url: DBE_PAST_PAPERS_URL },
  }
}

const MAX_SEARCH_RESULTS = 50

/** Search by topic: the topic line, the skill in any wording, the tag, or the paper's name. */
export async function searchQuestions(db: DbOrTx, actor: Actor, query: string): Promise<LibrarySearchResponse> {
  const needle = query.trim().toLowerCase()
  if (needle.length === 0) return { query: '', results: [] }
  const bank = await bankItems(db)
  const papers = new Map(groupByPaper(bank).map((group) => [paperPath(group.ref), paperView(group.ref, group.items)]))
  const hits = bank.filter((item) => {
    const words = [item.topic, ...item.skillTags, ...item.skillTags.flatMap((tag) => Object.values(skillLabels(tag))), paperTitle(item.ref)]
    return words.some((word) => word.toLowerCase().includes(needle))
  })
  const views = await questionViews(db, actor, hits.slice(0, MAX_SEARCH_RESULTS))
  const refOf = new Map(hits.map((item) => [item.id, item.ref]))
  return {
    query: query.trim(),
    results: views.map((view) => {
      const { question: _question, ...ref } = refOf.get(view.id) ?? view.sourceRef
      return { ...view, paper: papers.get(paperPath(ref)) ?? paperView(ref, []) }
    }),
  }
}

// ── what comes up ───────────────────────────────────────────────────────────────────────

/**
 * Per skill: in how many papers of one number it appears and the marks it carries there
 * (summed over the memo steps tagged with it). The paper number with the most appearances
 * speaks for the skill. Aggregate structure only: no question text, nothing held out.
 */
export async function whatComesUp(db: DbOrTx): Promise<WhatComesUpResponse> {
  const bank = await bankItems(db)
  const groups = groupByPaper(bank)
  if (groups.length === 0) return { papers: 0, entries: [] }
  const steps = await stepsFor(
    db,
    bank.map((item) => item.id),
  )
  const paperOf = new Map<string, { key: string; no: number; year: number }>()
  for (const group of groups) {
    for (const item of group.items) paperOf.set(item.id, { key: paperPath(group.ref), no: group.ref.paper, year: group.ref.year })
  }
  // paper number → the papers loaded with that number
  const papersByNo = new Map<number, Map<string, number>>()
  for (const group of groups) {
    const byKey = papersByNo.get(group.ref.paper) ?? new Map<string, number>()
    byKey.set(paperPath(group.ref), group.ref.year)
    papersByNo.set(group.ref.paper, byKey)
  }
  // skill → paper number → paper key → marks
  const marksBySkill = new Map<string, Map<number, Map<string, number>>>()
  for (const item of bank) {
    const paper = paperOf.get(item.id)
    if (!paper) continue
    for (const step of steps.get(item.id) ?? []) {
      const byNo = marksBySkill.get(step.skillTag) ?? new Map<number, Map<string, number>>()
      const byKey = byNo.get(paper.no) ?? new Map<string, number>()
      byKey.set(paper.key, (byKey.get(paper.key) ?? 0) + step.marks)
      byNo.set(paper.no, byKey)
      marksBySkill.set(step.skillTag, byNo)
    }
  }
  const entries: WhatComesUpEntry[] = []
  for (const [skillTag, byNo] of marksBySkill) {
    let best: WhatComesUpEntry | null = null
    for (const [paperNo, byKey] of byNo) {
      const loaded = papersByNo.get(paperNo)
      if (!loaded || loaded.size === 0) continue
      const appearances = byKey.size
      const marks = [...byKey.values()].reduce((total, value) => total + value, 0) / appearances
      const since = Math.min(...loaded.values())
      const candidate = { skillTag, papers: appearances, ofPapers: loaded.size, paperNo, since, marks: Math.round(marks * 10) / 10, sentence: '' }
      candidate.sentence = comesUpSentence(candidate)
      if (!best || candidate.papers > best.papers || (candidate.papers === best.papers && candidate.paperNo < best.paperNo)) best = candidate
    }
    if (best) entries.push(best)
  }
  entries.sort((a, b) => b.papers - a.papers || b.marks - a.marks || a.skillTag.localeCompare(b.skillTag))
  return { papers: groups.length, entries }
}

export async function whatComesUpMap(db: DbOrTx): Promise<WhatComesUpMap> {
  const { entries } = await whatComesUp(db)
  return Object.fromEntries(entries.map((entry) => [entry.skillTag, entry]))
}

// ── diagrams ────────────────────────────────────────────────────────────────────────────

/** The diagram bytes for an approved, not held-out item, proxied so no bucket URL ever leaves the server. */
export async function diagramFor(db: DbOrTx, storage: Storage | null, itemId: string): Promise<StoredObject | null> {
  const [row] = await db
    .select({ diagramKey: items.diagramKey })
    .from(items)
    .where(and(eq(items.id, itemId), eq(items.status, 'approved'), eq(items.heldOut, false)))
    .limit(1)
  if (!row?.diagramKey || !storage) return null
  return storage.getObject(row.diagramKey)
}

// ── the teacher: approve a paper or a topic set, set class practice ─────────────────────

export type ApprovalSet = { kind: 'paper'; paper: PaperRef } | { kind: 'topic'; skillTag: string }

/** The items of one paper, or every bank question tagged with a skill (on the item or in its memo). */
async function itemsOfSet(db: DbOrTx, set: ApprovalSet): Promise<{ list: BankItem[]; title: string; paper: LibraryPaper | null }> {
  const bank = await bankItems(db)
  if (set.kind === 'paper') {
    const group = groupByPaper(bank).find((candidate) => samePaper(candidate.ref, set.paper))
    if (!group) throw notFound()
    const view = paperView(group.ref, group.items)
    return { list: group.items, title: view.title, paper: view }
  }
  const steps = await stepsFor(
    db,
    bank.map((item) => item.id),
  )
  const list = bank.filter((item) => item.skillTags.includes(set.skillTag) || (steps.get(item.id) ?? []).some((step) => step.skillTag === set.skillTag))
  return { list, title: skillLabel(set.skillTag, 'teacher'), paper: null }
}

export async function approveSet(db: Db, actor: Actor, classId: string, set: ApprovalSet, requestId?: string): Promise<ApprovePaperResponse> {
  if (!(await can(db, actor, 'paper.approve', { type: 'class', id: classId }))) throw notFound()
  const { list, paper, title } = await itemsOfSet(db, set)
  if (list.length === 0) throw noQuestions()
  let approved = 0
  let alreadyApproved = 0
  // Each question is approved on its own row at its current revision (idempotent per item), as T7 does one by one.
  for (const item of list) {
    const result = await approveGuideline(db, actor, classId, item.id, { itemRevision: item.revision }, requestId)
    if (result.replayed) alreadyApproved += 1
    else approved += 1
  }
  await recordAudit(db, { actorId: actor.userId, action: 'library.set_approved', subjectType: 'class', subjectId: classId, outcome: 'ok', requestId: requestId ?? null })
  return { paper, title, questions: list.length, approved, alreadyApproved }
}

async function approvedForClass(db: DbOrTx, classId: string, list: readonly BankItem[]): Promise<number> {
  if (list.length === 0) return 0
  const rows = await db
    .select({ itemId: guidelineApprovals.itemId, itemRevision: guidelineApprovals.itemRevision })
    .from(guidelineApprovals)
    .where(
      and(
        eq(guidelineApprovals.classId, classId),
        inArray(
          guidelineApprovals.itemId,
          list.map((item) => item.id),
        ),
      ),
    )
  const current = new Set(rows.map((row) => `${row.itemId}@${row.itemRevision}`))
  return list.filter((item) => current.has(`${item.id}@${item.revision}`)).length
}

type PracticeRow = typeof classPractice.$inferSelect

async function practiceView(db: DbOrTx, row: PracticeRow): Promise<ClassPracticeView> {
  const [by] = await db.select({ nickname: profiles.nickname }).from(profiles).where(eq(profiles.userId, row.assignedBy)).limit(1)
  const ref = paperRefSchema.safeParse(row.paperRef)
  let paper: LibraryPaper | null = null
  if (ref.success) {
    const marks = row.itemIds.length > 0 ? await db.select({ maxMarks: items.maxMarks }).from(items).where(inArray(items.id, row.itemIds)) : []
    paper = paperView(ref.data, marks)
  }
  return {
    id: row.id,
    classId: row.classId,
    kind: row.kind,
    title: row.title,
    skillTag: row.skillTag,
    paper,
    dueOn: row.dueOn,
    questions: row.itemIds.length,
    assignedBy: { id: row.assignedBy, nickname: by?.nickname ?? 'Teacher' },
    createdAt: row.createdAt.toISOString(),
  }
}

/** Sets a paper or a topic set as class practice. Every question must already be approved for the class: practice is only checked against guidelines the teacher approved. */
export async function createPractice(db: Db, actor: Actor, classId: string, body: CreateClassPracticeBody, requestId?: string): Promise<ClassPracticeView> {
  if (!(await can(db, actor, 'practice.assign', { type: 'class', id: classId }))) throw notFound()
  const set: ApprovalSet = body.kind === 'paper' ? { kind: 'paper', paper: body.paper } : { kind: 'topic', skillTag: body.skillTag }
  const { list, title } = await itemsOfSet(db, set)
  if (list.length === 0) throw noQuestions()
  const approved = await approvedForClass(db, classId, list)
  if (approved < list.length) throw practiceNotApproved(list.length - approved)
  const row = await db.transaction(async (tx) => {
    const [inserted] = await tx
      .insert(classPractice)
      .values({
        classId,
        kind: body.kind,
        title,
        skillTag: body.kind === 'topic' ? body.skillTag : null,
        paperRef: body.kind === 'paper' ? body.paper : null,
        itemIds: list.map((item) => item.id),
        dueOn: body.dueOn,
        assignedBy: actor.userId,
        ...provenanceColumns('teacher_review'),
      })
      .returning()
    if (!inserted) throw new Error('class practice insert returned no row')
    await recordAudit(tx, { actorId: actor.userId, action: 'practice.assigned', subjectType: 'class_practice', subjectId: inserted.id, outcome: 'ok', requestId: requestId ?? null })
    return inserted
  })
  return practiceView(db, row)
}

export async function listPractice(db: DbOrTx, actor: Actor, classId: string): Promise<ClassPracticeListResponse> {
  if (!(await can(db, actor, 'practice.read', { type: 'class', id: classId }))) throw notFound()
  const [cls] = await db.select({ id: classes.id, name: classes.name }).from(classes).where(eq(classes.id, classId)).limit(1)
  if (!cls) throw notFound()
  const rows = await db.select().from(classPractice).where(eq(classPractice.classId, classId)).orderBy(asc(classPractice.dueOn), desc(classPractice.createdAt))
  const practice: ClassPracticeView[] = []
  for (const row of rows) practice.push(await practiceView(db, row))
  return { class: cls, practice }
}

// ── learners and guardians ──────────────────────────────────────────────────────────────

/** How many days past its date a set still shows on Today. */
const PRACTICE_GRACE_DAYS = 7
const DAY_MS = 24 * 60 * 60 * 1000

async function practiceForClasses(db: DbOrTx, learnerId: string, fromDay: string): Promise<Array<PracticeRow & { className: string }>> {
  const memberships = await db.select({ classId: classMembers.classId, name: classes.name }).from(classMembers).innerJoin(classes, eq(classes.id, classMembers.classId)).where(eq(classMembers.learnerId, learnerId))
  if (memberships.length === 0) return []
  const names = new Map(memberships.map((m) => [m.classId, m.name]))
  const rows = await db
    .select()
    .from(classPractice)
    .where(
      and(
        inArray(
          classPractice.classId,
          memberships.map((m) => m.classId),
        ),
        gte(classPractice.dueOn, fromDay),
      ),
    )
    .orderBy(asc(classPractice.dueOn), desc(classPractice.createdAt))
  return rows.map((row) => ({ ...row, className: names.get(row.classId) ?? '' }))
}

/** Today's practice card: the sets due from a week ago on, with how many questions the learner has brought. */
export async function learnerPractice(db: DbOrTx, learnerId: string, now: Date): Promise<LearnerPractice[]> {
  const today = dayOf(now)
  const rows = await practiceForClasses(db, learnerId, dayOf(new Date(now.getTime() - PRACTICE_GRACE_DAYS * DAY_MS)))
  if (rows.length === 0) return []
  const itemIds = [...new Set(rows.flatMap((row) => row.itemIds))]
  const done = new Set(
    itemIds.length > 0
      ? (await db.selectDistinct({ itemId: attempts.itemId }).from(attempts).where(and(eq(attempts.learnerId, learnerId), inArray(attempts.itemId, itemIds)))).map((row) => row.itemId)
      : [],
  )
  return rows.map((row) => {
    const ref = paperRefSchema.safeParse(row.paperRef)
    return {
      id: row.id,
      kind: row.kind,
      title: row.title,
      className: row.className,
      skillTag: row.skillTag,
      path: ref.success ? paperPath(ref.data) : null,
      dueOn: row.dueOn,
      daysAway: daysBetween(today, row.dueOn),
      done: row.itemIds.filter((id) => done.has(id)).length,
      total: row.itemIds.length,
    }
  })
}

const GUARDIAN_PRACTICE_LIMIT = 3

/** "What's coming" for a parent: the title and the date of upcoming sets, never a question. */
export async function guardianPractice(db: DbOrTx, learnerId: string, now: Date): Promise<GuardianPractice[]> {
  const today = dayOf(now)
  const rows = await practiceForClasses(db, learnerId, today)
  return rows.slice(0, GUARDIAN_PRACTICE_LIMIT).map((row) => ({ title: row.title, className: row.className, dueOn: row.dueOn, daysAway: daysBetween(today, row.dueOn) }))
}

const WEEK_TOPICS_LIMIT = 3

/** Past exam questions the learner brought this week, in parent words: counts and topics, never the work. */
export async function pastPapersThisWeek(db: DbOrTx, learner: { id: string; nickname: string }, weekStartAt: Date, weekEndAt: Date): Promise<PastPapersWeek | null> {
  const rows = await db
    .select({ itemId: attempts.itemId, mode: attempts.mode, skillTags: items.skillTags })
    .from(attempts)
    .innerJoin(items, eq(items.id, attempts.itemId))
    .where(and(eq(attempts.learnerId, learner.id), eq(items.source, 'dbe_nsc'), sql`${attempts.parentAttemptId} is null`, gte(attempts.createdAt, weekStartAt), lt(attempts.createdAt, weekEndAt)))
    .orderBy(asc(attempts.createdAt))
  if (rows.length === 0) return null
  const topics: string[] = []
  for (const row of rows) {
    const first = row.skillTags[0]
    if (!first) continue
    const label = skillLabel(first, 'guardian')
    if (!topics.includes(label) && topics.length < WEEK_TOPICS_LIMIT) topics.push(label)
  }
  const counts = { questions: rows.length, alone: rows.filter((row) => row.mode !== 'assisted').length, topics }
  return { ...counts, sentence: pastPapersSentence(learner.nickname, counts) }
}
