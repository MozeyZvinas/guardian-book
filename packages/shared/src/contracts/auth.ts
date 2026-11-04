import { z } from 'zod'

/**
 * Accounts (spec 02 P0-01; spec 03 §2, §8.1). Every account holder in this build is an
 * adult (D19): sign-up requires the attestation "I am 18 or older".
 */
export const ROLES = ['learner', 'guardian', 'teacher', 'admin'] as const
export const roleSchema = z.enum(ROLES)
export type Role = z.infer<typeof roleSchema>

/** Roles a person may choose at sign-up. `admin` is never self-assigned. */
export const SIGN_UP_ROLES = ['learner', 'guardian', 'teacher'] as const
export const signUpRoleSchema = z.enum(SIGN_UP_ROLES)
export type SignUpRole = z.infer<typeof signUpRoleSchema>

export const AGE_ATTESTATION_LABEL = 'I am 18 or older'

export const MIN_PASSWORD_LENGTH = 8
export const MAX_PASSWORD_LENGTH = 128
export const MAX_NICKNAME_LENGTH = 40

export const nicknameSchema = z.string().trim().min(1).max(MAX_NICKNAME_LENGTH)
export const emailSchema = z.string().trim().toLowerCase().email().max(254)
export const passwordSchema = z.string().min(MIN_PASSWORD_LENGTH).max(MAX_PASSWORD_LENGTH)

export const signUpBodySchema = z
  .object({
    nickname: nicknameSchema,
    email: emailSchema,
    password: passwordSchema,
    role: signUpRoleSchema,
    /** Must be literally `true`; anything else is refused (D19). */
    ageAttested: z.literal(true, { error: `You must confirm "${AGE_ATTESTATION_LABEL}".` }),
    /**
     * B09: a sign-up from `/try`. The server, never the client, decides which class that
     * means (`PUBLIC_TRY_CLASS_CODE`); learners only; ignored when unconfigured.
     */
    tryClass: z.literal(true).optional(),
  })
  .strict()
export type SignUpBody = z.infer<typeof signUpBodySchema>

export const signInBodySchema = z
  .object({
    email: emailSchema,
    password: z.string().min(1).max(MAX_PASSWORD_LENGTH),
  })
  .strict()
export type SignInBody = z.infer<typeof signInBodySchema>

export const profileSchema = z.object({
  userId: z.string().uuid(),
  role: roleSchema,
  nickname: z.string(),
  schoolId: z.string().uuid().nullable(),
  ageAttestedAt: z.string(),
})
export type Profile = z.infer<typeof profileSchema>

export const signUpResponseSchema = z.object({
  user: z.object({ id: z.string().uuid() }),
  profile: profileSchema,
  /** B09: the class a `/try` sign-up joined, or null (not requested, not a learner, or try-it unconfigured). */
  joinedClass: z.object({ id: z.string().uuid(), name: z.string() }).nullable().optional(),
})
export type SignUpResponse = z.infer<typeof signUpResponseSchema>

/** B09: `GET /api/try`, public. The class name only; never the code. */
export const tryStatusResponseSchema = z.object({
  available: z.boolean(),
  className: z.string().nullable(),
})
export type TryStatusResponse = z.infer<typeof tryStatusResponseSchema>

/** The API's error envelope (spec 03 §5). */
export const apiErrorSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    requestId: z.string().optional(),
    issues: z.array(z.object({ path: z.string(), message: z.string() })).optional(),
  }),
})
export type ApiError = z.infer<typeof apiErrorSchema>
