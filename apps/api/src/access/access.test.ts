import { describe, expect, it } from 'vitest'
import type { Db } from '../db/client.js'
import { can, learnerOwns, type Action, type Subject } from './index.js'

// Pure parts of the decision table. The resolver queries are covered by the integration
// harness (test/access.integration.test.ts) against seeded data.
const noDb = null as unknown as Db
const SCHOOL = '019a0000-0000-7000-8000-000000000001'
const OTHER = '019a0000-0000-7000-8000-000000000002'
const ME = '019a0000-0000-7000-8000-000000000101'
const YOU = '019a0000-0000-7000-8000-000000000102'

const learner: Subject = { userId: ME, role: 'learner', schoolId: SCHOOL }
const guardian: Subject = { userId: ME, role: 'guardian', schoolId: null }
const teacher: Subject = { userId: ME, role: 'teacher', schoolId: SCHOOL }

describe('access.can (pure rows)', () => {
  it('denies unknown actions', async () => {
    const unknown = 'budget.spend' as Action
    expect(await can(noDb, learner, unknown, { type: 'item', id: ME })).toBe(false)
    expect(await can(noDb, teacher, unknown, { type: 'item', id: ME })).toBe(false)
  })

  it('lets a learner own only themselves', () => {
    expect(learnerOwns(learner, ME)).toBe(true)
    expect(learnerOwns(learner, YOU)).toBe(false)
    expect(learnerOwns(teacher, ME)).toBe(false)
  })

  it('issues a guardian code and revokes links for the learner alone', async () => {
    expect(await can(noDb, learner, 'guardian_code.issue', { type: 'learner', id: ME })).toBe(true)
    expect(await can(noDb, learner, 'guardian_code.issue', { type: 'learner', id: YOU })).toBe(false)
    expect(await can(noDb, guardian, 'guardian_code.issue', { type: 'learner', id: ME })).toBe(false)
    expect(await can(noDb, learner, 'guardian_link.revoke', { type: 'guardian_link', learnerId: ME, guardianId: YOU })).toBe(true)
    expect(await can(noDb, learner, 'guardian_link.revoke', { type: 'guardian_link', learnerId: YOU, guardianId: ME })).toBe(false)
  })

  it('keeps class creation inside the teacher’s school', async () => {
    expect(await can(noDb, teacher, 'class.create', { type: 'school', id: SCHOOL })).toBe(true)
    expect(await can(noDb, teacher, 'class.create', { type: 'school', id: OTHER })).toBe(false)
    expect(await can(noDb, { ...teacher, schoolId: null }, 'class.create', { type: 'school', id: OTHER })).toBe(true)
    expect(await can(noDb, learner, 'class.create', { type: 'school', id: SCHOOL })).toBe(false)
  })

  it('never lets a guardian read an attempt or guideline', async () => {
    expect(await can(noDb, guardian, 'item.guideline.read', { type: 'item', id: ME })).toBe(false)
    expect(await can(noDb, guardian, 'class.read', { type: 'class', id: ME })).toBe(false)
  })
})
