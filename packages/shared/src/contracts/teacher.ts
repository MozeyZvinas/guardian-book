import { z } from 'zod'
import { brainSkillSchema } from '../brain/contracts.js'
import { guidelineStepSchema, guidelineStepTypeSchema } from './items.js'
import { languageSchema, translationViewSchema } from './language.js'
import { confidenceSchema, isoDateSchema } from './model/common.js'
import { attemptModeSchema, attemptStatusSchema } from './practice.js'
import { provenanceSchema } from './provenance.js'

/**
 * The teacher space (spec 02 P0-10; spec 03 §2 `reviews`, §5, §8.1 `notes`, §8.3, §9.1,
 * §9.3; spec 05 §4.4 T2–T7, §9; brief B07). What the API accepts and serves, camelCase.
 *
 * The teacher is the marker of record: the model's proposal is read from `assessments`
 * (written once) and the teacher's decisions are separate `reviews` rows with an optimistic
 * lock. Her words on a result are `review_feedback` rows with an origin and an audience;
 * notes home carry the same origin labels, and a guardian ever sees only `sent` ones.
 */

// ── labels and enums ───────────────────────────────────────────────────────────────────────

export const NOTE_ORIGINS = ['ai_suggested', 'teacher_approved', 'teacher_added', 'teacher_revised'] as const
export const noteOriginSchema = z.enum(NOTE_ORIGINS)
export type NoteOrigin = z.infer<typeof noteOriginSchema>

export const NOTE_AUDIENCES = ['learner', 'guardian', 'teacher_only'] as const
export const noteAudienceSchema = z.enum(NOTE_AUDIENCES)
export type NoteAudience = z.infer<typeof noteAudienceSchema>

export const FEEDBACK_KINDS = ['agree', 'correct', 'add'] as const
export const feedbackKindSchema = z.enum(FEEDBACK_KINDS)
export type FeedbackKind = z.infer<typeof feedbackKindSchema>

export const REVIEW_STATES = ['confirmed', 'released'] as const
export const reviewStateSchema = z.enum(REVIEW_STATES)
export type ReviewState = z.infer<typeof reviewStateSchema>

export const INTERVENTION_STATUSES = ['open', 'checking', 'closed'] as const
export const interventionStatusSchema = z.enum(INTERVENTION_STATUSES)
export const INTERVENTION_OUTCOMES = ['improved', 'no_change', 'needs_more'] as const
export const interventionOutcomeSchema = z.enum(INTERVENTION_OUTCOMES)
export type InterventionOutcome = z.infer<typeof interventionOutcomeSchema>

export const NOTE_STATUSES = ['draft', 'approved', 'sent'] as const
export const noteStatusSchema = z.enum(NOTE_STATUSES)
export type NoteStatus = z.infer<typeof noteStatusSchema>

export const MAX_FEEDBACK_CHARS = 600
export const MAX_NOTE_TEXT_CHARS = 600
export const MAX_INTERVENTION_ACTION_CHARS = 300
export const MAX_REVIEW_COMMENT_CHARS = 600

/** The origin label the TEACHER sees (spec 05 §9 T3a): internal wording, never shown to a learner or guardian. */
export const TEACHER_ORIGIN_LABEL: Record<NoteOrigin, string> = {
  ai_suggested: 'AI suggested',
  teacher_approved: 'You approved',
  teacher_added: 'You added',
  teacher_revised: 'You revised',
}

/** The label the teacher sees on a guideline the content loader marked as drafted by a model (brief B07 §1). */
export const AI_DRAFTED_GUIDELINE_LABEL = 'AI-drafted: check before approving'

export const TEACHER_REVIEWED_LABEL = 'Teacher-reviewed'

/**
 * The label a LEARNER or GUARDIAN sees (spec 03 §9.1): "Teacher-reviewed" for an approved
 * or revised draft, the teacher's name only for her own words. An `ai_suggested` text is
 * never shown as teacher-written; it never reaches them, so the label says so.
 */
export function publicOriginLabel(origin: NoteOrigin, teacherNickname: string): string {
  switch (origin) {
    case 'teacher_approved':
    case 'teacher_revised':
      return TEACHER_REVIEWED_LABEL
    case 'teacher_added':
      return `From ${teacherNickname}`
    default:
      return 'Not yet reviewed'
  }
}

/** The origin a teacher's decision gives a note (brief B07 §4): unedited → approved; edited → revised; her own → stays hers. */
export function originAfterApproval(origin: NoteOrigin, draftText: string, finalText: string): NoteOrigin {
  if (origin === 'teacher_added') return 'teacher_added'
  return finalText.trim() === draftText.trim() ? 'teacher_approved' : 'teacher_revised'
}

/** The origin a feedback control gives its row (spec 05 §9 T3a). */
export function originForFeedback(kind: FeedbackKind): NoteOrigin {
  switch (kind) {
    case 'agree':
      return 'teacher_approved'
    case 'correct':
      return 'teacher_revised'
    case 'add':
      return 'teacher_added'
  }
}

const uuid = z.string().uuid()
const classRef = z.object({ id: uuid, name: z.string() })
const personRef = z.object({ id: uuid, nickname: z.string() })

// ── T7 guidelines ──────────────────────────────────────────────────────────────────────────

export const guidelineApprovalViewSchema = z.object({
  itemRevision: z.number().int(),
  approvedAt: z.string(),
  approvedBy: personRef,
})

export const guidelineItemViewSchema = z.object({
  id: uuid,
  slug: z.string(),
  topic: z.string(),
  skillTags: z.array(z.string()),
  maxMarks: z.number().int(),
  revision: z.number().int(),
  promptMd: z.string(),
  provenance: provenanceSchema,
  reviewer: z.string(),
  /** True for `model_generated` items: the screen shows AI_DRAFTED_GUIDELINE_LABEL. */
  aiDrafted: z.boolean(),
  steps: z.array(guidelineStepSchema),
  /** The approval of the CURRENT revision for this class, or null (an older revision's approval does not count). */
  approval: guidelineApprovalViewSchema.nullable(),
})
export type GuidelineItemView = z.infer<typeof guidelineItemViewSchema>

export const guidelinesResponseSchema = z.object({ class: classRef, items: z.array(guidelineItemViewSchema) })
export type GuidelinesResponse = z.infer<typeof guidelinesResponseSchema>

export const approveGuidelineBodySchema = z.object({ itemRevision: z.number().int().min(1) }).strict()
export type ApproveGuidelineBody = z.infer<typeof approveGuidelineBodySchema>

export const approveGuidelineResponseSchema = z.object({
  approval: z.object({ classId: uuid, itemId: uuid, itemRevision: z.number().int(), approvedAt: z.string() }),
  /** True when this revision was already approved for the class (idempotent). */
  replayed: z.boolean(),
})
export type ApproveGuidelineResponse = z.infer<typeof approveGuidelineResponseSchema>

// ── T3 queue ───────────────────────────────────────────────────────────────────────────────

export const reviewStepSchema = z.object({
  stepId: uuid,
  stepNo: z.number().int(),
  skillTag: z.string(),
  awarded: z.number().int(),
  available: z.number().int(),
})
export type ReviewStep = z.infer<typeof reviewStepSchema>

export const reviewViewSchema = z.object({
  id: uuid,
  state: reviewStateSchema,
  version: z.number().int(),
  steps: z.array(reviewStepSchema),
  total: z.number().int(),
  comment: z.string().nullable(),
  confirmedAt: z.string(),
  releasedAt: z.string().nullable(),
})
export type ReviewView = z.infer<typeof reviewViewSchema>

export const queueRowSchema = z.object({
  attemptId: uuid,
  learner: personRef,
  itemId: uuid,
  itemSlug: z.string(),
  itemTopic: z.string(),
  kind: z.enum(['typed', 'photo']),
  mode: attemptModeSchema,
  status: attemptStatusSchema,
  /** The model's proposed total; null unless `proposed`. */
  proposedTotal: z.number().int().nullable(),
  maxMarks: z.number().int(),
  review: z.object({ id: uuid, state: reviewStateSchema, total: z.number().int() }).nullable(),
  createdAt: z.string(),
})
export type QueueRow = z.infer<typeof queueRowSchema>

export const queueResponseSchema = z.object({ class: classRef, rows: z.array(queueRowSchema) })
export type QueueResponse = z.infer<typeof queueResponseSchema>

// ── T3a review ─────────────────────────────────────────────────────────────────────────────

/** One guideline step with the model's proposal beside it (null when the model gave none). */
export const proposalStepSchema = z.object({
  stepId: uuid,
  stepNo: z.number().int(),
  stepType: guidelineStepTypeSchema,
  criterion: z.string(),
  notes: z.string().nullable(),
  skillTag: z.string(),
  marks: z.number().int(),
  proposed: z
    .object({
      awarded: z.number().int(),
      confidence: confidenceSchema,
      evidence: z.string(),
      feedback: z.string(),
      misconceptionTag: z.string().nullable(),
      hint: z.string().nullable(),
      box: z.array(z.number().int()).length(4).nullable(),
    })
    .nullable(),
})
export type ProposalStep = z.infer<typeof proposalStepSchema>

export const checkResultViewSchema = z.object({ code: z.string(), passed: z.boolean(), detail: z.string() })
export type CheckResultView = z.infer<typeof checkResultViewSchema>

export const modelRunViewSchema = z.object({
  id: uuid,
  attemptNo: z.number().int(),
  status: z.enum(['accepted', 'retried', 'exhausted', 'failed']),
  checks: z.array(checkResultViewSchema),
  modelId: z.string(),
  promptVersion: z.string(),
  latencyMs: z.number().int(),
  costUsd: z.number(),
  createdAt: z.string(),
})
export type ModelRunView = z.infer<typeof modelRunViewSchema>

export const feedbackViewSchema = z.object({
  id: uuid,
  kind: feedbackKindSchema,
  text: z.string().nullable(),
  audience: noteAudienceSchema,
  origin: noteOriginSchema,
  /** The teacher's internal label (TEACHER_ORIGIN_LABEL). */
  originLabel: z.string(),
  createdAt: z.string(),
})
export type FeedbackView = z.infer<typeof feedbackViewSchema>

export const reviewAttemptResponseSchema = z.object({
  attempt: z.object({
    id: uuid,
    learner: personRef,
    classId: uuid.nullable(),
    itemId: uuid,
    itemSlug: z.string(),
    itemTopic: z.string(),
    itemPromptMd: z.string(),
    itemRevision: z.number().int(),
    maxMarks: z.number().int(),
    kind: z.enum(['typed', 'photo']),
    mode: attemptModeSchema,
    status: attemptStatusSchema,
    answerText: z.string().nullable(),
    hasImage: z.boolean(),
    createdAt: z.string(),
  }),
  steps: z.array(proposalStepSchema),
  assessment: z
    .object({
      id: uuid,
      status: z.enum(['proposed', 'uncertain', 'failed']),
      total: z.number().int().nullable(),
      ambiguityReasons: z.array(z.string()),
      transcriptionConfidence: confidenceSchema.nullable(),
      modelId: z.string(),
      promptVersion: z.string(),
      latencyMs: z.number().int(),
      createdAt: z.string(),
    })
    .nullable(),
  /** Every model call behind the proposal, in order, with the verifier's pass/fail list. */
  runs: z.array(modelRunViewSchema),
  review: reviewViewSchema.nullable(),
  feedback: z.array(feedbackViewSchema),
})
export type ReviewAttemptResponse = z.infer<typeof reviewAttemptResponseSchema>

export const confirmReviewBodySchema = z
  .object({
    steps: z.array(z.object({ stepId: uuid, awarded: z.number().int().min(0).max(50) }).strict()).min(1).max(50),
    comment: z.string().trim().max(MAX_REVIEW_COMMENT_CHARS).nullable().optional(),
    /** Required once a review exists: the version the teacher saw. */
    version: z.number().int().min(0).optional(),
  })
  .strict()
export type ConfirmReviewBody = z.infer<typeof confirmReviewBodySchema>

export const releaseReviewBodySchema = z.object({ version: z.number().int().min(1) }).strict()
export type ReleaseReviewBody = z.infer<typeof releaseReviewBodySchema>

export const reviewResponseSchema = z.object({ review: reviewViewSchema })
export type ReviewResponse = z.infer<typeof reviewResponseSchema>

export const feedbackBodySchema = z
  .object({
    kind: feedbackKindSchema,
    /** Required for `correct` and `add`; for `agree` the AI's explanation being approved (optional). */
    text: z.string().trim().min(1).max(MAX_FEEDBACK_CHARS).optional(),
    audience: noteAudienceSchema,
  })
  .strict()
export type FeedbackBody = z.infer<typeof feedbackBodySchema>

export const feedbackResponseSchema = z.object({ feedback: feedbackViewSchema })
export type FeedbackResponse = z.infer<typeof feedbackResponseSchema>

/** `GET /api/attempts/:id/review`: what a learner (owner, after release) or the class teacher sees of the review. */
export const attemptReviewResponseSchema = z.object({
  review: reviewViewSchema.nullable(),
  feedback: z.array(
    z.object({
      id: uuid,
      kind: feedbackKindSchema,
      text: z.string().nullable(),
      audience: noteAudienceSchema,
      origin: noteOriginSchema,
      /** publicOriginLabel for a learner; TEACHER_ORIGIN_LABEL for the teacher. */
      label: z.string(),
      createdAt: z.string(),
    }),
  ),
})
export type AttemptReviewResponse = z.infer<typeof attemptReviewResponseSchema>

// ── T2 class picture ───────────────────────────────────────────────────────────────────────

export const gapViewSchema = z.object({
  skillTag: z.string(),
  /** Learners whose latest trusted result on this skill lost a mark. */
  learners: z.number().int().nonnegative(),
  of: z.number().int().nonnegative(),
  learnerIds: z.array(uuid),
  /** The step most often lost for this skill: "step 2 of factorising". */
  example: z.object({ itemSlug: z.string(), itemTopic: z.string(), stepNo: z.number().int(), criterion: z.string() }).nullable(),
})
export type GapView = z.infer<typeof gapViewSchema>

export const needsYouViewSchema = z.object({
  learner: personRef,
  /** Unreviewed uncertain results waiting for the teacher. */
  uncertain: z.number().int().nonnegative(),
  /** Skills lost on two or more attempts. */
  repeatedSkills: z.array(z.string()),
})
export type NeedsYouView = z.infer<typeof needsYouViewSchema>

export const pictureResponseSchema = z.object({
  class: classRef.extend({ learnerCount: z.number().int().nonnegative() }),
  members: z.array(personRef),
  gaps: z.array(gapViewSchema),
  needsYou: z.array(needsYouViewSchema),
  counts: z.object({
    /** Attempts with a result and no review yet. */
    queue: z.number().int().nonnegative(),
    draftNotes: z.number().int().nonnegative(),
    openInterventions: z.number().int().nonnegative(),
  }),
})
export type PictureResponse = z.infer<typeof pictureResponseSchema>

// ── interventions ──────────────────────────────────────────────────────────────────────────

export const interventionEvidenceSchema = z.object({
  eventId: uuid,
  kind: z.string(),
  occurredAt: z.string(),
  attemptId: uuid.nullable(),
  /** The outcome on the intervention's skill, when the event states one. */
  correct: z.boolean().nullable(),
  mode: z.string().nullable(),
})
export type InterventionEvidence = z.infer<typeof interventionEvidenceSchema>

export const interventionViewSchema = z.object({
  id: uuid,
  learner: personRef,
  classId: uuid,
  skillTag: z.string(),
  owner: personRef,
  action: z.string(),
  /** YYYY-MM-DD. */
  followUpOn: z.string(),
  status: interventionStatusSchema,
  outcome: interventionOutcomeSchema.nullable(),
  outcomeEvidenceEventIds: z.array(uuid),
  /** Evidence on this skill recorded since the intervention was assigned (the follow-up check). */
  evidence: z.array(interventionEvidenceSchema),
  createdAt: z.string(),
  closedAt: z.string().nullable(),
})
export type InterventionView = z.infer<typeof interventionViewSchema>

export const interventionsResponseSchema = z.object({ interventions: z.array(interventionViewSchema) })
export type InterventionsResponse = z.infer<typeof interventionsResponseSchema>

export const createInterventionBodySchema = z
  .object({
    learnerId: uuid,
    classId: uuid,
    skillTag: z.string().min(1).max(100),
    action: z.string().trim().min(1).max(MAX_INTERVENTION_ACTION_CHARS),
    followUpOn: isoDateSchema,
  })
  .strict()
export type CreateInterventionBody = z.infer<typeof createInterventionBodySchema>

export const patchInterventionBodySchema = z
  .object({
    status: interventionStatusSchema.optional(),
    outcome: interventionOutcomeSchema.optional(),
    action: z.string().trim().min(1).max(MAX_INTERVENTION_ACTION_CHARS).optional(),
    followUpOn: isoDateSchema.optional(),
    /** On close: the events that show the outcome; defaults to every evidence event on the skill since assignment. */
    evidenceEventIds: z.array(uuid).max(50).optional(),
  })
  .strict()
export type PatchInterventionBody = z.infer<typeof patchInterventionBodySchema>

export const interventionResponseSchema = z.object({ intervention: interventionViewSchema })
export type InterventionResponse = z.infer<typeof interventionResponseSchema>

// ── T4 notes home ──────────────────────────────────────────────────────────────────────────

export const noteViewSchema = z.object({
  id: uuid,
  learner: personRef,
  guardian: personRef,
  status: noteStatusSchema,
  origin: noteOriginSchema,
  originLabel: z.string(),
  audience: noteAudienceSchema,
  draftText: z.string(),
  finalText: z.string().nullable(),
  modelRunId: uuid.nullable(),
  approvedAt: z.string().nullable(),
  sentAt: z.string().nullable(),
  createdAt: z.string(),
})
export type NoteView = z.infer<typeof noteViewSchema>

export const notesResponseSchema = z.object({ class: classRef, notes: z.array(noteViewSchema) })
export type NotesResponse = z.infer<typeof notesResponseSchema>

export const DRAFT_SKIP_REASONS = ['no_guardian', 'no_lost_step', 'already_drafted', 'model_not_configured', 'uncertain', 'budget_exhausted'] as const
export const draftSkipReasonSchema = z.enum(DRAFT_SKIP_REASONS)
export type DraftSkipReason = z.infer<typeof draftSkipReasonSchema>

export const draftNotesResponseSchema = z.object({
  weekStart: z.string(),
  notes: z.array(noteViewSchema),
  skipped: z.array(z.object({ learner: personRef, reason: draftSkipReasonSchema })),
})
export type DraftNotesResponse = z.infer<typeof draftNotesResponseSchema>

export const createNoteBodySchema = z
  .object({
    learnerId: uuid,
    text: z.string().trim().min(1).max(MAX_NOTE_TEXT_CHARS),
  })
  .strict()
export type CreateNoteBody = z.infer<typeof createNoteBodySchema>

export const approveNoteBodySchema = z.object({ finalText: z.string().trim().min(1).max(MAX_NOTE_TEXT_CHARS) }).strict()
export type ApproveNoteBody = z.infer<typeof approveNoteBodySchema>

export const noteResponseSchema = z.object({ note: noteViewSchema })
export type NoteResponse = z.infer<typeof noteResponseSchema>

/** What a guardian sees (spec 05 §4.3 G2; §9 G1): the text, the label, the teacher's name and the date. Never a draft. */
export const guardianNoteViewSchema = z.object({
  id: uuid,
  learner: personRef,
  teacher: personRef,
  label: z.string(),
  text: z.string(),
  sentAt: z.string(),
  /** B12: the note in the guardian's home language, or null when they read in English. */
  translation: translationViewSchema.nullable(),
})
export type GuardianNoteView = z.infer<typeof guardianNoteViewSchema>

export const guardianNotesResponseSchema = z.object({ language: languageSchema, notes: z.array(guardianNoteViewSchema) })
export type GuardianNotesResponse = z.infer<typeof guardianNotesResponseSchema>

// ── T6 learner profile ─────────────────────────────────────────────────────────────────────

export const teacherLearnerResponseSchema = z.object({
  learner: personRef,
  classes: z.array(classRef),
  /** Spec 03 §8.2: a teacher sees subjects and the hardest subject only, never the dream or the raw text. */
  cards: z.object({ subjects: z.array(z.string()), hardestSubject: z.string().nullable() }).nullable(),
  /** The Brain's projection in teacher wording (B05): three marks per skill, teacher-confirmed results overriding the model's. */
  skills: z.array(brainSkillSchema),
  attempts: z.array(
    z.object({
      id: uuid,
      itemSlug: z.string(),
      itemTopic: z.string(),
      status: attemptStatusSchema,
      mode: attemptModeSchema,
      proposedTotal: z.number().int().nullable(),
      maxMarks: z.number().int(),
      review: z.object({ state: reviewStateSchema, total: z.number().int() }).nullable(),
      createdAt: z.string(),
    }),
  ),
  interventions: z.array(interventionViewSchema),
})
export type TeacherLearnerResponse = z.infer<typeof teacherLearnerResponseSchema>
