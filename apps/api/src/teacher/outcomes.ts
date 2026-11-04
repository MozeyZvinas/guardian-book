import { and, desc, eq, gte, inArray } from 'drizzle-orm'
import { evidencePayload, outcomesOf, type BrainEvent, type EventBasis, type EventPayload, type GapView, type LearningEventKind } from '@guardian-book/shared'
import type { DbOrTx } from '../db/client.js'
import { assessments, attempts, guidelineSteps, items, reviews } from '../db/schema.js'

/**
 * Trusted outcomes (spec 03 §8.3 "from confirmed or high-confidence events"; P0-07 "only
 * high-confidence or teacher-confirmed events move state"). For every attempt with a
 * result, the per-step outcome the class picture, the learner profile and notes home may
 * read: the teacher's review when one exists (it overrides the model for that attempt),
 * otherwise the model's proposal only when every step was high confidence. An `uncertain`
 * result is never evidence.
 *
 * Read from the rows (`reviews`, `assessments`, written once) rather than the event stream,
 * so the picture never depends on another brief's payload shape; the events carry the same
 * facts for the Brain (B05's reducer).
 */

export interface OutcomeStep {
  stepId: string
  stepNo: number
  criterion: string
  skillTag: string
  awarded: number
  available: number
}

export interface AttemptOutcome {
  attemptId: string
  learnerId: string
  itemId: string
  itemSlug: string
  itemTopic: string
  mode: 'assisted' | 'independent' | 'retention'
  basis: 'teacher_confirmed' | 'model_high'
  occurredAt: Date
  steps: OutcomeStep[]
}

/** The stored step shape shared by `assessments.steps` and `reviews.steps` (spec 03 §2), as far as this module reads it. */
interface StoredStepLike {
  step_id: string
  step_no?: number
  skill_tag?: string
  awarded: number
  available: number
  confidence?: string
}

const asStoredSteps = (value: unknown): StoredStepLike[] =>
  Array.isArray(value) ? value.filter((step): step is StoredStepLike => typeof step === 'object' && step !== null && typeof (step as StoredStepLike).step_id === 'string') : []

export async function trustedOutcomes(db: DbOrTx, learnerIds: readonly string[], options: { since?: Date } = {}): Promise<AttemptOutcome[]> {
  if (learnerIds.length === 0) return []
  const where = options.since ? and(inArray(attempts.learnerId, [...learnerIds]), gte(attempts.createdAt, options.since)) : inArray(attempts.learnerId, [...learnerIds])
  const rows = await db
    .select({ attempt: attempts, assessment: assessments, review: reviews, item: items })
    .from(attempts)
    .innerJoin(assessments, eq(assessments.attemptId, attempts.id))
    .leftJoin(reviews, eq(reviews.assessmentId, assessments.id))
    .innerJoin(items, eq(items.id, attempts.itemId))
    .where(where)
    .orderBy(desc(attempts.createdAt))
  if (rows.length === 0) return []

  const itemIds = [...new Set(rows.map((row) => row.item.id))]
  const steps = await db
    .select({ id: guidelineSteps.id, stepNo: guidelineSteps.stepNo, criterion: guidelineSteps.criterion, skillTag: guidelineSteps.skillTag })
    .from(guidelineSteps)
    .where(inArray(guidelineSteps.itemId, itemIds))
  const guideline = new Map(steps.map((step) => [step.id, step]))

  const outcomes: AttemptOutcome[] = []
  for (const row of rows) {
    let stored: StoredStepLike[]
    let basis: AttemptOutcome['basis']
    let occurredAt: Date
    if (row.review) {
      stored = asStoredSteps(row.review.steps)
      basis = 'teacher_confirmed'
      occurredAt = row.review.confirmedAt
    } else if (row.assessment.status === 'proposed') {
      stored = asStoredSteps(row.assessment.steps)
      if (stored.length === 0 || !stored.every((step) => step.confidence === 'high')) continue
      basis = 'model_high'
      occurredAt = row.assessment.createdAt
    } else {
      continue
    }
    const mapped: OutcomeStep[] = []
    for (const step of stored) {
      const name = guideline.get(step.step_id)
      mapped.push({
        stepId: step.step_id,
        stepNo: name?.stepNo ?? step.step_no ?? 0,
        criterion: name?.criterion ?? '',
        skillTag: name?.skillTag ?? step.skill_tag ?? '',
        awarded: step.awarded,
        available: step.available,
      })
    }
    if (mapped.length === 0) continue
    outcomes.push({
      attemptId: row.attempt.id,
      learnerId: row.attempt.learnerId,
      itemId: row.item.id,
      itemSlug: row.item.slug,
      itemTopic: row.item.topic,
      mode: row.attempt.mode,
      basis,
      occurredAt,
      steps: mapped.sort((a, b) => a.stepNo - b.stepNo),
    })
  }
  return outcomes
}

// ── pure helpers ───────────────────────────────────────────────────────────────────────────

/** The skills an outcome states: lost when any step on the skill lost a mark; correct when every step was full. */
export function skillOutcomes(steps: readonly OutcomeStep[]): { correct: string[]; lost: string[] } {
  const lost = new Set<string>()
  const seen = new Set<string>()
  for (const step of steps) {
    if (!step.skillTag) continue
    seen.add(step.skillTag)
    if (step.awarded < step.available) lost.add(step.skillTag)
  }
  return { correct: [...seen].filter((tag) => !lost.has(tag)), lost: [...lost] }
}

/**
 * The learning-event payload for a teacher-confirmed result, built with the one payload
 * shape that moves the Brain (D37; B05's `evidencePayload()`): `skills_correct`,
 * `skills_lost` from the confirmed steps and `mode` from the attempt.
 */
export function reviewEvidencePayload(steps: readonly OutcomeStep[], mode: AttemptOutcome['mode'], extra: EventPayload = {}): EventPayload {
  const { correct, lost } = skillOutcomes(steps)
  return evidencePayload({ skills_correct: correct, skills_lost: lost, mode }, extra)
}

interface LatestSkill {
  lost: boolean
  occurredAt: Date
  step: OutcomeStep
  outcome: AttemptOutcome
}

/** The latest trusted statement per (learner, skill), newest attempt wins. */
export function latestPerLearnerSkill(outcomes: readonly AttemptOutcome[]): Map<string, LatestSkill> {
  const latest = new Map<string, LatestSkill>()
  for (const outcome of outcomes) {
    const lostHere = new Set(skillOutcomes(outcome.steps).lost)
    for (const skill of new Set(outcome.steps.map((step) => step.skillTag).filter(Boolean))) {
      const key = `${outcome.learnerId}|${skill}`
      const current = latest.get(key)
      if (current && current.occurredAt.getTime() >= outcome.occurredAt.getTime()) continue
      const lostStep = outcome.steps.find((step) => step.skillTag === skill && step.awarded < step.available)
      const step = lostStep ?? outcome.steps.find((s) => s.skillTag === skill)
      if (!step) continue
      latest.set(key, { lost: lostHere.has(skill), occurredAt: outcome.occurredAt, step, outcome })
    }
  }
  return latest
}

/** "n of m lost the mark at step 2 of factorising": per skill, the learners whose latest result lost it (spec 03 §8.3). */
export function sharedGaps(outcomes: readonly AttemptOutcome[], memberIds: readonly string[]): GapView[] {
  const members = new Set(memberIds)
  const perSkill = new Map<string, { learnerIds: Set<string>; examples: Map<string, { count: number; example: NonNullable<GapView['example']> }> }>()
  for (const [key, latest] of latestPerLearnerSkill(outcomes)) {
    const [learnerId = '', skillTag = ''] = key.split('|')
    if (!latest.lost || !members.has(learnerId)) continue
    let entry = perSkill.get(skillTag)
    if (!entry) {
      entry = { learnerIds: new Set(), examples: new Map() }
      perSkill.set(skillTag, entry)
    }
    entry.learnerIds.add(learnerId)
    const exampleKey = `${latest.outcome.itemSlug}#${latest.step.stepNo}`
    const example = entry.examples.get(exampleKey)
    if (example) example.count += 1
    else entry.examples.set(exampleKey, { count: 1, example: { itemSlug: latest.outcome.itemSlug, itemTopic: latest.outcome.itemTopic, stepNo: latest.step.stepNo, criterion: latest.step.criterion } })
  }
  const gaps: GapView[] = []
  for (const [skillTag, entry] of perSkill) {
    const top = [...entry.examples.values()].sort((a, b) => b.count - a.count)[0] ?? null
    gaps.push({ skillTag, learners: entry.learnerIds.size, of: members.size, learnerIds: [...entry.learnerIds].sort(), example: top?.example ?? null })
  }
  return gaps.sort((a, b) => b.learners - a.learners || a.skillTag.localeCompare(b.skillTag))
}

/** Skills one learner lost on two or more attempts ("repeated gaps", spec 05 §4.4 T2). */
export function repeatedSkills(outcomes: readonly AttemptOutcome[]): string[] {
  const counts = new Map<string, number>()
  for (const outcome of outcomes) {
    for (const skill of skillOutcomes(outcome.steps).lost) counts.set(skill, (counts.get(skill) ?? 0) + 1)
  }
  return [...counts.entries()]
    .filter(([, n]) => n >= 2)
    .map(([skill]) => skill)
    .sort()
}

/**
 * What one learning event says about one skill, read exactly as the Brain's reducer reads
 * it (B05's `outcomesOf`): a single-skill event (`skill_tag` + `correct`) or the
 * `skills_correct` / `skills_lost` lists, with the mode defaulting by kind. Null when the
 * event is not evidence (basis `none`, a kind outside `EVIDENCE_KINDS`) or is silent on
 * the skill.
 */
export function eventSkillOutcome(
  event: { kind: string; basis: string; skillTag: string | null; payload: unknown },
  skillTag: string,
): { correct: boolean; mode: string | null } | null {
  const brainEvent: BrainEvent = {
    id: '',
    attemptId: null,
    itemId: null,
    occurredAt: new Date(0),
    // Rows carry the stored tokens; an unknown kind is simply not in EVIDENCE_KINDS.
    kind: event.kind as LearningEventKind,
    basis: event.basis as EventBasis,
    skillTag: event.skillTag,
    payload: event.payload !== null && typeof event.payload === 'object' && !Array.isArray(event.payload) ? (event.payload as EventPayload) : {},
  }
  const outcome = outcomesOf(brainEvent).find((candidate) => candidate.skillTag === skillTag)
  return outcome ? { correct: outcome.correct, mode: outcome.mode } : null
}
