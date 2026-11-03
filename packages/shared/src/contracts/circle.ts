import { z } from 'zod'
import { profileSchema } from './auth.js'

/**
 * The circle (spec 03 §8.1, §8.3; spec 02 P0-01): a learner, their guardian and their
 * teacher, linked by codes the learner and teacher hand out.
 */

/** Unambiguous alphabet: no 0/O, 1/I/L. 30 symbols, 8 characters ≈ 39 bits. */
export const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ2345679'
export const CODE_LENGTH = 8
export const GUARDIAN_CODE_TTL_DAYS = 7

/** Accepts what a person types: spaces, dashes and case are forgiven. */
export function normaliseCode(raw: string): string {
  return raw.toUpperCase().replace(/[^A-Z0-9]/g, '')
}

const codePattern = new RegExp(`^[${CODE_ALPHABET}]{${CODE_LENGTH}}$`)

export const codeSchema = z
  .string()
  .max(32)
  .transform(normaliseCode)
  .pipe(z.string().regex(codePattern, 'That code is not valid.'))

export function isCode(value: string): boolean {
  return codePattern.test(value)
}

export const MAX_CLASS_NAME_LENGTH = 40

export const createClassBodySchema = z
  .object({
    name: z.string().trim().min(1).max(MAX_CLASS_NAME_LENGTH),
    /** Needed only for a teacher's first class; after that the teacher's school applies. */
    schoolId: z.string().uuid().optional(),
  })
  .strict()
export type CreateClassBody = z.infer<typeof createClassBodySchema>

export const classSummarySchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  schoolId: z.string().uuid(),
  learnerCount: z.number().int().nonnegative(),
})
export type ClassSummary = z.infer<typeof classSummarySchema>

export const createClassResponseSchema = z.object({
  class: classSummarySchema,
  /** Shown once, at creation; only its hash is stored. */
  code: z.string(),
})
export type CreateClassResponse = z.infer<typeof createClassResponseSchema>

export const joinClassBodySchema = z.object({ code: codeSchema }).strict()
export type JoinClassBody = z.infer<typeof joinClassBodySchema>

export const joinClassResponseSchema = z.object({
  class: z.object({ id: z.string().uuid(), name: z.string() }),
  alreadyMember: z.boolean(),
})
export type JoinClassResponse = z.infer<typeof joinClassResponseSchema>

export const guardianCodeResponseSchema = z.object({
  code: z.string(),
  expiresAt: z.string(),
})
export type GuardianCodeResponse = z.infer<typeof guardianCodeResponseSchema>

export const linkGuardianBodySchema = z.object({ code: codeSchema }).strict()
export type LinkGuardianBody = z.infer<typeof linkGuardianBodySchema>

export const linkGuardianResponseSchema = z.object({
  learner: z.object({ id: z.string().uuid(), nickname: z.string() }),
  alreadyLinked: z.boolean(),
})
export type LinkGuardianResponse = z.infer<typeof linkGuardianResponseSchema>

export const schoolSummarySchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  kind: z.enum(['fictional', 'pilot', 'live']),
})
export type SchoolSummary = z.infer<typeof schoolSummarySchema>

export const schoolsResponseSchema = z.object({ schools: z.array(schoolSummarySchema) })

/** `GET /api/me` (spec 03 §5, §8.3): profile, role, and the circle as seen from this role. */
export const meResponseSchema = z.object({
  user: z.object({ id: z.string().uuid(), email: z.string() }),
  profile: profileSchema,
  school: z.object({ id: z.string().uuid(), name: z.string() }).nullable(),
  /** Learner: the classes they belong to. */
  memberships: z.array(z.object({ classId: z.string().uuid(), name: z.string() })),
  /** Learner: guardians linked to them (revocable). */
  guardians: z.array(
    z.object({ guardianId: z.string().uuid(), nickname: z.string(), linkedAt: z.string() }),
  ),
  /** Teacher: the classes they teach. */
  classes: z.array(classSummarySchema),
  /** Guardian: the learners linked to them, nicknames only. */
  learners: z.array(z.object({ learnerId: z.string().uuid(), nickname: z.string() })),
})
export type MeResponse = z.infer<typeof meResponseSchema>
