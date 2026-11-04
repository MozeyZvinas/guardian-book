import { sql } from 'drizzle-orm'
import {
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  real,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core'
import {
  EVENT_BASES,
  GUARDIAN_LANGUAGES,
  GUIDELINE_STEP_TYPES,
  ITEM_SOURCES,
  ITEM_STATUSES,
  LEARNING_EVENT_KINDS,
  PRACTICE_KINDS,
  PROVENANCES,
  ROLES,
  TRAINING_PERMISSIONS,
} from '@guardian-book/shared'

/**
 * The schema (spec 03 §2, §8.1, §9.1). snake_case columns, UUID v7 primary keys from the
 * SQL function `uuid_generate_v7()` (migration 0000), `created_at` defaults. Enums are
 * Postgres enums. Migrations are additive only.
 *
 * Append-only tables (`learning_events`, `assessments`, `model_runs`) are guarded by a
 * database trigger (migration 0002), not just by convention.
 */

const id = () =>
  uuid('id')
    .primaryKey()
    .default(sql`uuid_generate_v7()`)
const createdAt = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow()

// ── enums ──────────────────────────────────────────────────────────────────────────────────

export const roleEnum = pgEnum('role', ROLES)
export const schoolKindEnum = pgEnum('school_kind', ['fictional', 'pilot', 'live'])
export const provenanceEnum = pgEnum('provenance', PROVENANCES)
export const trainingPermissionEnum = pgEnum('training_permission', TRAINING_PERMISSIONS)
export const itemStatusEnum = pgEnum('item_status', ITEM_STATUSES)
export const guidelineStepTypeEnum = pgEnum('guideline_step_type', GUIDELINE_STEP_TYPES)
export const attemptKindEnum = pgEnum('attempt_kind', ['typed', 'photo'])
export const attemptModeEnum = pgEnum('attempt_mode', ['assisted', 'independent', 'retention'])
export const assessmentStatusEnum = pgEnum('assessment_status', ['proposed', 'uncertain', 'failed'])
export const consistencyCheckEnum = pgEnum('consistency_check', ['agree', 'disagree', 'skipped'])
export const reviewStateEnum = pgEnum('review_state', ['confirmed', 'released'])
export const learningEventKindEnum = pgEnum('learning_event_kind', LEARNING_EVENT_KINDS)
export const eventBasisEnum = pgEnum('event_basis', EVENT_BASES)
export const topicStateEnum = pgEnum('topic_state_value', ['new', 'practising', 'secure'])
export const inputKindEnum = pgEnum('input_kind', ['work', 'notice', 'question'])
export const modelRunPurposeEnum = pgEnum('model_run_purpose', [
  'classify',
  'profile_cards',
  'assess',
  'notice',
  'plan',
  'note',
  // B12 (migration 0004): a parent-facing text into the parent's home language.
  'translate',
  // B13 (migration 0005): voice transcription and ask-about-a-step hints.
  'transcribe',
  'step_hint',
  // B15 (migration 0006): help me with a question, read twice and compared.
  'guide',
])
export const modelRunStatusEnum = pgEnum('model_run_status', ['accepted', 'retried', 'exhausted', 'failed'])
export const calendarScopeEnum = pgEnum('calendar_scope', ['class', 'learner'])
export const calendarConfidenceEnum = pgEnum('calendar_confidence', ['high', 'low'])
export const calendarStatusEnum = pgEnum('calendar_status', ['proposed', 'confirmed', 'rejected'])
export const helpPlanStatusEnum = pgEnum('help_plan_status', ['issued', 'superseded'])
export const noteStatusEnum = pgEnum('note_status', ['draft', 'approved', 'sent'])
export const noteOriginEnum = pgEnum('note_origin', [
  'ai_suggested',
  'teacher_approved',
  'teacher_added',
  'teacher_revised',
])
export const noteAudienceEnum = pgEnum('note_audience', ['learner', 'guardian', 'teacher_only'])
export const interventionStatusEnum = pgEnum('intervention_status', ['open', 'checking', 'closed'])
export const interventionOutcomeEnum = pgEnum('intervention_outcome', ['improved', 'no_change', 'needs_more'])
export const reviewFeedbackKindEnum = pgEnum('review_feedback_kind', ['agree', 'correct', 'add'])
/** B12: the parent's home language (brief B12; D38). */
export const languageCodeEnum = pgEnum('language_code', GUARDIAN_LANGUAGES)
export const translationStatusEnum = pgEnum('translation_status', ['ready', 'unavailable'])
/** B17: class practice from the library is a whole paper or every question on a skill. */
export const practiceKindEnum = pgEnum('practice_kind', PRACTICE_KINDS)
/** B15: where a guided question stands; `unsure` shows the read-back and the first hint only. */
export const guideStatusEnum = pgEnum('guide_status', ['reading', 'ready', 'unsure', 'failed'])

/** The three provenance columns every artifact table carries (spec 03 §9.1). */
const provenanceColumns = () => ({
  provenance: provenanceEnum('provenance').notNull(),
  provenanceDetail: jsonb('provenance_detail'),
  trainingPermission: trainingPermissionEnum('training_permission').notNull().default('not_permitted'),
})

// ── Better Auth tables (names as Better Auth expects; snake_case columns) ─────────────────

export const user = pgTable('user', {
  id: id(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: boolean('email_verified').notNull().default(false),
  image: text('image'),
  createdAt: createdAt(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export const session = pgTable(
  'session',
  {
    id: id(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    token: text('token').notNull().unique(),
    createdAt: createdAt(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    userId: uuid('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
  },
  (t) => [index('session_user_id_idx').on(t.userId)],
)

export const account = pgTable(
  'account',
  {
    id: id(),
    accountId: text('account_id').notNull(),
    providerId: text('provider_id').notNull(),
    userId: uuid('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    accessToken: text('access_token'),
    refreshToken: text('refresh_token'),
    idToken: text('id_token'),
    accessTokenExpiresAt: timestamp('access_token_expires_at', { withTimezone: true }),
    refreshTokenExpiresAt: timestamp('refresh_token_expires_at', { withTimezone: true }),
    scope: text('scope'),
    password: text('password'),
    createdAt: createdAt(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('account_user_id_idx').on(t.userId)],
)

export const verification = pgTable(
  'verification',
  {
    id: id(),
    identifier: text('identifier').notNull(),
    value: text('value').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: createdAt(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('verification_identifier_idx').on(t.identifier)],
)

// ── schools, profiles, the circle ─────────────────────────────────────────────────────────

export const schools = pgTable('schools', {
  id: id(),
  name: text('name').notNull(),
  kind: schoolKindEnum('kind').notNull().default('fictional'),
  createdAt: createdAt(),
})

export const profiles = pgTable(
  'profiles',
  {
    userId: uuid('user_id')
      .primaryKey()
      .references(() => user.id, { onDelete: 'cascade' }),
    role: roleEnum('role').notNull(),
    nickname: text('nickname').notNull(),
    ageAttestedAt: timestamp('age_attested_at', { withTimezone: true }).notNull(),
    schoolId: uuid('school_id').references(() => schools.id),
    cards: jsonb('cards'),
    cardsSourceText: text('cards_source_text'),
    cardsModelRunId: uuid('cards_model_run_id'),
    /** B12: the language a guardian reads This week and Notes in; `en` for everyone else. */
    preferredLanguage: languageCodeEnum('preferred_language').notNull().default('en'),
    createdAt: createdAt(),
  },
  (t) => [
    check('profiles_cards_source_text_len', sql`char_length(${t.cardsSourceText}) <= 2000`),
    check('profiles_nickname_len', sql`char_length(${t.nickname}) between 1 and 40`),
  ],
)

export const classes = pgTable(
  'classes',
  {
    id: id(),
    name: text('name').notNull(),
    teacherId: uuid('teacher_id')
      .notNull()
      .references(() => user.id),
    schoolId: uuid('school_id')
      .notNull()
      .references(() => schools.id),
    /** SHA-256 of the 8-character class code; the code itself is never stored. */
    codeHash: text('code_hash').notNull().unique(),
    createdAt: createdAt(),
  },
  (t) => [index('classes_teacher_id_idx').on(t.teacherId)],
)

export const classMembers = pgTable(
  'class_members',
  {
    classId: uuid('class_id')
      .notNull()
      .references(() => classes.id),
    learnerId: uuid('learner_id')
      .notNull()
      .references(() => user.id),
    joinedAt: timestamp('joined_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.classId, t.learnerId] }), index('class_members_learner_idx').on(t.learnerId)],
)

/** The learner's current, unredeemed guardian code (rotates; expires in 7 days). */
export const guardianInviteCodes = pgTable('guardian_invite_codes', {
  learnerId: uuid('learner_id')
    .primaryKey()
    .references(() => user.id, { onDelete: 'cascade' }),
  codeHash: text('code_hash').notNull().unique(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: createdAt(),
})

export const guardianLinks = pgTable(
  'guardian_links',
  {
    learnerId: uuid('learner_id')
      .notNull()
      .references(() => user.id),
    guardianId: uuid('guardian_id')
      .notNull()
      .references(() => user.id),
    inviteCodeHash: text('invite_code_hash').notNull(),
    linkedAt: timestamp('linked_at', { withTimezone: true }).notNull().defaultNow(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
  },
  (t) => [primaryKey({ columns: [t.learnerId, t.guardianId] }), index('guardian_links_guardian_idx').on(t.guardianId)],
)

// ── content ───────────────────────────────────────────────────────────────────────────────

export const items = pgTable(
  'items',
  {
    id: id(),
    slug: text('slug').notNull().unique(),
    topic: text('topic').notNull(),
    skillTags: text('skill_tags').array().notNull(),
    promptMd: text('prompt_md').notNull(),
    diagramKey: text('diagram_key'),
    maxMarks: integer('max_marks').notNull(),
    status: itemStatusEnum('status').notNull().default('draft'),
    revision: integer('revision').notNull().default(1),
    author: text('author').notNull(),
    reviewer: text('reviewer').notNull(),
    reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
    /** `original`, or `dbe_nsc` (B17, D40): a real NSC question, which must carry its paper reference and attribution. */
    source: text('source').notNull().default('original'),
    /** B17: `{subject, grade, year, session, paper, question}` for a `dbe_nsc` item (`sourceRefSchema`); null otherwise. */
    sourceRef: jsonb('source_ref'),
    /** B17 (D40): the attribution line, shown wherever the question is shown and never stripped. */
    attribution: text('attribution'),
    /** B17 (D31): the newest session is held out: never practice, never in the library; the evaluation reads it. */
    heldOut: boolean('held_out').notNull().default(false),
    ...provenanceColumns(),
    createdAt: createdAt(),
  },
  (t) => [
    check('items_source_known', sql`${t.source} in (${sql.raw(ITEM_SOURCES.map((source) => `'${source}'`).join(', '))})`),
    check('items_dbe_nsc_ref', sql`${t.source} <> 'dbe_nsc' or (${t.sourceRef} is not null and ${t.attribution} is not null)`),
    check('items_max_marks_pos', sql`${t.maxMarks} > 0`),
  ],
)

export const guidelineSteps = pgTable(
  'guideline_steps',
  {
    id: id(),
    itemId: uuid('item_id')
      .notNull()
      .references(() => items.id, { onDelete: 'cascade' }),
    stepNo: integer('step_no').notNull(),
    stepType: guidelineStepTypeEnum('step_type').notNull(),
    criterion: text('criterion').notNull(),
    marks: integer('marks').notNull(),
    skillTag: text('skill_tag').notNull(),
    notes: text('notes'),
    ...provenanceColumns(),
    createdAt: createdAt(),
  },
  (t) => [unique('guideline_steps_item_step_no').on(t.itemId, t.stepNo), check('guideline_steps_marks_nonneg', sql`${t.marks} >= 0`)],
)

export const guidelineApprovals = pgTable(
  'guideline_approvals',
  {
    classId: uuid('class_id')
      .notNull()
      .references(() => classes.id),
    itemId: uuid('item_id')
      .notNull()
      .references(() => items.id),
    itemRevision: integer('item_revision').notNull(),
    approvedBy: uuid('approved_by')
      .notNull()
      .references(() => user.id),
    approvedAt: timestamp('approved_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.classId, t.itemId, t.itemRevision] })],
)

// ── practice and assessment ───────────────────────────────────────────────────────────────

export const attempts = pgTable(
  'attempts',
  {
    id: id(),
    learnerId: uuid('learner_id')
      .notNull()
      .references(() => user.id),
    itemId: uuid('item_id')
      .notNull()
      .references(() => items.id),
    itemRevision: integer('item_revision').notNull(),
    kind: attemptKindEnum('kind').notNull(),
    mode: attemptModeEnum('mode').notNull().default('assisted'),
    answerText: text('answer_text'),
    imageKey: text('image_key'),
    parentAttemptId: uuid('parent_attempt_id'),
    idempotencyKey: text('idempotency_key').notNull(),
    /**
     * Set when a background assessment starts (B04): `GET /api/attempts/:id` answers
     * `assessing` while it is set and no assessment row exists; the boot sweep marks any
     * attempt stuck here for more than 5 minutes `uncertain`. Cleared when the run ends.
     */
    assessingStartedAt: timestamp('assessing_started_at', { withTimezone: true }),
    ...provenanceColumns(),
    createdAt: createdAt(),
  },
  (t) => [
    unique('attempts_learner_idempotency').on(t.learnerId, t.idempotencyKey),
    index('attempts_item_idx').on(t.itemId),
    check('attempts_answer_text_len', sql`char_length(${t.answerText}) <= 4000`),
    check(
      'attempts_text_xor_image',
      sql`(${t.answerText} is not null and ${t.imageKey} is null) or (${t.answerText} is null and ${t.imageKey} is not null)`,
    ),
  ],
)

export const assessments = pgTable(
  'assessments',
  {
    id: id(),
    attemptId: uuid('attempt_id')
      .notNull()
      .unique()
      .references(() => attempts.id),
    status: assessmentStatusEnum('status').notNull(),
    total: integer('total'),
    steps: jsonb('steps').notNull(),
    ambiguityReasons: text('ambiguity_reasons').array().notNull().default(sql`'{}'::text[]`),
    transcriptionConfidence: real('transcription_confidence'),
    modelId: text('model_id').notNull(),
    promptVersion: text('prompt_version').notNull(),
    consistencyCheck: consistencyCheckEnum('consistency_check').notNull(),
    latencyMs: integer('latency_ms').notNull(),
    costUsd: numeric('cost_usd', { precision: 10, scale: 6 }).notNull(),
    requestId: text('request_id').notNull(),
    ...provenanceColumns(),
    createdAt: createdAt(),
  },
)

export const reviews = pgTable(
  'reviews',
  {
    id: id(),
    assessmentId: uuid('assessment_id')
      .notNull()
      .unique()
      .references(() => assessments.id),
    teacherId: uuid('teacher_id')
      .notNull()
      .references(() => user.id),
    steps: jsonb('steps').notNull(),
    total: integer('total').notNull(),
    comment: text('comment'),
    state: reviewStateEnum('state').notNull(),
    version: integer('version').notNull().default(1),
    confirmedAt: timestamp('confirmed_at', { withTimezone: true }).notNull(),
    releasedAt: timestamp('released_at', { withTimezone: true }),
    ...provenanceColumns(),
    createdAt: createdAt(),
  },
)

export const reviewFeedback = pgTable(
  'review_feedback',
  {
    id: id(),
    reviewId: uuid('review_id')
      .notNull()
      .references(() => reviews.id),
    kind: reviewFeedbackKindEnum('kind').notNull(),
    text: text('text'),
    audience: noteAudienceEnum('audience').notNull(),
    origin: noteOriginEnum('origin').notNull(),
    createdBy: uuid('created_by')
      .notNull()
      .references(() => user.id),
    createdAt: createdAt(),
  },
  (t) => [check('review_feedback_text_len', sql`char_length(${t.text}) <= 600`)],
)

// ── the Brain ─────────────────────────────────────────────────────────────────────────────

export const learningEvents = pgTable(
  'learning_events',
  {
    id: id(),
    learnerId: uuid('learner_id')
      .notNull()
      .references(() => user.id),
    kind: learningEventKindEnum('kind').notNull(),
    attemptId: uuid('attempt_id').references(() => attempts.id),
    itemId: uuid('item_id').references(() => items.id),
    skillTag: text('skill_tag'),
    basis: eventBasisEnum('basis').notNull(),
    payload: jsonb('payload').notNull().default(sql`'{}'::jsonb`),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('learning_events_learner_occurred_idx').on(t.learnerId, t.occurredAt)],
)

export const topicState = pgTable(
  'topic_state',
  {
    learnerId: uuid('learner_id')
      .notNull()
      .references(() => user.id),
    skillTag: text('skill_tag').notNull(),
    state: topicStateEnum('state').notNull(),
    evidenceEventIds: uuid('evidence_event_ids').array().notNull().default(sql`'{}'::uuid[]`),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.learnerId, t.skillTag] })],
)

export const skillEvidence = pgTable(
  'skill_evidence',
  {
    learnerId: uuid('learner_id')
      .notNull()
      .references(() => user.id),
    skillTag: text('skill_tag').notNull(),
    assistedCorrect: integer('assisted_correct').notNull().default(0),
    assistedTotal: integer('assisted_total').notNull().default(0),
    independentCorrect: integer('independent_correct').notNull().default(0),
    independentTotal: integer('independent_total').notNull().default(0),
    retainedCorrect: integer('retained_correct').notNull().default(0),
    retainedTotal: integer('retained_total').notNull().default(0),
    confidenceSureCorrect: integer('confidence_sure_correct').notNull().default(0),
    confidenceSureTotal: integer('confidence_sure_total').notNull().default(0),
    evidenceCount: integer('evidence_count').notNull().default(0),
    lastCheckedAt: timestamp('last_checked_at', { withTimezone: true }),
  },
  (t) => [primaryKey({ columns: [t.learnerId, t.skillTag] })],
)

export const recommendations = pgTable('recommendations', {
  id: id(),
  learnerId: uuid('learner_id')
    .notNull()
    .references(() => user.id),
  fromAttemptId: uuid('from_attempt_id')
    .notNull()
    .references(() => attempts.id),
  itemId: uuid('item_id')
    .notNull()
    .references(() => items.id),
  reason: text('reason').notNull(),
  basisEventIds: uuid('basis_event_ids').array().notNull().default(sql`'{}'::uuid[]`),
  createdAt: createdAt(),
  followedAttemptId: uuid('followed_attempt_id').references(() => attempts.id),
})

// ── inputs, model runs, calendar, plans, notes, resources ─────────────────────────────────

export const inputs = pgTable(
  'inputs',
  {
    id: id(),
    learnerId: uuid('learner_id')
      .notNull()
      .references(() => user.id),
    kind: inputKindEnum('kind').notNull(),
    kindOverridden: boolean('kind_overridden').notNull().default(false),
    text: text('text'),
    objectKey: text('object_key'),
    attemptId: uuid('attempt_id').references(() => attempts.id),
    /** Replaying `POST /api/inputs` with the same key returns the same input: no second upload, no second model call (B04). */
    idempotencyKey: text('idempotency_key').notNull(),
    ...provenanceColumns(),
    createdAt: createdAt(),
  },
  (t) => [
    unique('inputs_learner_idempotency').on(t.learnerId, t.idempotencyKey),
    index('inputs_learner_created_idx').on(t.learnerId, t.createdAt),
    check('inputs_text_len', sql`char_length(${t.text}) <= 4000`),
    check(
      'inputs_text_xor_object',
      sql`(${t.text} is not null and ${t.objectKey} is null) or (${t.text} is null and ${t.objectKey} is not null)`,
    ),
  ],
)

export const modelRuns = pgTable(
  'model_runs',
  {
    id: id(),
    purpose: modelRunPurposeEnum('purpose').notNull(),
    subjectType: text('subject_type').notNull(),
    subjectId: uuid('subject_id').notNull(),
    modelId: text('model_id').notNull(),
    tier: text('tier').notNull().default('standard'),
    promptVersion: text('prompt_version').notNull(),
    requestId: text('request_id').notNull(),
    inputTokens: integer('input_tokens').notNull().default(0),
    outputTokens: integer('output_tokens').notNull().default(0),
    costUsd: numeric('cost_usd', { precision: 10, scale: 6 }).notNull().default('0'),
    latencyMs: integer('latency_ms').notNull(),
    output: jsonb('output'),
    checks: jsonb('checks').notNull().default(sql`'[]'::jsonb`),
    attemptNo: integer('attempt_no').notNull().default(1),
    status: modelRunStatusEnum('status').notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    check('model_runs_tier_standard', sql`${t.tier} = 'standard'`),
    check('model_runs_attempt_no_range', sql`${t.attemptNo} between 1 and 3`),
    index('model_runs_subject_idx').on(t.subjectType, t.subjectId),
  ],
)

export const calendarEvents = pgTable(
  'calendar_events',
  {
    id: id(),
    scopeType: calendarScopeEnum('scope_type').notNull(),
    scopeId: uuid('scope_id').notNull(),
    title: text('title').notNull(),
    subject: text('subject'),
    paper: text('paper'),
    onDate: date('on_date').notNull(),
    sourceInputId: uuid('source_input_id')
      .notNull()
      .references(() => inputs.id),
    sourceLine: text('source_line').notNull(),
    confidence: calendarConfidenceEnum('confidence').notNull(),
    status: calendarStatusEnum('status').notNull().default('proposed'),
    confirmedBy: uuid('confirmed_by').references(() => user.id),
    ...provenanceColumns(),
    createdAt: createdAt(),
  },
  (t) => [check('calendar_events_source_line_len', sql`char_length(${t.sourceLine}) <= 300`), index('calendar_events_scope_idx').on(t.scopeType, t.scopeId)],
)

export const helpPlans = pgTable(
  'help_plans',
  {
    id: id(),
    learnerId: uuid('learner_id')
      .notNull()
      .references(() => user.id),
    weekStart: date('week_start').notNull(),
    gapSkillTag: text('gap_skill_tag').notNull(),
    learnerView: jsonb('learner_view').notNull(),
    guardianView: jsonb('guardian_view').notNull(),
    teacherView: jsonb('teacher_view').notNull(),
    evidenceEventIds: uuid('evidence_event_ids').array().notNull(),
    resourceIds: uuid('resource_ids').array().notNull().default(sql`'{}'::uuid[]`),
    agentTrace: jsonb('agent_trace').notNull().default(sql`'[]'::jsonb`),
    modelRunId: uuid('model_run_id').references(() => modelRuns.id),
    status: helpPlanStatusEnum('status').notNull().default('issued'),
    ...provenanceColumns(),
    createdAt: createdAt(),
  },
  (t) => [
    check('help_plans_evidence_nonempty', sql`cardinality(${t.evidenceEventIds}) >= 1`),
    index('help_plans_learner_week_idx').on(t.learnerId, t.weekStart),
  ],
)

export const notes = pgTable(
  'notes',
  {
    id: id(),
    teacherId: uuid('teacher_id')
      .notNull()
      .references(() => user.id),
    learnerId: uuid('learner_id')
      .notNull()
      .references(() => user.id),
    guardianId: uuid('guardian_id')
      .notNull()
      .references(() => user.id),
    draftText: text('draft_text').notNull(),
    finalText: text('final_text'),
    modelRunId: uuid('model_run_id').references(() => modelRuns.id),
    status: noteStatusEnum('status').notNull().default('draft'),
    approvedAt: timestamp('approved_at', { withTimezone: true }),
    sentAt: timestamp('sent_at', { withTimezone: true }),
    origin: noteOriginEnum('origin').notNull(),
    audience: noteAudienceEnum('audience').notNull(),
    ...provenanceColumns(),
    createdAt: createdAt(),
  },
  (t) => [
    check('notes_draft_text_len', sql`char_length(${t.draftText}) <= 600`),
    check('notes_sent_after_approved', sql`${t.sentAt} is null or ${t.approvedAt} is not null`),
    index('notes_guardian_idx').on(t.guardianId),
  ],
)

export const resources = pgTable('resources', {
  id: id(),
  title: text('title').notNull(),
  url: text('url').notNull(),
  licence: text('licence').notNull(),
  attribution: text('attribution').notNull(),
  free: boolean('free').notNull().default(true),
  skillTags: text('skill_tags').array().notNull(),
  approved: boolean('approved').notNull().default(false),
  ...provenanceColumns(),
  createdAt: createdAt(),
})

export const interventions = pgTable(
  'interventions',
  {
    id: id(),
    learnerId: uuid('learner_id')
      .notNull()
      .references(() => user.id),
    classId: uuid('class_id')
      .notNull()
      .references(() => classes.id),
    skillTag: text('skill_tag').notNull(),
    helpPlanId: uuid('help_plan_id').references(() => helpPlans.id),
    ownerId: uuid('owner_id')
      .notNull()
      .references(() => user.id),
    action: text('action').notNull(),
    followUpOn: date('follow_up_on').notNull(),
    status: interventionStatusEnum('status').notNull().default('open'),
    outcome: interventionOutcomeEnum('outcome'),
    outcomeEvidenceEventIds: uuid('outcome_evidence_event_ids').array().notNull().default(sql`'{}'::uuid[]`),
    createdAt: createdAt(),
    closedAt: timestamp('closed_at', { withTimezone: true }),
  },
  (t) => [
    check('interventions_action_len', sql`char_length(${t.action}) <= 300`),
    check(
      'interventions_closed_needs_outcome',
      sql`${t.status} <> 'closed' or (${t.outcome} is not null and cardinality(${t.outcomeEvidenceEventIds}) >= 1 and ${t.closedAt} is not null)`,
    ),
    index('interventions_class_follow_up_idx').on(t.classId, t.followUpOn),
  ],
)

/**
 * B12: a cached translation of one parent-facing text into one language. Keyed on the
 * hash of the source text, so two guardians (or two reads) share one verified translation.
 * `ready` rows carry the text; `unavailable` rows record that the model could not do it
 * after three verified calls (the English stands). Never a learner's work.
 */
export const translations = pgTable(
  'translations',
  {
    id: id(),
    /** `plan_gap`, `plan_action`, `plan_celebrate`, `note`, `review_feedback`, `intervention`. */
    sourceKind: text('source_kind').notNull(),
    sourceId: uuid('source_id').notNull(),
    language: languageCodeEnum('language').notNull(),
    sourceHash: text('source_hash').notNull(),
    text: text('text'),
    status: translationStatusEnum('status').notNull(),
    modelRunId: uuid('model_run_id').references(() => modelRuns.id),
    ...provenanceColumns(),
    createdAt: createdAt(),
  },
  (t) => [
    unique('translations_source_hash_language').on(t.sourceHash, t.language),
    index('translations_source_idx').on(t.sourceKind, t.sourceId),
    check('translations_text_len', sql`char_length(${t.text}) <= 2000`),
    check('translations_ready_has_text', sql`${t.status} <> 'ready' or ${t.text} is not null`),
    check('translations_language_not_en', sql`${t.language} <> 'en'`),
  ],
)

/**
 * B17: class practice set by the teacher from the library (brief B17 phase B §2): a whole
 * paper or every library question on one skill, by a date. `item_ids` is the set as it
 * stood when assigned, so a later load never changes what a class was asked to do. It
 * lands on learners' Today and parents' "What's coming".
 */
export const classPractice = pgTable(
  'class_practice',
  {
    id: id(),
    classId: uuid('class_id')
      .notNull()
      .references(() => classes.id),
    kind: practiceKindEnum('kind').notNull(),
    /** "NSC Mathematics P1, November 2023", or the skill in teacher words. */
    title: text('title').notNull(),
    skillTag: text('skill_tag'),
    /** `paperRefSchema` for a paper set; null for a topic set. */
    paperRef: jsonb('paper_ref'),
    itemIds: uuid('item_ids').array().notNull().default(sql`'{}'::uuid[]`),
    dueOn: date('due_on').notNull(),
    assignedBy: uuid('assigned_by')
      .notNull()
      .references(() => user.id),
    ...provenanceColumns(),
    createdAt: createdAt(),
  },
  (t) => [
    index('class_practice_class_due_idx').on(t.classId, t.dueOn),
    check('class_practice_title_len', sql`char_length(${t.title}) between 1 and 160`),
    check('class_practice_kind_ref', sql`(${t.kind} = 'paper' and ${t.paperRef} is not null) or (${t.kind} = 'topic' and ${t.skillTag} is not null)`),
  ],
)

/**
 * B15: help me with a question. One row per read of one input (a photo or typed text);
 * the learner's corrected read-back is a new row pointing back through `edited_from_id`.
 * Status `reading` while the two independent reads run (`model_runs`, purpose `guide`);
 * `ready` when both passed the verifier and agree on the final answer and confidence is
 * not low; `unsure` when only the read-back and first hint may be shown; `failed` when
 * nothing verified came back. The steps copied here are the accepted read's; provenance
 * turns `model_generated` (with the run's detail) in the same write. Never a mark, never
 * a learning event (the Brain does not move, brief B15 §5).
 */
export const guides = pgTable(
  'guides',
  {
    id: id(),
    learnerId: uuid('learner_id')
      .notNull()
      .references(() => user.id),
    inputId: uuid('input_id')
      .notNull()
      .references(() => inputs.id),
    editedFromId: uuid('edited_from_id'),
    idempotencyKey: text('idempotency_key').notNull(),
    status: guideStatusEnum('status').notNull().default('reading'),
    questionMd: text('question_md'),
    subject: text('subject'),
    topic: text('topic'),
    steps: jsonb('steps').notNull().default(sql`'[]'::jsonb`),
    finalAnswer: text('final_answer'),
    confidence: text('confidence'),
    agreement: consistencyCheckEnum('agreement'),
    matchedItemId: uuid('matched_item_id').references(() => items.id),
    modelRunIds: uuid('model_run_ids').array().notNull().default(sql`'{}'::uuid[]`),
    checks: jsonb('checks').notNull().default(sql`'[]'::jsonb`),
    readingStartedAt: timestamp('reading_started_at', { withTimezone: true }),
    ...provenanceColumns(),
    createdAt: createdAt(),
  },
  (t) => [
    unique('guides_learner_idempotency').on(t.learnerId, t.idempotencyKey),
    index('guides_learner_created_idx').on(t.learnerId, t.createdAt),
    index('guides_input_idx').on(t.inputId),
    check('guides_confidence_level', sql`${t.confidence} is null or ${t.confidence} in ('high', 'medium', 'low')`),
    check('guides_question_md_len', sql`char_length(${t.questionMd}) <= 2000`),
    check('guides_ready_has_answer', sql`${t.status} <> 'ready' or (${t.questionMd} is not null and ${t.finalAnswer} is not null)`),
  ],
)

// ── audit and usage ───────────────────────────────────────────────────────────────────────

export const auditEvents = pgTable(
  'audit_events',
  {
    id: id(),
    actorId: uuid('actor_id'),
    action: text('action').notNull(),
    subjectType: text('subject_type').notNull(),
    subjectId: text('subject_id'),
    outcome: text('outcome').notNull(),
    requestId: text('request_id'),
    at: timestamp('at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('audit_events_actor_idx').on(t.actorId, t.at)],
)

export const modelUsageDaily = pgTable(
  'model_usage_daily',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => user.id),
    day: date('day').notNull(),
    calls: integer('calls').notNull().default(0),
    costUsd: numeric('cost_usd', { precision: 10, scale: 6 }).notNull().default('0'),
  },
  (t) => [primaryKey({ columns: [t.userId, t.day] })],
)

/** Tables that carry provenance columns (spec 03 §9.1); the provenance test walks this list. */
export const PROVENANCE_TABLES = [
  'items',
  'guideline_steps',
  'attempts',
  'inputs',
  'assessments',
  'reviews',
  'notes',
  'help_plans',
  'calendar_events',
  'resources',
  'translations',
  'class_practice',
  'guides',
] as const

/** Tables the database refuses to UPDATE or DELETE (migration 0002). */
export const APPEND_ONLY_TABLES = ['learning_events', 'assessments', 'model_runs'] as const
