import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { evidencePayload, type BrainResponse } from '@guardian-book/shared'
import { SEED_PEOPLE } from '../../src/db/seed-data.js'
import { appendEvent } from '../../src/evidence/append.js'
import { freshContext, signInAs, type TestContext } from './db.js'

/** P0-07 through the API: the acceptance rows, replay, labels, and "change the ID". */

let ctx: TestContext

beforeAll(async () => {
  ctx = await freshContext()
})
afterAll(async () => {
  await ctx.close()
})

const DAY = 24 * 60 * 60 * 1000
const day1 = new Date('2026-11-01T09:00:00Z')
const F = 'algebra.factorising'
const lerato = SEED_PEOPLE.lerato.id

async function assisted(correct: boolean, at: Date) {
  return appendEvent(ctx.db, { learnerId: lerato, kind: 'assessed', skillTag: F, basis: 'model_high', payload: evidencePayload({ correct }), occurredAt: at })
}

describe('GET /api/me/brain', () => {
  it('starts empty: `new` chips for the content pack’s tags, no timeline', async () => {
    const learner = await signInAs(ctx.app, 'lerato')
    const res = await request(ctx.app).get('/api/me/brain').set('Cookie', learner)
    expect(res.status).toBe(200)
    const body = res.body as BrainResponse
    expect(body.learner).toEqual({ id: lerato, nickname: 'Lerato' })
    expect(body.timeline).toEqual([])
    expect(body.skills.map((s) => s.tag)).toEqual(['discriminant', 'factorise-trinomial', 'nature-of-roots', 'solve-quadratic-by-factors'])
    expect(body.skills.every((s) => s.state === 'new' && s.evidenceCount === 0)).toBe(true)
    expect(body.skills.map((s) => s.label)).toEqual(['Discriminant', 'Factorise trinomial', 'Nature of roots', 'Solve quadratic by factors'])
  })

  it('assisted correct ×3 → practising, never secure; then independent (day 1) and retained (day 3) → secure with three marks', async () => {
    const learner = await signInAs(ctx.app, 'lerato')
    await assisted(true, day1)
    await assisted(true, new Date(day1.getTime() + DAY))
    await assisted(true, new Date(day1.getTime() + 2 * DAY))
    const practising = (await request(ctx.app).get('/api/me/brain').set('Cookie', learner)).body as BrainResponse
    const chip = practising.skills.find((s) => s.tag === F)
    expect(chip).toMatchObject({ label: 'Factorising into two brackets', state: 'practising', assisted: { correct: 3, total: 3 }, independent: { correct: 0, total: 0 }, retained: { correct: 0, total: 0 }, evidenceCount: 3 })
    expect(chip?.evidenceEventIds).toHaveLength(3)

    await appendEvent(ctx.db, { learnerId: lerato, kind: 'independent_check_completed', skillTag: F, basis: 'model_high', payload: evidencePayload({ correct: true, sure: true }), occurredAt: new Date(day1.getTime() + DAY + 3600_000) })
    await appendEvent(ctx.db, { learnerId: lerato, kind: 'retention_check_completed', skillTag: F, basis: 'teacher_confirmed', payload: evidencePayload({ correct: true }), occurredAt: new Date(day1.getTime() + 3 * DAY) })
    await appendEvent(ctx.db, { learnerId: lerato, kind: 'support_given', basis: 'none', occurredAt: new Date(day1.getTime() + 3 * DAY + 1) })

    const secure = (await request(ctx.app).get('/api/me/brain').set('Cookie', learner)).body as BrainResponse
    const after = secure.skills.find((s) => s.tag === F)
    expect(after).toMatchObject({
      state: 'secure',
      assisted: { correct: 3, total: 3 },
      independent: { correct: 1, total: 1 },
      retained: { correct: 1, total: 1 },
      sure: { correct: 1, total: 1 },
      evidenceCount: 5,
      lastCheckedAt: new Date(day1.getTime() + 3 * DAY).toISOString(),
    })
    // Newest first: day 3 (+1 ms), day 3, day 2, day 1 (+1 h), day 1, day 0.
    expect(secure.timeline.map((e) => e.kind)).toEqual(['support_given', 'retention_check_completed', 'assessed', 'independent_check_completed', 'assessed', 'assessed'])
    expect(secure.timeline.map((e) => e.counted)).toEqual([false, true, true, true, true, true])
    expect(secure.timeline[1]?.skillLabel).toBe('Factorising into two brackets')
    expect(JSON.stringify(secure.skills.map((s) => s.label))).not.toContain('algebra.')
  })

  it('replay: reading twice rebuilds the same state', async () => {
    const learner = await signInAs(ctx.app, 'lerato')
    const first = await request(ctx.app).get('/api/me/brain').set('Cookie', learner)
    const second = await request(ctx.app).get('/api/me/brain').set('Cookie', learner)
    expect(second.body).toEqual(first.body)
  })

  it('an uncertain assessment (basis none) never moves state', async () => {
    const learner = await signInAs(ctx.app, 'lerato')
    const before = (await request(ctx.app).get('/api/me/brain').set('Cookie', learner)).body as BrainResponse
    await appendEvent(ctx.db, { learnerId: lerato, kind: 'assessed', skillTag: 'discriminant', basis: 'none', payload: evidencePayload({ correct: true }) })
    const after = (await request(ctx.app).get('/api/me/brain').set('Cookie', learner)).body as BrainResponse
    expect(after.skills).toEqual(before.skills)
    expect(after.timeline).toHaveLength(before.timeline.length + 1)
    expect(after.timeline[0]?.counted).toBe(false)
  })
})

describe('GET /api/learners/:id/brain (change the ID)', () => {
  it('learner A → learner B → 404; guardian → 404; other class, other school → 404; own and class teacher → 200', async () => {
    const path = `/api/learners/${lerato}/brain`
    expect((await request(ctx.app).get(path).set('Cookie', await signInAs(ctx.app, 'thabo'))).status).toBe(404)
    expect((await request(ctx.app).get(path).set('Cookie', await signInAs(ctx.app, 'mmaLerato'))).status).toBe(404)
    expect((await request(ctx.app).get(path).set('Cookie', await signInAs(ctx.app, 'mrNaidoo'))).status).toBe(404)
    expect((await request(ctx.app).get(path).set('Cookie', await signInAs(ctx.app, 'msBotha'))).status).toBe(404)
    expect((await request(ctx.app).get(path)).status).toBe(401)
    expect((await request(ctx.app).get('/api/me/brain').set('Cookie', await signInAs(ctx.app, 'mmaLerato'))).status).toBe(404)

    const own = await request(ctx.app).get(path).set('Cookie', await signInAs(ctx.app, 'lerato'))
    expect(own.status).toBe(200)
    const teacher = await request(ctx.app).get(path).set('Cookie', await signInAs(ctx.app, 'msDlamini'))
    expect(teacher.status).toBe(200)
    expect((teacher.body as BrainResponse).skills.find((s) => s.tag === F)?.label).toBe('Factorising trinomials')
    expect((own.body as BrainResponse).skills.find((s) => s.tag === F)?.label).toBe('Factorising into two brackets')
    expect((await request(ctx.app).get(`/api/learners/${SEED_PEOPLE.msDlamini.id}/brain`).set('Cookie', await signInAs(ctx.app, 'msDlamini'))).status).toBe(404)
  })
})
