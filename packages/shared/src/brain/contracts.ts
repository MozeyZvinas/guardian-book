import { z } from 'zod'
import { eventBasisSchema, learningEventKindSchema } from '../contracts/events.js'
import { profileCardsSchema } from '../contracts/model/profileCards.js'
import { SKILL_STATES } from './reduce.js'

/**
 * Wire shapes for the profile, Today and the Brain (spec 03 §8.3, §9.3; brief B05). The web
 * client parses every response with these before it touches a component (spec 06 §2).
 */

export const MAX_PROFILE_ANSWER_LENGTH = 500

// ── profile (P0-02) ──────────────────────────────────────────────────────────────────────

const answer = z.string().trim().max(MAX_PROFILE_ANSWER_LENGTH)

/** `POST /api/me/profile`: the learner's four answers. A blank answer is allowed (skip). */
export const setProfileBodySchema = z
  .object({
    dream: answer,
    subjects: answer,
    hardestSubject: answer,
    howILearn: answer,
  })
  .strict()
export type SetProfileBody = z.infer<typeof setProfileBodySchema>

/**
 * Where the cards came from this time: the model (verified), the learner's own words when
 * the model is not configured (PROTOTYPE), or nothing usable (uncertain after re-asks, or
 * the provider failed) in which case the cards are empty and the learner fills them in.
 */
export const PROFILE_SOURCES = ['model', 'prototype', 'uncertain', 'failed'] as const
export const profileSourceSchema = z.enum(PROFILE_SOURCES)
export type ProfileSource = z.infer<typeof profileSourceSchema>

export const setProfileResponseSchema = z.object({
  cards: profileCardsSchema,
  source: profileSourceSchema,
  modelRunId: z.string().uuid().nullable(),
})
export type SetProfileResponse = z.infer<typeof setProfileResponseSchema>

/** `PATCH /api/me/profile/cards`: any subset of the four cards; no model call. */
export const patchCardsBodySchema = profileCardsSchema.partial().strict()
export type PatchCardsBody = z.infer<typeof patchCardsBodySchema>

/** What the stored cards rest on: a verified model run, or the learner's own typing. */
export const CARDS_ORIGINS = ['model', 'student', 'none'] as const
export const cardsOriginSchema = z.enum(CARDS_ORIGINS)
export type CardsOrigin = z.infer<typeof cardsOriginSchema>

/** `GET /api/me/profile`: the learner's own cards. The raw text is never served. */
export const profileResponseSchema = z.object({
  cards: profileCardsSchema.nullable(),
  origin: cardsOriginSchema,
})
export type ProfileResponse = z.infer<typeof profileResponseSchema>

/** `GET /api/learners/:id/cards`: the fields this role may read (spec 03 §8.2). */
export const learnerCardsResponseSchema = z.object({
  learner: z.object({ id: z.string().uuid(), nickname: z.string() }),
  cards: profileCardsSchema.partial().nullable(),
})
export type LearnerCardsResponse = z.infer<typeof learnerCardsResponseSchema>

// ── the Brain (P0-07) ────────────────────────────────────────────────────────────────────

export const skillStateSchema = z.enum(SKILL_STATES)

export const skillMarkSchema = z.object({
  correct: z.number().int().nonnegative(),
  total: z.number().int().nonnegative(),
})
export type SkillMark = z.infer<typeof skillMarkSchema>

export const brainSkillSchema = z.object({
  tag: z.string(),
  /** Wording for the caller's role; never the raw tag. */
  label: z.string(),
  state: skillStateSchema,
  assisted: skillMarkSchema,
  independent: skillMarkSchema,
  retained: skillMarkSchema,
  sure: skillMarkSchema,
  evidenceCount: z.number().int().nonnegative(),
  lastCheckedAt: z.string().nullable(),
  evidenceEventIds: z.array(z.string().uuid()),
})
export type BrainSkill = z.infer<typeof brainSkillSchema>

export const timelineEventSchema = z.object({
  id: z.string().uuid(),
  kind: learningEventKindSchema,
  basis: eventBasisSchema,
  skillTag: z.string().nullable(),
  skillLabel: z.string().nullable(),
  attemptId: z.string().uuid().nullable(),
  itemId: z.string().uuid().nullable(),
  occurredAt: z.string(),
  /** True when this event's outcomes were counted into a skill's evidence. */
  counted: z.boolean(),
})
export type TimelineEvent = z.infer<typeof timelineEventSchema>

export const brainResponseSchema = z.object({
  learner: z.object({ id: z.string().uuid(), nickname: z.string() }),
  skills: z.array(brainSkillSchema),
  /** Newest first. */
  timeline: z.array(timelineEventSchema),
})
export type BrainResponse = z.infer<typeof brainResponseSchema>

// ── Today and check-ins ──────────────────────────────────────────────────────────────────

export const checkInSchema = z.object({
  kind: z.enum(['intervention', 'retention']),
  skillTag: z.string(),
  label: z.string(),
  /** `YYYY-MM-DD`. */
  dueOn: z.string(),
  overdueDays: z.number().int(),
  interventionId: z.string().uuid().nullable(),
  /** The teacher's one-line action (learners read the action and the date only). */
  action: z.string().nullable(),
  sinceEventId: z.string().uuid().nullable(),
})
export type CheckIn = z.infer<typeof checkInSchema>

export const checksResponseSchema = z.object({
  today: z.string(),
  checks: z.array(checkInSchema),
})
export type ChecksResponse = z.infer<typeof checksResponseSchema>

export const RECENT_INPUT_STATUSES = ['reading', 'feedback_ready', 'teacher_checking', 'fixed', 'failed', 'read', 'asked'] as const
export const recentInputStatusSchema = z.enum(RECENT_INPUT_STATUSES)
export type RecentInputStatus = z.infer<typeof recentInputStatusSchema>

export const recentInputSchema = z.object({
  id: z.string().uuid(),
  kind: z.enum(['work', 'notice', 'question']),
  status: recentInputStatusSchema,
  attemptId: z.string().uuid().nullable(),
  createdAt: z.string(),
})
export type RecentInput = z.infer<typeof recentInputSchema>

export const todayResponseSchema = z.object({
  nickname: z.string(),
  today: z.string(),
  exam: z
    .object({
      id: z.string().uuid(),
      title: z.string(),
      subject: z.string().nullable(),
      paper: z.string().nullable(),
      onDate: z.string(),
      daysAway: z.number().int(),
    })
    .nullable(),
  tonight: z.discriminatedUnion('kind', [
    z.object({
      kind: z.literal('plan'),
      planId: z.string().uuid(),
      step: z.string(),
      hint: z.string(),
      why: z.string(),
      /** The attempt with the lost step this plan starts from ("Start" → fix it, B06). */
      attemptId: z.string().uuid().nullable().default(null),
    }),
    z.object({ kind: z.literal('none') }),
  ]),
  checkIns: z.array(checkInSchema),
  recent: z.array(recentInputSchema),
  guardianLinked: z.boolean(),
  hasCards: z.boolean(),
})
export type TodayResponse = z.infer<typeof todayResponseSchema>
