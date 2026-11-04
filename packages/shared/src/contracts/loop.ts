import { z } from 'zod'
import { skillTagSchema } from './items.js'
import { languageSchema, translationViewSchema } from './language.js'
import { MAX_INPUT_TEXT } from './practice.js'

/**
 * Closing the loop (brief B06; spec 02 P0-05, P0-08, P0-09; spec 03 §8.3, §9.3): fix it,
 * check it alone, the Help Plan as the learner and the guardian read it, "We did it", and
 * the vetted resource list. What the API accepts and serves, camelCase.
 */

const uuid = z.string().uuid()

// ── fix it (P0-05) ────────────────────────────────────────────────────────────────────────

/** JSON body of `POST /api/attempts/:id/fix`; a photo comes as multipart with a `file` part instead. */
export const fixAttemptBodySchema = z.object({ answerText: z.string().trim().min(1).max(MAX_INPUT_TEXT) }).strict()
export type FixAttemptBody = z.infer<typeof fixAttemptBodySchema>

export const fixAttemptResponseSchema = z.object({
  /** The retry attempt (a child of the original); poll `GET /api/attempts/:id` for the result. */
  attemptId: uuid,
  parentAttemptId: uuid,
  /** 1 for the first retry; only the first one can count as "fixed on your own". */
  retryNo: z.number().int().min(1),
  status: z.enum(['assessing', 'done']),
})
export type FixAttemptResponse = z.infer<typeof fixAttemptResponseSchema>

/** Served on a retry attempt: what it set out to fix and whether it did (null until assessed). */
export const attemptFixViewSchema = z.object({
  parentAttemptId: uuid,
  retryNo: z.number().int().min(1),
  targetStepNos: z.array(z.number().int()),
  fixedIndependently: z.boolean().nullable(),
})
export type AttemptFixView = z.infer<typeof attemptFixViewSchema>

// ── check it alone (P0-05) ─────────────────────────────────────────────────────────────────

export const CHECK_MODES = ['independent', 'retention'] as const
export const checkModeSchema = z.enum(CHECK_MODES)
export type CheckMode = z.infer<typeof checkModeSchema>

export const checkAloneItemSchema = z.object({
  id: uuid,
  slug: z.string(),
  topic: z.string(),
  promptMd: z.string(),
  maxMarks: z.number().int(),
  revision: z.number().int(),
  skillTags: z.array(z.string()),
  /** Guideline steps on this item tagged with the skill being checked. */
  matchingSteps: z.number().int(),
})

/** `GET /api/me/check-alone?skill=&mode=&from=`: the matched item, or null when nothing unattempted matches. */
export const checkAloneResponseSchema = z.object({
  item: checkAloneItemSchema.nullable(),
  skillTag: z.string(),
  skillLabel: z.string(),
  mode: checkModeSchema,
  /** "Why this", in the learner's words. */
  why: z.string(),
  fromAttemptId: uuid.nullable(),
})
export type CheckAloneResponse = z.infer<typeof checkAloneResponseSchema>

// ── the Help Plan (P0-08) ──────────────────────────────────────────────────────────────────

/** Where a stored plan came from: the verified agent, or the safe template (no model text). */
export const PLAN_SOURCES = ['model', 'template'] as const
export const planSourceSchema = z.enum(PLAN_SOURCES)
export type PlanSource = z.infer<typeof planSourceSchema>

export const learnerPlanViewSchema = z.object({
  id: uuid,
  weekStart: z.string(),
  gapSkillTag: z.string(),
  gapLabel: z.string(),
  source: planSourceSchema,
  tonightStep: z.string(),
  hint: z.string(),
  whyItMatters: z.string(),
  /** The attempt with the lost step this plan starts from, for "Start" → fix it. */
  attemptId: uuid.nullable(),
  evidenceCount: z.number().int().nonnegative(),
  createdAt: z.string(),
})
export type LearnerPlanView = z.infer<typeof learnerPlanViewSchema>

export const learnerPlanResponseSchema = z.object({ plan: learnerPlanViewSchema.nullable() })
export type LearnerPlanResponse = z.infer<typeof learnerPlanResponseSchema>

// ── the guardian's week (P0-09; spec 05 §4.3 G1, §9) ──────────────────────────────────────

export const TEACHER_MESSAGE_KINDS = ['note', 'feedback', 'intervention'] as const

/** A teacher message as a guardian may read it: labelled "Teacher-reviewed" or with the teacher's name. */
export const teacherMessageSchema = z.object({
  id: z.string(),
  kind: z.enum(TEACHER_MESSAGE_KINDS),
  label: z.string(),
  text: z.string(),
  at: z.string(),
})
export type TeacherMessage = z.infer<typeof teacherMessageSchema>

export const guardianResourceSchema = z.object({
  id: uuid,
  title: z.string(),
  url: z.string(),
  free: z.boolean(),
  licence: z.string(),
  attribution: z.string(),
})
export type GuardianResource = z.infer<typeof guardianResourceSchema>

export const guardianPlanViewSchema = z.object({
  id: uuid,
  gapSkillTag: z.string(),
  gapLabel: z.string(),
  gap: z.string(),
  action: z.string(),
  celebrate: z.string(),
  source: planSourceSchema,
  issuedAt: z.string(),
  /** When this guardian tapped "We did it" on this plan, else null. */
  doneAt: z.string().nullable(),
})
export type GuardianPlanView = z.infer<typeof guardianPlanViewSchema>

/** `GET /api/guardian/learners/:id/plan`. Never an attempt, an answer or an image (spec 03 §8.2). */
export const guardianWeekResponseSchema = z.object({
  learner: z.object({ id: uuid, nickname: z.string() }),
  weekStart: z.string(),
  today: z.string(),
  effort: z.object({
    /** Monday to Sunday: a day with at least one piece of checked work. */
    dots: z.array(z.boolean()).length(7),
    days: z.number().int().nonnegative(),
    pieces: z.number().int().nonnegative(),
    topics: z.array(z.string()),
  }),
  coming: z.object({ title: z.string(), onDate: z.string(), daysAway: z.number().int() }).nullable(),
  /** Something to celebrate, from the plan when there is one, else from this week's effort. */
  celebrate: z.string().nullable(),
  plan: guardianPlanViewSchema.nullable(),
  resources: z.array(guardianResourceSchema),
  teacherMessages: z.array(teacherMessageSchema),
})
export type GuardianWeekResponse = z.infer<typeof guardianWeekResponseSchema>

// ── the week in the parent's home language (brief B12) ──────────────────────────────────

/** The three guardian-view texts of the plan, each with its translation state. */
export const planTranslationsSchema = z.object({
  gap: translationViewSchema,
  action: translationViewSchema,
  celebrate: translationViewSchema,
})
export type PlanTranslations = z.infer<typeof planTranslationsSchema>

export const guardianPlanWithTranslationsSchema = guardianPlanViewSchema.extend({
  /** Null when the guardian reads in English. */
  translations: planTranslationsSchema.nullable(),
})
export type GuardianPlanWithTranslations = z.infer<typeof guardianPlanWithTranslationsSchema>

export const teacherMessageWithTranslationSchema = teacherMessageSchema.extend({
  translation: translationViewSchema.nullable(),
})
export type TeacherMessageWithTranslation = z.infer<typeof teacherMessageWithTranslationSchema>

/**
 * `GET /api/guardian/learners/:id/plan` as served (B12): the week plus the guardian's
 * language and, when it is not English, a translation beside every parent-facing text.
 * The English is always there; the translation is labelled model text (TRANSLATED_BY_AI_LABEL).
 */
export const guardianWeekViewSchema = guardianWeekResponseSchema.extend({
  language: languageSchema,
  plan: guardianPlanWithTranslationsSchema.nullable(),
  teacherMessages: z.array(teacherMessageWithTranslationSchema),
})
export type GuardianWeekView = z.infer<typeof guardianWeekViewSchema>

export const supportGivenResponseSchema = z.object({
  planId: uuid,
  doneAt: z.string(),
  alreadyDone: z.boolean(),
})
export type SupportGivenResponse = z.infer<typeof supportGivenResponseSchema>

// ── the vetted resource list (spec 03 §8.1 `resources`; brief B06 §3) ──────────────────────

export const resourceFileEntrySchema = z
  .object({
    title: z.string().trim().min(1).max(200),
    url: z.string().trim().url().max(500).refine((url) => url.startsWith('https://'), 'resource links are https'),
    licence: z.string().trim().min(1).max(100),
    attribution: z.string().trim().min(1).max(200),
    free: z.boolean().default(true),
    skill_tags: z.array(skillTagSchema).min(1).max(20),
    approved: z.boolean().default(true),
  })
  .strict()
export type ResourceFileEntry = z.infer<typeof resourceFileEntrySchema>

/** `pnpm resources:load <file>`: one JSON file, outside the repo (`RESOURCE_LIST_PATH`). */
export const resourceFileSchema = z.object({ resources: z.array(resourceFileEntrySchema).min(1).max(500) }).strict()
export type ResourceFile = z.infer<typeof resourceFileSchema>
