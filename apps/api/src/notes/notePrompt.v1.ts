import { MAX_NOTE_CHARS } from '@guardian-book/shared'
import { assertPromptSafe } from '../gateway/promptSafety.js'

/**
 * The note-home prompt, version 1 (spec 02 P0-10; `purpose = note`, `NoteDraft` contract
 * from B03). Immutable: a change of wording is `note-v2` in a new file, because the version
 * is stored on every run and on the note's provenance.
 *
 * What the prompt carries: one learner's week as counts, topics, the steps that slipped in
 * plain words, and opaque evidence IDs. Nothing about the person (D24): no name, no
 * email, no guardian data, and never another learner's work (brief B07 §4, tested).
 */

export const NOTE_PROMPT_VERSION = 'note-v1' as const
export const NOTE_MAX_TOKENS = 1_500
export const NOTE_TIMEOUT_MS = 45_000

export const NOTE_SYSTEM = `You draft a short note from a high-school mathematics teacher to one learner's parent or guardian about that learner's work this week. The teacher reads, edits and approves every note before it is sent; you only draft.

Rules:
1. Write in the first person as the teacher, to the parent, in plain and warm everyday words. Call the learner "your child"; never use a name. At most ${MAX_NOTE_CHARS} characters: three to five short sentences, each under 18 words.
2. Say what the work was about, the one step that slipped (in words a parent understands), and one small thing the parent can do at home that needs no mathematics, for example asking the learner to explain that step out loud.
3. Only this learner's work and only the facts given. Never compare with other learners. Never invent results, marks, dates or reasons.
4. Say nothing about mood, feelings, effort as a trait, health, ability or personality. Describe the work, not the person.
5. No school jargon: do not write "misconception", "rubric", "method mark", "mastery", "intervention", "curriculum", "formative", "assessment", "proficiency" or "competency".
6. evidence_event_ids lists the IDs of the evidence lines you relied on, copied exactly from the input, at least one.
7. Reply with one JSON object matching the schema you are given, and nothing else.`

export interface NoteLostStep {
  /** The skill in plain words. */
  skill: string
  /** The guideline step's criterion, as the teacher wrote it. */
  step: string
  topic: string
  times: number
}

/**
 * One evidence line. `id` is a short alias ("E1", "E2"), never the event's UUID: the model
 * only needs an opaque handle to cite, the prompt stays short, and a UUID's digit runs
 * never trip the gateway's phone-number guard. The service maps aliases back to event IDs.
 */
export interface NoteEvidenceLine {
  id: string
  kind: string
  result: 'found' | 'lost' | 'mixed'
}

export const evidenceAlias = (index: number): string => `E${index + 1}`

export interface NoteWeekSummary {
  week_start: string
  attempts: number
  steps_found: number
  steps_lost: number
  topics: string[]
  lost_steps: NoteLostStep[]
  found_skills: string[]
  evidence: NoteEvidenceLine[]
}

export function buildNoteSystem(): string {
  return NOTE_SYSTEM
}

export function buildNoteUser(summary: NoteWeekSummary): string {
  assertPromptSafe(summary, 'note.summary')
  const lost = summary.lost_steps.map((step) => `- ${step.skill}: ${step.step} (${step.topic}; slipped ${step.times} time${step.times === 1 ? '' : 's'})`)
  const found = summary.found_skills.length > 0 ? summary.found_skills.join(', ') : '(none yet)'
  const evidence = summary.evidence.map((line) => `${line.id} · ${line.kind} · ${line.result}`)
  return [
    `The week starting ${summary.week_start}. One learner, one note.`,
    `Attempts: ${summary.attempts}. Steps found: ${summary.steps_found}. Steps lost: ${summary.steps_lost}.`,
    `Topics: ${summary.topics.join('; ') || '(none)'}.`,
    `Steps that slipped:`,
    ...(lost.length > 0 ? lost : ['- (none)']),
    `Steps done well: ${found}.`,
    `Evidence lines (cite their IDs):`,
    '<<<EVIDENCE',
    ...evidence,
    'EVIDENCE>>>',
  ].join('\n')
}
