import { outcomesOf, type BrainEvent, type EvidenceMode, type SkillOutcome } from './evidence.js'

/**
 * The reducer (P0-07; spec 03 §3, §9.1; brief B05 §1). Pure, no I/O: a list of learning
 * events in, per-skill evidence out. Replaying the same events always rebuilds the same
 * state, and the input order does not matter: events are sorted by (occurred_at, id) first.
 *
 * Rules:
 * - Only events with `basis ≠ none` move state (`outcomesOf` enforces it).
 * - Events are grouped by attempt. Within an attempt a teacher-confirmed event overrides
 *   every model-based one; within one basis the latest statement about a skill wins.
 * - Counts are kept apart as assisted, independent and retained, each with correct / total,
 *   plus the learner's own "I'm sure" calls against the outcome (confidence calibration).
 * - The label: `new` (no evidence), `secure` (at least one correct independent check and at
 *   least one correct retained check, on different days), else `practising`. Assisted success
 *   alone never yields `secure`.
 */

export const SKILL_STATES = ['new', 'practising', 'secure'] as const
export type SkillState = (typeof SKILL_STATES)[number]

/** Days are counted where the learner is (spec 06 §2 `lib/dates`), not in UTC. */
export const DEFAULT_TIME_ZONE = 'Africa/Johannesburg'

export interface SkillEvidence {
  skillTag: string
  assistedCorrect: number
  assistedTotal: number
  independentCorrect: number
  independentTotal: number
  retainedCorrect: number
  retainedTotal: number
  confidenceSureCorrect: number
  confidenceSureTotal: number
  evidenceCount: number
  lastCheckedAt: Date | null
  state: SkillState
  /** The events whose outcomes were counted, oldest first. Each state links to its evidence. */
  evidenceEventIds: string[]
}

export interface ReduceOptions {
  timeZone?: string
}

const dayFormatters = new Map<string, Intl.DateTimeFormat>()

/** `YYYY-MM-DD` of an instant in a time zone. Deterministic for a given zone. */
export function dayOf(date: Date, timeZone: string = DEFAULT_TIME_ZONE): string {
  let formatter = dayFormatters.get(timeZone)
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' })
    dayFormatters.set(timeZone, formatter)
  }
  return formatter.format(date)
}

export function toDate(value: Date | string): Date {
  return value instanceof Date ? value : new Date(value)
}

/** Stable order: time, then id. Two events never tie unless they are the same event. */
export function sortEvents<T extends Pick<BrainEvent, 'id' | 'occurredAt'>>(events: readonly T[]): T[] {
  return [...events].sort((a, b) => {
    const delta = toDate(a.occurredAt).getTime() - toDate(b.occurredAt).getTime()
    if (delta !== 0) return delta
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
  })
}

interface CountedOutcome extends SkillOutcome {
  eventId: string
  occurredAt: Date
}

const BASIS_RANK = { teacher_confirmed: 2, model_high: 1, none: 0 } as const

/**
 * The outcomes that count, one per (attempt, skill): the highest-ranked basis present in
 * the attempt decides which events are heard; among those the latest wins per skill.
 */
export function countedOutcomes(events: readonly BrainEvent[]): CountedOutcome[] {
  const groups = new Map<string, { rank: number; perSkill: Map<string, CountedOutcome> }>()
  for (const event of sortEvents(events)) {
    const outcomes = outcomesOf(event)
    if (outcomes.length === 0) continue
    const key = event.attemptId ?? `event:${event.id}`
    const rank = BASIS_RANK[event.basis]
    let group = groups.get(key)
    if (!group || rank > group.rank) {
      group = { rank, perSkill: new Map() }
      groups.set(key, group)
    } else if (rank < group.rank) {
      continue // a model-based event never overrides the teacher
    }
    const occurredAt = toDate(event.occurredAt)
    for (const outcome of outcomes) {
      group.perSkill.set(outcome.skillTag, { ...outcome, eventId: event.id, occurredAt })
    }
  }
  const counted: CountedOutcome[] = []
  for (const group of groups.values()) counted.push(...group.perSkill.values())
  return counted.sort((a, b) => {
    const delta = a.occurredAt.getTime() - b.occurredAt.getTime()
    if (delta !== 0) return delta
    if (a.eventId !== b.eventId) return a.eventId < b.eventId ? -1 : 1
    return a.skillTag < b.skillTag ? -1 : a.skillTag > b.skillTag ? 1 : 0
  })
}

interface Accumulator {
  evidence: SkillEvidence
  independentCorrectDays: Set<string>
  retainedCorrectDays: Set<string>
}

function emptyEvidence(skillTag: string): SkillEvidence {
  return {
    skillTag,
    assistedCorrect: 0,
    assistedTotal: 0,
    independentCorrect: 0,
    independentTotal: 0,
    retainedCorrect: 0,
    retainedTotal: 0,
    confidenceSureCorrect: 0,
    confidenceSureTotal: 0,
    evidenceCount: 0,
    lastCheckedAt: null,
    state: 'new',
    evidenceEventIds: [],
  }
}

const COUNTERS: Record<EvidenceMode, { correct: keyof SkillEvidence; total: keyof SkillEvidence }> = {
  assisted: { correct: 'assistedCorrect', total: 'assistedTotal' },
  independent: { correct: 'independentCorrect', total: 'independentTotal' },
  retention: { correct: 'retainedCorrect', total: 'retainedTotal' },
}

function bump(evidence: SkillEvidence, key: keyof SkillEvidence): void {
  const current = evidence[key]
  if (typeof current === 'number') (evidence as unknown as Record<string, number>)[key] = current + 1
}

/**
 * The derived label. Secure needs a correct independent check and a correct retained check
 * on two different days; nothing assisted contributes to it.
 */
export function labelFor(independentCorrectDays: ReadonlySet<string>, retainedCorrectDays: ReadonlySet<string>, evidenceCount: number): SkillState {
  if (evidenceCount === 0) return 'new'
  for (const day of independentCorrectDays) {
    for (const other of retainedCorrectDays) {
      if (day !== other) return 'secure'
    }
  }
  return 'practising'
}

/** Events in, per-skill evidence out, sorted by skill tag. Skills with no evidence do not appear. */
export function reduceEvents(events: readonly BrainEvent[], options: ReduceOptions = {}): SkillEvidence[] {
  const timeZone = options.timeZone ?? DEFAULT_TIME_ZONE
  const accumulators = new Map<string, Accumulator>()

  for (const outcome of countedOutcomes(events)) {
    let acc = accumulators.get(outcome.skillTag)
    if (!acc) {
      acc = { evidence: emptyEvidence(outcome.skillTag), independentCorrectDays: new Set(), retainedCorrectDays: new Set() }
      accumulators.set(outcome.skillTag, acc)
    }
    const { evidence } = acc
    const counters = COUNTERS[outcome.mode]
    bump(evidence, counters.total)
    if (outcome.correct) bump(evidence, counters.correct)
    if (outcome.sure !== null) {
      bump(evidence, 'confidenceSureTotal')
      if (outcome.sure && outcome.correct) bump(evidence, 'confidenceSureCorrect')
    }
    evidence.evidenceCount += 1
    if (!evidence.lastCheckedAt || outcome.occurredAt > evidence.lastCheckedAt) evidence.lastCheckedAt = outcome.occurredAt
    if (!evidence.evidenceEventIds.includes(outcome.eventId)) evidence.evidenceEventIds.push(outcome.eventId)
    if (outcome.correct && outcome.mode === 'independent') acc.independentCorrectDays.add(dayOf(outcome.occurredAt, timeZone))
    if (outcome.correct && outcome.mode === 'retention') acc.retainedCorrectDays.add(dayOf(outcome.occurredAt, timeZone))
  }

  return [...accumulators.values()]
    .map((acc) => ({
      ...acc.evidence,
      state: labelFor(acc.independentCorrectDays, acc.retainedCorrectDays, acc.evidence.evidenceCount),
    }))
    .sort((a, b) => (a.skillTag < b.skillTag ? -1 : a.skillTag > b.skillTag ? 1 : 0))
}

/** The same reduction, keyed by tag, with `new` entries for tags known from elsewhere (the content pack). */
export function reduceWithKnownSkills(
  events: readonly BrainEvent[],
  knownSkillTags: readonly string[],
  options: ReduceOptions = {},
): SkillEvidence[] {
  const reduced = reduceEvents(events, options)
  const seen = new Set(reduced.map((skill) => skill.skillTag))
  for (const tag of knownSkillTags) {
    if (!seen.has(tag)) {
      reduced.push(emptyEvidence(tag))
      seen.add(tag)
    }
  }
  return reduced.sort((a, b) => (a.skillTag < b.skillTag ? -1 : a.skillTag > b.skillTag ? 1 : 0))
}
