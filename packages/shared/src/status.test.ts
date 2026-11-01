import { describe, expect, it } from 'vitest'
import { ASSESSMENT_STATUSES, assessmentStatusSchema, isAssessmentStatus } from './status.js'

describe('assessmentStatusSchema', () => {
  it('accepts exactly proposed, uncertain and failed', () => {
    expect(ASSESSMENT_STATUSES).toEqual(['proposed', 'uncertain', 'failed'])
    for (const status of ASSESSMENT_STATUSES) {
      expect(assessmentStatusSchema.parse(status)).toBe(status)
    }
  })

  it('rejects anything else, including a teacher-style mark', () => {
    for (const value of ['marked', 'confirmed', 'PROPOSED', '', 1, null, undefined]) {
      expect(assessmentStatusSchema.safeParse(value).success).toBe(false)
      expect(isAssessmentStatus(value)).toBe(false)
    }
  })

  it('narrows unknown values with the type guard', () => {
    const value: unknown = 'uncertain'
    expect(isAssessmentStatus(value)).toBe(true)
  })
})
