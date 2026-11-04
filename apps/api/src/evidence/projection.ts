import { asc, eq } from 'drizzle-orm'
import {
  countedOutcomes,
  reduceWithKnownSkills,
  skillLabel,
  type BrainEvent,
  type BrainResponse,
  type BrainSkill,
  type SkillAudience,
  type SkillEvidence,
  type TimelineEvent,
} from '@guardian-book/shared'
import type { DbOrTx } from '../db/client.js'
import { guidelineSteps, items, learningEvents } from '../db/schema.js'

/**
 * The projection (P0-07; brief B05 §2): the Brain is computed from `learning_events` on
 * every read. The hackathon data is small, the reducer is pure and fast, and a value
 * derived at read time can never drift from its evidence. `skill_evidence` and
 * `topic_state` stay as the rebuildable caches spec 03 describes; nothing here writes them.
 */

export interface BrainProjection {
  /** Every event for the learner, oldest first. */
  events: BrainEvent[]
  /** Per-skill evidence plus `new` entries for the content pack's tags without evidence. */
  skills: SkillEvidence[]
  /** IDs of events whose outcomes were counted. */
  countedEventIds: Set<string>
}

/** The learner's events as the reducer reads them, oldest first. */
export async function loadBrainEvents(db: DbOrTx, learnerId: string): Promise<BrainEvent[]> {
  const rows = await db
    .select({
      id: learningEvents.id,
      kind: learningEvents.kind,
      attemptId: learningEvents.attemptId,
      itemId: learningEvents.itemId,
      skillTag: learningEvents.skillTag,
      basis: learningEvents.basis,
      payload: learningEvents.payload,
      occurredAt: learningEvents.occurredAt,
    })
    .from(learningEvents)
    .where(eq(learningEvents.learnerId, learnerId))
    .orderBy(asc(learningEvents.occurredAt), asc(learningEvents.id))
  return rows.map((row) => ({ ...row, payload: asPayload(row.payload) }))
}

function asPayload(value: unknown): BrainEvent['payload'] {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? (value as BrainEvent['payload']) : {}
}

/** The skill tags the approved content pack teaches: `items.skill_tags` and every guideline step's tag. */
export async function approvedSkillTags(db: DbOrTx): Promise<string[]> {
  const tags = new Set<string>()
  const approved = await db.select({ id: items.id, skillTags: items.skillTags }).from(items).where(eq(items.status, 'approved'))
  for (const item of approved) for (const tag of item.skillTags) tags.add(tag)
  if (approved.length > 0) {
    const steps = await db
      .select({ itemId: guidelineSteps.itemId, skillTag: guidelineSteps.skillTag })
      .from(guidelineSteps)
      .innerJoin(items, eq(items.id, guidelineSteps.itemId))
      .where(eq(items.status, 'approved'))
    for (const step of steps) tags.add(step.skillTag)
  }
  return [...tags].sort()
}

export async function projectBrain(db: DbOrTx, learnerId: string, options: { knownSkillTags?: readonly string[] } = {}): Promise<BrainProjection> {
  const events = await loadBrainEvents(db, learnerId)
  const known = options.knownSkillTags ?? (await approvedSkillTags(db))
  const skills = reduceWithKnownSkills(events, known)
  const countedEventIds = new Set(countedOutcomes(events).map((outcome) => outcome.eventId))
  return { events, skills, countedEventIds }
}

export function brainSkillView(skill: SkillEvidence, audience: SkillAudience): BrainSkill {
  return {
    tag: skill.skillTag,
    label: skillLabel(skill.skillTag, audience),
    state: skill.state,
    assisted: { correct: skill.assistedCorrect, total: skill.assistedTotal },
    independent: { correct: skill.independentCorrect, total: skill.independentTotal },
    retained: { correct: skill.retainedCorrect, total: skill.retainedTotal },
    sure: { correct: skill.confidenceSureCorrect, total: skill.confidenceSureTotal },
    evidenceCount: skill.evidenceCount,
    lastCheckedAt: skill.lastCheckedAt ? skill.lastCheckedAt.toISOString() : null,
    evidenceEventIds: skill.evidenceEventIds,
  }
}

export function timelineView(projection: BrainProjection, audience: SkillAudience): TimelineEvent[] {
  return [...projection.events].reverse().map((event) => ({
    id: event.id,
    kind: event.kind,
    basis: event.basis,
    skillTag: event.skillTag,
    skillLabel: event.skillTag ? skillLabel(event.skillTag, audience) : null,
    attemptId: event.attemptId,
    itemId: event.itemId,
    occurredAt: (event.occurredAt instanceof Date ? event.occurredAt : new Date(event.occurredAt)).toISOString(),
    counted: projection.countedEventIds.has(event.id),
  }))
}

/** The Brain as one role reads it: chips with three marks and the growth timeline, newest first. The route adds "what comes up" (B17). */
export function brainView(projection: BrainProjection, learner: { id: string; nickname: string }, audience: SkillAudience): BrainResponse {
  return {
    learner,
    skills: projection.skills.map((skill) => brainSkillView(skill, audience)),
    timeline: timelineView(projection, audience),
    whatComesUp: {},
  }
}
