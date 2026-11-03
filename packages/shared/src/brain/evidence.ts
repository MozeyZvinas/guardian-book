import type { EventBasis, EventPayload, LearningEventKind } from '../contracts/events.js'

/**
 * What the reducer reads out of a learning event (spec 03 §3, §9.1; P0-07).
 *
 * An event moves skill state only when its `basis` is not `none`, its kind is one of
 * `EVIDENCE_KINDS`, and its payload says which skills were earned or lost. Writers (B04's
 * assess path, B06's fix-it and check-alone flows, B07's reviews) build the payload with
 * `evidencePayload(...)` so the shape stays one thing:
 *
 * - one skill per event: `skill_tag` set on the event and `correct: true | false` in the
 *   payload; or
 * - one event per attempt: `skill_tag` null and `skills_correct` / `skills_lost` arrays of
 *   tags in the payload (both may be present; a tag in both counts as lost).
 *
 * `mode` (assisted / independent / retention) defaults by kind and may be set explicitly.
 * `sure` records what the learner said about their own answer before seeing the result
 * ("I'm sure" → true), for the confidence-calibration counts; absent means not asked.
 *
 * The payload contract (`eventPayloadSchema`) allows tokens, numbers, booleans and arrays
 * of those only, so nothing here is free text.
 */

export const EVIDENCE_MODES = ['assisted', 'independent', 'retention'] as const
export type EvidenceMode = (typeof EVIDENCE_MODES)[number]

/** Event kinds that can carry a per-skill outcome. Every other kind is context, not evidence. */
export const EVIDENCE_KINDS: ReadonlySet<LearningEventKind> = new Set<LearningEventKind>([
  'assessed',
  'retried',
  'review_confirmed',
  'review_released',
  'fixed_independently',
  'independent_check_completed',
  'retention_check_completed',
])

const DEFAULT_MODE: Partial<Record<LearningEventKind, EvidenceMode>> = {
  independent_check_completed: 'independent',
  retention_check_completed: 'retention',
}

/** The event shape the reducer takes: a `learning_events` row, or the input that made one. */
export interface BrainEvent {
  id: string
  kind: LearningEventKind
  attemptId: string | null
  itemId: string | null
  skillTag: string | null
  basis: EventBasis
  payload: EventPayload
  occurredAt: Date | string
}

export interface SkillOutcome {
  skillTag: string
  correct: boolean
  mode: EvidenceMode
  /** The learner's own call before the result; null when not asked. */
  sure: boolean | null
}

export interface EvidencePayloadFields {
  correct?: boolean
  skills_correct?: readonly string[]
  skills_lost?: readonly string[]
  mode?: EvidenceMode
  sure?: boolean
}

function isMode(value: unknown): value is EvidenceMode {
  return typeof value === 'string' && (EVIDENCE_MODES as readonly string[]).includes(value)
}

function tagList(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.filter((item): item is string => typeof item === 'string' && item.length > 0)
}

/** Builds a reducer-readable payload. Pure; validation against the event contract happens in `appendEvent`. */
export function evidencePayload(fields: EvidencePayloadFields, extra: EventPayload = {}): EventPayload {
  const payload: EventPayload = { ...extra }
  if (fields.correct !== undefined) payload['correct'] = fields.correct
  if (fields.skills_correct !== undefined) payload['skills_correct'] = [...fields.skills_correct]
  if (fields.skills_lost !== undefined) payload['skills_lost'] = [...fields.skills_lost]
  if (fields.mode !== undefined) payload['mode'] = fields.mode
  if (fields.sure !== undefined) payload['sure'] = fields.sure
  return payload
}

/** The mode an event's outcomes count under: explicit `mode`, else by kind, else assisted. */
export function modeOf(event: Pick<BrainEvent, 'kind' | 'payload'>): EvidenceMode {
  const explicit = event.payload['mode']
  if (isMode(explicit)) return explicit
  return DEFAULT_MODE[event.kind] ?? 'assisted'
}

/**
 * The per-skill outcomes one event states. Empty when the event is not evidence: basis
 * `none`, a kind outside `EVIDENCE_KINDS`, or no skill information in the payload.
 */
export function outcomesOf(event: BrainEvent): SkillOutcome[] {
  if (event.basis === 'none' || !EVIDENCE_KINDS.has(event.kind)) return []
  const mode = modeOf(event)
  const sureValue = event.payload['sure']
  const sure = typeof sureValue === 'boolean' ? sureValue : null

  if (event.skillTag) {
    const correct = event.payload['correct']
    if (typeof correct !== 'boolean') return []
    return [{ skillTag: event.skillTag, correct, mode, sure }]
  }

  const lost = new Set(tagList(event.payload['skills_lost']))
  const earned = tagList(event.payload['skills_correct']).filter((tag) => !lost.has(tag))
  const outcomes: SkillOutcome[] = []
  for (const tag of [...new Set(earned)]) outcomes.push({ skillTag: tag, correct: true, mode, sure })
  for (const tag of lost) outcomes.push({ skillTag: tag, correct: false, mode, sure })
  return outcomes
}
