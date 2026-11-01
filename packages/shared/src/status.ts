import { z } from 'zod'

/**
 * Assessment status (spec 03). The model's proposal is stored once as `proposed`; the
 * verifier downgrades anything it cannot trust to `uncertain` (which routes to the
 * teacher); a run that produced nothing usable is `failed`. The teacher's review is a
 * separate record and never overwrites this value: the teacher is the marker of record.
 */
export const ASSESSMENT_STATUSES = ['proposed', 'uncertain', 'failed'] as const

export const assessmentStatusSchema = z.enum(ASSESSMENT_STATUSES)

export type AssessmentStatus = z.infer<typeof assessmentStatusSchema>

export function isAssessmentStatus(value: unknown): value is AssessmentStatus {
  return assessmentStatusSchema.safeParse(value).success
}
