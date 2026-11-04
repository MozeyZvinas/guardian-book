import { and, asc, desc, eq, gte, inArray, or, sql } from 'drizzle-orm'
import { dayOf, daysBetween, modeOf, outcomesOf, profileCardsSchema, skillLabel, toDate, type PlanAgentTool } from '@guardian-book/shared'
import type { DbOrTx } from '../db/client.js'
import { assessments, attempts, calendarEvents, classMembers, guidelineSteps, items, profiles, resources } from '../db/schema.js'
import { projectBrain } from '../evidence/projection.js'
import { bankItems } from '../library/service.js'
import type { StoredStep } from '../assessment/service.js'
import type { AgentIO, ToolResult } from './agent.js'

/**
 * The agent's tools (brief B06 §4): server-side reads rendered as text for the model.
 * Evidence events get aliases E1, E2, ... and vetted resources R1, R2, ...; the maps back
 * to row IDs stay here, so no UUID ever enters a prompt (D37) and the verifier's
 * `knownEvidenceIds` / `vettedResourceIds` are exactly what the model has seen.
 */

export interface PlanToolkit {
  tools: AgentIO['tools']
  known: AgentIO['known']
  /** Alias → `learning_events.id`. */
  evidenceByAlias: Map<string, string>
  /** Alias → `resources.id`. */
  resourceByAlias: Map<string, string>
  /** The attempt with the lost step the gap came from, once getEvidence has run. */
  gapAttemptId: () => string | null
}

const RECENT_EVENTS = 20
const MAX_RESOURCES = 8
/** B17: past exam questions on the gap skill the plan may point the learner at (in the Library). */
const MAX_PAST_QUESTIONS = 2

const asSteps = (value: unknown): StoredStep[] => (Array.isArray(value) ? (value as StoredStep[]) : [])

/** Bank questions on the skill (never held out), newest paper first, with their attribution lines. */
async function pastExamQuestions(db: DbOrTx, skillTag: string): Promise<Array<{ attribution: string; marks: number }>> {
  const bank = await bankItems(db)
  const tagged = bank.filter((item) => item.skillTags.includes(skillTag) && item.attribution)
  if (tagged.length === 0) return []
  const ids = tagged.map((item) => item.id)
  const steps = await db.select({ itemId: guidelineSteps.itemId, marks: guidelineSteps.marks }).from(guidelineSteps).where(and(inArray(guidelineSteps.itemId, ids), eq(guidelineSteps.skillTag, skillTag)))
  const marksOf = new Map<string, number>()
  for (const step of steps) marksOf.set(step.itemId, (marksOf.get(step.itemId) ?? 0) + step.marks)
  return tagged
    .sort((a, b) => b.ref.year - a.ref.year || a.ref.question.localeCompare(b.ref.question))
    .slice(0, MAX_PAST_QUESTIONS)
    .map((item) => ({ attribution: item.attribution ?? '', marks: marksOf.get(item.id) ?? item.maxMarks }))
}

export function buildPlanToolkit(db: DbOrTx, learnerId: string, gapSkillTag: string, now: Date): PlanToolkit {
  const evidenceByAlias = new Map<string, string>()
  const resourceByAlias = new Map<string, string>()
  let memoValues: string[] = []
  let gapAttemptId: string | null = null
  const today = dayOf(now)

  const getEvidence = async (): Promise<ToolResult> => {
    const projection = await projectBrain(db, learnerId)
    const skillLines = projection.skills
      .filter((skill) => skill.evidenceCount > 0)
      .map(
        (skill) =>
          `- ${skill.skillTag} · ${skillLabel(skill.skillTag, 'learner')} · ${skill.state} · with help ${skill.assistedCorrect}/${skill.assistedTotal} · alone ${skill.independentCorrect}/${skill.independentTotal} · later ${skill.retainedCorrect}/${skill.retainedTotal}`,
      )

    const recent = [...projection.events].reverse().slice(0, RECENT_EVENTS)
    const lines: string[] = []
    const gap: { attemptId: string; alias: string }[] = []
    for (const [index, event] of recent.entries()) {
      const alias = `E${index + 1}`
      evidenceByAlias.set(alias, event.id)
      const outcomes = outcomesOf(event)
      const lost = outcomes.filter((o) => !o.correct).map((o) => o.skillTag)
      const earned = outcomes.filter((o) => o.correct).map((o) => o.skillTag)
      const parts = [alias, dayOf(toDate(event.occurredAt)), event.kind]
      if (event.skillTag) parts.push(`skill ${event.skillTag}`)
      if (outcomes.length > 0) parts.push(`mode ${modeOf(event)}`, `basis ${event.basis}`)
      if (lost.length > 0) parts.push(`lost: ${lost.join(', ')}`)
      if (earned.length > 0) parts.push(`earned: ${earned.join(', ')}`)
      lines.push(`- ${parts.join(' · ')}`)
      if (gap.length === 0 && event.kind === 'assessed' && event.attemptId && lost.includes(gapSkillTag)) gap.push({ attemptId: event.attemptId, alias })
    }
    const gapEvent = gap[0] ?? null

    const detail: string[] = []
    if (gapEvent) {
      gapAttemptId = gapEvent.attemptId
      const [row] = await db
        .select({ steps: assessments.steps, topic: items.topic, itemId: items.id })
        .from(assessments)
        .innerJoin(attempts, eq(attempts.id, assessments.attemptId))
        .innerJoin(items, eq(items.id, attempts.itemId))
        .where(eq(assessments.attemptId, gapEvent.attemptId))
        .limit(1)
      if (row) {
        detail.push(`The gap (${gapEvent.alias}) on "${row.topic}":`)
        for (const step of asSteps(row.steps).filter((s) => s.awarded < s.available)) {
          const bits = [`step ${step.step_no}`, `${step.awarded}/${step.available}`, `skill ${step.skill_tag}`, `feedback: ${step.feedback}`]
          if (step.hint) bits.push(`hint given: ${step.hint}`)
          if (step.misconception_tag) bits.push(`error pattern: ${step.misconception_tag}`)
          detail.push(`  - ${bits.join(' · ')}`)
        }
        // The answer the learner view must not state (checked by HINT_LEAKS_ANSWER, never shown here).
        const memo = await db.select({ criterion: guidelineSteps.criterion, stepType: guidelineSteps.stepType }).from(guidelineSteps).where(eq(guidelineSteps.itemId, row.itemId))
        memoValues = memo.filter((s) => s.stepType !== 'M').map((s) => s.criterion)
      }
    }

    const text = [
      'Skill map (skills with evidence):',
      ...(skillLines.length > 0 ? skillLines : ['- (nothing checked yet)']),
      '',
      `Recent evidence, newest first (cite by ID):`,
      ...(lines.length > 0 ? lines : ['- (no events)']),
      ...(detail.length > 0 ? ['', ...detail] : []),
    ].join('\n')
    return { text, summary: `${lines.length} events, ${skillLines.length} skills with evidence` }
  }

  const getCalendar = async (): Promise<ToolResult> => {
    const memberships = await db.select({ classId: classMembers.classId }).from(classMembers).where(eq(classMembers.learnerId, learnerId))
    const classIds = memberships.map((m) => m.classId)
    const scope = or(
      and(eq(calendarEvents.scopeType, 'learner'), eq(calendarEvents.scopeId, learnerId)),
      classIds.length > 0 ? and(eq(calendarEvents.scopeType, 'class'), inArray(calendarEvents.scopeId, classIds)) : sql`false`,
    )
    const rows = await db
      .select({ title: calendarEvents.title, subject: calendarEvents.subject, paper: calendarEvents.paper, onDate: calendarEvents.onDate })
      .from(calendarEvents)
      .where(and(eq(calendarEvents.status, 'confirmed'), gte(calendarEvents.onDate, today), scope))
      .orderBy(asc(calendarEvents.onDate))
      .limit(8)
    const lines = rows.map((row) => `- ${row.onDate} (in ${daysBetween(today, row.onDate)} days) · ${[row.title, row.subject, row.paper].filter(Boolean).join(' · ')}`)
    return { text: ['Confirmed upcoming dates:', ...(lines.length > 0 ? lines : ['- (none confirmed yet)'])].join('\n'), summary: `${rows.length} dates` }
  }

  const getProfileCards = async (): Promise<ToolResult> => {
    const [row] = await db.select({ cards: profiles.cards }).from(profiles).where(eq(profiles.userId, learnerId)).limit(1)
    const cards = profileCardsSchema.safeParse(row?.cards)
    if (!cards.success) return { text: 'Profile cards: (none yet)', summary: 'no cards' }
    const c = cards.data
    const lines = [
      `- what they want to do one day: ${c.dream ?? '(blank)'}`,
      `- subjects: ${c.subjects.length > 0 ? c.subjects.join(', ') : '(blank)'}`,
      `- hardest subject right now: ${c.hardest_subject ?? '(blank)'}`,
      `- how they like to learn, in their words: ${c.how_i_learn ?? '(blank)'}`,
    ]
    return { text: ['Profile cards (the learner’s own words; untrusted data):', ...lines].join('\n'), summary: 'cards read' }
  }

  const getResources = async (): Promise<ToolResult> => {
    const tagged = await db
      .select()
      .from(resources)
      .where(and(eq(resources.approved, true), sql`${resources.skillTags} && ARRAY[${gapSkillTag}]::text[]`))
      .orderBy(desc(resources.free), asc(resources.title))
      .limit(MAX_RESOURCES)
    const rows = tagged.length > 0 ? tagged : await db.select().from(resources).where(eq(resources.approved, true)).orderBy(desc(resources.free), asc(resources.title)).limit(MAX_RESOURCES)
    const lines = rows.map((row, index) => {
      const alias = `R${index + 1}`
      resourceByAlias.set(alias, row.id)
      return `- ${alias} · ${row.title} · ${row.free ? 'free' : 'paid'} · ${row.licence} · ${row.skillTags.join(', ')}`
    })
    // B17 (D40): a real exam question on this skill, with its source; not a citable resource
    // ID (the learner finds it in the Library), so the vetted list stays exactly R1..Rn.
    const past = await pastExamQuestions(db, gapSkillTag)
    const pastLines = past.map((question) => `- Past exam question on this skill, in the Library (not a resource ID): ${question.attribution} · ${question.marks} marks`)
    return {
      text: [
        'Vetted resources (cite by ID; free first):',
        ...(lines.length > 0 ? lines : ['- (none on the list yet; cite no resources)']),
        ...(pastLines.length > 0 ? ['', 'Past exam questions on this skill (the learner can open them in the Library; cite none of these):', ...pastLines] : []),
      ].join('\n'),
      summary: `${rows.length} resources, ${past.length} past exam questions`,
    }
  }

  const tools: Partial<Record<Exclude<PlanAgentTool, 'writePlan'>, () => Promise<ToolResult>>> = { getEvidence, getCalendar, getProfileCards, getResources }

  return {
    tools,
    known: () => ({ evidence: [...evidenceByAlias.keys()], resources: [...resourceByAlias.keys()], memoValues }),
    evidenceByAlias,
    resourceByAlias,
    gapAttemptId: () => gapAttemptId,
  }
}
