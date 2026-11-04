import type { ModelPurpose } from '@guardian-book/shared'

/**
 * The verifier (spec 03 §8.4, P0-11): pure rule functions the model cannot skip. Every
 * rule returns `{code, passed, detail}`; `runChecks` applies the set for a purpose. Codes
 * are stable strings, stored on `model_runs.checks` and shown pass/fail to the teacher.
 */

export const CHECK_CODES = [
  'SCHEMA_INVALID',
  'STEP_UNKNOWN',
  'STEP_MISSING',
  'STEP_DUPLICATE',
  'MARKS_OVER_MAX',
  'TOTAL_MISMATCH',
  'EVIDENCE_MISSING',
  'CA_INCONSISTENT',
  'HINT_LEAKS_ANSWER',
  'CONFIDENCE_LOW',
  'DATE_OUT_OF_RANGE',
  'SOURCE_LINE_MISSING',
  'EVIDENCE_REF_UNKNOWN',
  'RESOURCE_UNVETTED',
  'PLAIN_LANGUAGE_FAIL',
  'INFERENCE_FORBIDDEN',
  'TOOL_UNKNOWN',
  'STEPS_EXCEEDED',
  'PLAN_MISSING',
  // B12: translations
  'PLACEHOLDER_MISSING',
  'LENGTH_OUT_OF_RANGE',
  'NUMBER_ADDED',
  'URL_ADDED',
  'NOT_TRANSLATED',
] as const
export type CheckCode = (typeof CHECK_CODES)[number]

export interface CheckResult {
  code: CheckCode
  passed: boolean
  /** Plain words, specific enough for a re-ask and for the teacher's detail view. Never personal data. */
  detail: string
}

export type CheckOutcome = Omit<CheckResult, 'code'>

export interface CheckRule<O, C> {
  code: CheckCode
  /**
   * `true`: a failure is a model mistake worth re-asking about.
   * `false`: a failure means "abstain": the result goes to the teacher as uncertain without
   * another call (re-asking a model to be more confident invites a confidently wrong mark).
   */
  retryable: boolean
  run: (output: O, context: C) => CheckOutcome
}

export const pass = (detail = 'ok'): CheckOutcome => ({ passed: true, detail })
export const fail = (detail: string): CheckOutcome => ({ passed: false, detail })

// ── Contexts: what the server knows that the model output must agree with ───────────────

export type GuidelineStepKind = 'M' | 'A' | 'CA'

export interface GuidelineStepContext {
  step_id: string
  kind: GuidelineStepKind
  marks: number
  /** The memo working or value for this step, if the guideline has one. Never shown to learners. */
  expected: string | null
}

export interface AssessContext {
  guideline: GuidelineStepContext[]
  maxMarks: number
  answerKind: 'typed' | 'photo'
  /** The typed answer as submitted; null for photos (the model's transcription is the only text). */
  answerText: string | null
  /** The item's final answer as the guideline states it, for HINT_LEAKS_ANSWER. */
  finalAnswer: string | null
  /** Further memo values the hint must not reveal (intermediate results, alternative forms). */
  memoValues: string[]
}

export interface NoticeContext {
  /** YYYY-MM-DD. */
  today: string
  /** The notice text the events were read from, when the server has it (typed or OCR'd). */
  sourceText: string | null
}

export interface AgentTraceStep {
  tool: string
}

export interface PlanContext {
  knownEvidenceIds: string[]
  vettedResourceIds: string[]
  allowedTools: string[]
  maxSteps: number
  /** The agent steps taken so far (the turn being checked is not in it). */
  trace: AgentTraceStep[]
  /** Memo values of the gap item (accuracy criteria): the learner view must not state them (B06). */
  memoValues?: string[]
}

export interface NoteContext {
  knownEvidenceIds: string[]
}

export type ProfileCardsContext = Record<string, never>
export type ClassifyContext = Record<string, never>

/** B12: what the server knows about a translation request (the source after placeholders). */
export interface TranslateContext {
  /** The source text as sent: every name, number, date and link already a placeholder. */
  sourceText: string
  /** The placeholders in the source (`{{L}}`, `{{T}}`, `{{N1}}`…); each must come back exactly once. */
  placeholders: string[]
  /** The target language code (never `en`). */
  language: string
}

/** Ask about a step (B13): the values a hint must not state, from the whole item's guideline. */
export interface HintContext {
  guideline: GuidelineStepContext[]
  finalAnswer: string | null
  /** Memo values (accuracy criteria) of every step on the item, not only the one asked about. */
  memoValues: string[]
}
/** Speech to text has no rule set: nothing is proposed, the words go back to the person who said them. */
export type TranscribeContext = Record<string, never>

export interface CheckContexts {
  classify: ClassifyContext
  profile_cards: ProfileCardsContext
  assess: AssessContext
  notice: NoticeContext
  plan: PlanContext
  note: NoteContext
  translate: TranslateContext
  transcribe: TranscribeContext
  step_hint: HintContext
}

export type CheckContextFor<P extends ModelPurpose> = CheckContexts[P]
