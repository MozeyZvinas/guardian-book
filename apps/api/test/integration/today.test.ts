import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { dayOf, evidencePayload, type TodayResponse } from '@guardian-book/shared'
import { assessments, attempts, calendarEvents, helpPlans, inputs, interventions, items } from '../../src/db/schema.js'
import { SEED_CLASSES, SEED_PEOPLE } from '../../src/db/seed-data.js'
import { appendEvent } from '../../src/evidence/append.js'
import { freshContext, signInAs, type TestContext } from './db.js'

/** L1 Today and `GET /api/me/checks` (spec 05 §4.2, §9; spec 03 §9.3). */

let ctx: TestContext

beforeAll(async () => {
  ctx = await freshContext()
})
afterAll(async () => {
  await ctx.close()
})

const DAY = 24 * 60 * 60 * 1000
const lerato = SEED_PEOPLE.lerato.id
const isoDate = (date: Date) => dayOf(date)

describe('GET /api/me/today', () => {
  it('first day: no exam, no plan, no check-in, guardian linked, no cards', async () => {
    const learner = await signInAs(ctx.app, 'lerato')
    const res = await request(ctx.app).get('/api/me/today').set('Cookie', learner)
    expect(res.status).toBe(200)
    expect(res.body).toEqual({
      nickname: 'Lerato',
      today: isoDate(new Date()),
      exam: null,
      tonight: { kind: 'none' },
      checkIns: [],
      recent: [],
      guardianLinked: true,
      hasCards: false,
    })
    const thabo = await request(ctx.app).get('/api/me/today').set('Cookie', await signInAs(ctx.app, 'thabo'))
    expect(thabo.body.guardianLinked).toBe(false)
    expect((await request(ctx.app).get('/api/me/today').set('Cookie', await signInAs(ctx.app, 'msDlamini'))).status).toBe(403)
  })

  it('shows the next confirmed class exam, tonight’s step from the issued plan, and the recent inputs with status', async () => {
    const learner = await signInAs(ctx.app, 'lerato')
    const [item] = await ctx.db.select({ id: items.id, revision: items.revision }).from(items).limit(1)
    if (!item) throw new Error('no seeded item')

    // A notice input (teacher's class notice) that produced two events; only confirmed ones count, soonest first.
    const [noticeInput] = await ctx.db
      .insert(inputs)
      .values({ learnerId: SEED_PEOPLE.msDlamini.id, kind: 'notice', text: 'Term 4 timetable', idempotencyKey: 'n-1', provenance: 'school_provided' })
      .returning({ id: inputs.id })
    if (!noticeInput) throw new Error('no input')
    const in12 = new Date(Date.now() + 12 * DAY)
    const in30 = new Date(Date.now() + 30 * DAY)
    await ctx.db.insert(calendarEvents).values([
      { scopeType: 'class', scopeId: SEED_CLASSES['12A'].id, title: 'Maths P1', subject: 'Mathematics', paper: 'P1', onDate: isoDate(in30), sourceInputId: noticeInput.id, sourceLine: 'Maths P1', confidence: 'high', status: 'confirmed', provenance: 'school_provided' },
      { scopeType: 'class', scopeId: SEED_CLASSES['12A'].id, title: 'Physical Sciences P2', subject: 'Physical Sciences', paper: 'P2', onDate: isoDate(in12), sourceInputId: noticeInput.id, sourceLine: 'Phys P2', confidence: 'high', status: 'confirmed', provenance: 'school_provided' },
      { scopeType: 'class', scopeId: SEED_CLASSES['12A'].id, title: 'Tomorrow (unconfirmed)', subject: null, paper: null, onDate: isoDate(new Date(Date.now() + DAY)), sourceInputId: noticeInput.id, sourceLine: 'x', confidence: 'low', status: 'proposed', provenance: 'school_provided' },
      { scopeType: 'class', scopeId: SEED_CLASSES['11B'].id, title: 'Other class', subject: null, paper: null, onDate: isoDate(new Date(Date.now() + 2 * DAY)), sourceInputId: noticeInput.id, sourceLine: 'x', confidence: 'high', status: 'confirmed', provenance: 'school_provided' },
    ])

    // Lerato's own work: one uncertain assessment, one proposed and then fixed on a retry.
    const [uncertainAttempt] = await ctx.db
      .insert(attempts)
      .values({ learnerId: lerato, itemId: item.id, itemRevision: item.revision, kind: 'typed', answerText: 'working 1', idempotencyKey: 'l-1', provenance: 'student_provided' })
      .returning({ id: attempts.id })
    const [fixedAttempt] = await ctx.db
      .insert(attempts)
      .values({ learnerId: lerato, itemId: item.id, itemRevision: item.revision, kind: 'typed', answerText: 'working 2', idempotencyKey: 'l-2', provenance: 'student_provided' })
      .returning({ id: attempts.id })
    if (!uncertainAttempt || !fixedAttempt) throw new Error('no attempt')
    const assessmentBase = { steps: [], modelId: 'muse-spark-1.3', promptVersion: 'work-check-v1', consistencyCheck: 'skipped' as const, latencyMs: 1, costUsd: '0.001', requestId: 'r', provenance: 'model_generated' as const }
    await ctx.db.insert(assessments).values([
      { ...assessmentBase, attemptId: uncertainAttempt.id, status: 'uncertain', total: null },
      { ...assessmentBase, attemptId: fixedAttempt.id, status: 'proposed', total: 2 },
    ])
    const [retry] = await ctx.db
      .insert(attempts)
      .values({ learnerId: lerato, itemId: item.id, itemRevision: item.revision, kind: 'typed', answerText: 'fixed', idempotencyKey: 'l-3', parentAttemptId: fixedAttempt.id, provenance: 'student_provided' })
      .returning({ id: attempts.id })
    if (!retry) throw new Error('no retry')
    await appendEvent(ctx.db, { learnerId: lerato, kind: 'fixed_independently', attemptId: retry.id, itemId: item.id, skillTag: 'factorise-trinomial', basis: 'model_high', payload: evidencePayload({ correct: true }) })

    const t = Date.now()
    await ctx.db.insert(inputs).values([
      { learnerId: lerato, kind: 'work', text: 'working 1', attemptId: uncertainAttempt.id, idempotencyKey: 'i-1', provenance: 'student_provided', createdAt: new Date(t - 3000) },
      { learnerId: lerato, kind: 'work', text: 'working 2', attemptId: fixedAttempt.id, idempotencyKey: 'i-2', provenance: 'student_provided', createdAt: new Date(t - 2000) },
      { learnerId: lerato, kind: 'question', text: 'why step 2?', idempotencyKey: 'i-3', provenance: 'student_provided', createdAt: new Date(t - 1000) },
      { learnerId: lerato, kind: 'notice', text: 'a notice', idempotencyKey: 'i-4', provenance: 'student_provided', createdAt: new Date(t) },
    ])

    const planEvent = await appendEvent(ctx.db, { learnerId: lerato, kind: 'plan_issued', basis: 'none' })
    await ctx.db.insert(helpPlans).values({
      learnerId: lerato,
      weekStart: isoDate(new Date()),
      gapSkillTag: 'factorise-trinomial',
      learnerView: { tonight_step: { text: 'Redo step 2 of the factorising question.', evidence_ids: [planEvent.id] }, hint: 'Look at the signs.', why_it_matters: { text: 'Bridges need algebra.', evidence_ids: [planEvent.id] } },
      guardianView: {},
      teacherView: {},
      evidenceEventIds: [planEvent.id],
      provenance: 'model_generated',
    })

    const res = await request(ctx.app).get('/api/me/today').set('Cookie', learner)
    const body = res.body as TodayResponse
    expect(body.exam).toEqual({ id: expect.any(String), title: 'Physical Sciences P2', subject: 'Physical Sciences', paper: 'P2', onDate: isoDate(in12), daysAway: 12 })
    expect(body.tonight).toEqual({ kind: 'plan', planId: expect.any(String), step: 'Redo step 2 of the factorising question.', hint: 'Look at the signs.', why: 'Bridges need algebra.', attemptId: null })
    expect(body.recent.map((r) => [r.kind, r.status])).toEqual([
      ['notice', 'reading'],
      ['question', 'asked'],
      ['work', 'fixed'],
    ])
    expect(JSON.stringify(body)).not.toContain('working 1')
    expect(JSON.stringify(body)).not.toContain('why step 2')

    // A classmate's Today shows the class exam but none of Lerato's inputs.
    const thabo = (await request(ctx.app).get('/api/me/today').set('Cookie', await signInAs(ctx.app, 'thabo'))).body as TodayResponse
    expect(thabo.exam?.title).toBe('Physical Sciences P2')
    expect(thabo.recent).toEqual([])
    expect(thabo.tonight).toEqual({ kind: 'none' })
  })

  it('a due retention check and a teacher’s follow-up appear as check-ins on Today and on /api/me/checks', async () => {
    const learner = await signInAs(ctx.app, 'lerato')
    const threeDaysAgo = new Date(Date.now() - 3 * DAY)
    const pass = await appendEvent(ctx.db, { learnerId: lerato, kind: 'independent_check_completed', skillTag: 'algebra.zero_product', basis: 'model_high', payload: evidencePayload({ correct: true }), occurredAt: threeDaysAgo })
    const [intervention] = await ctx.db
      .insert(interventions)
      .values({ learnerId: lerato, classId: SEED_CLASSES['12A'].id, skillTag: 'algebra.factorising', ownerId: SEED_PEOPLE.msDlamini.id, action: 'Redo two factorising questions with me on Thursday.', followUpOn: isoDate(new Date()) })
      .returning({ id: interventions.id })
    // Not yet due, and another learner's: neither shows.
    await ctx.db.insert(interventions).values([
      { learnerId: lerato, classId: SEED_CLASSES['12A'].id, skillTag: 'seq.convergence', ownerId: SEED_PEOPLE.msDlamini.id, action: 'Later.', followUpOn: isoDate(new Date(Date.now() + 5 * DAY)) },
      { learnerId: SEED_PEOPLE.thabo.id, classId: SEED_CLASSES['12A'].id, skillTag: 'seq.convergence', ownerId: SEED_PEOPLE.msDlamini.id, action: "Thabo's.", followUpOn: isoDate(new Date()) },
    ])

    const checks = await request(ctx.app).get('/api/me/checks').set('Cookie', learner)
    expect(checks.status).toBe(200)
    expect(checks.body.today).toBe(isoDate(new Date()))
    expect(checks.body.checks).toEqual([
      { kind: 'retention', skillTag: 'algebra.zero_product', label: 'Solving from the brackets', dueOn: isoDate(new Date(threeDaysAgo.getTime() + 2 * DAY)), overdueDays: 1, interventionId: null, action: null, sinceEventId: pass.id },
      { kind: 'intervention', skillTag: 'algebra.factorising', label: 'Factorising into two brackets', dueOn: isoDate(new Date()), overdueDays: 0, interventionId: intervention?.id, action: 'Redo two factorising questions with me on Thursday.', sinceEventId: null },
    ])

    const today = (await request(ctx.app).get('/api/me/today').set('Cookie', learner)).body as TodayResponse
    expect(today.checkIns).toEqual(checks.body.checks)
    expect(today.tonight.kind).toBe('plan') // both present: the screen puts the check-in first

    // The retention check, once done, drops off; the teacher's stays until closed.
    await appendEvent(ctx.db, { learnerId: lerato, kind: 'retention_check_completed', skillTag: 'algebra.zero_product', basis: 'model_high', payload: evidencePayload({ correct: false }) })
    const after = await request(ctx.app).get('/api/me/checks').set('Cookie', learner)
    expect(after.body.checks.map((c: { kind: string }) => c.kind)).toEqual(['intervention'])
    expect((await request(ctx.app).get('/api/me/checks').set('Cookie', await signInAs(ctx.app, 'mmaLerato'))).status).toBe(403)
  })
})
