import { ASSESSMENT_STATUSES, assessmentStatusSchema } from '@guardian-book/shared'
import { describe, expect, it } from 'vitest'

// Proves the API resolves the shared package from source in tests (vitest alias) and
// typecheck (tsconfig paths); the runtime resolves the built dist through "exports".
describe('shared package wiring', () => {
  it('imports the assessment status contract', () => {
    expect(ASSESSMENT_STATUSES).toEqual(['proposed', 'uncertain', 'failed'])
    expect(assessmentStatusSchema.parse('uncertain')).toBe('uncertain')
    expect(assessmentStatusSchema.safeParse('marked').success).toBe(false)
  })
})
