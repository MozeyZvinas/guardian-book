import { eq } from 'drizzle-orm'
import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { evidencePayload, type BrainResponse } from '@guardian-book/shared'
import { items } from '../../src/db/schema.js'
import { SEED_PEOPLE } from '../../src/db/seed-data.js'
import { appendEvent } from '../../src/evidence/append.js'
import { okResponse } from '../../src/gateway/testing.js'
import { TEST_ORIGIN, freshContext, signInAs, type TestContext } from './db.js'
import { goodWorkCheck, scriptedModel, type ScriptedModel } from './practiceGateway.js'

/**
 * B04's homework check moves B05's Brain (D37): an assessed attempt that loses the
 * factorising step makes that skill `practising`; a correct independent check and a
 * correct retention check on a later day make it `secure`.
 */

let ctx: TestContext
let model: ScriptedModel

beforeAll(async () => {
  model = scriptedModel()
  ctx = await freshContext({ gateway: model.gateway })
})
afterAll(async () => {
  await ctx.jobs.waitAll()
  await ctx.close()
})

const DAY = 24 * 60 * 60 * 1000
const F = 'factorise-trinomial'
const S = 'solve-quadratic-by-factors'
const lerato = SEED_PEOPLE.lerato.id

async function brainFor(cookie: string): Promise<BrainResponse> {
  const res = await request(ctx.app).get('/api/me/brain').set('Cookie', cookie)
  expect(res.status).toBe(200)
  return res.body as BrainResponse
}

describe('assessed → the Brain', () => {
  it('a lost factorising step (S2) makes factorise-trinomial practising; the earned solving steps count as correct', async () => {
    const cookie = await signInAs(ctx.app, 'lerato')
    const [item] = await ctx.db.select({ id: items.id }).from(items).where(eq(items.slug, 'alg-12-factorise-trinomial')).limit(1)
    if (!item) throw new Error('seed item missing')

    // Step 2 ("correct factors", tag factorise-trinomial) lost; steps 1, 3 and 4 earned.
    model.queue.push((req) => {
      const output = goodWorkCheck(req)
      const steps = output.steps.map((step) =>
        step.step_id === 'S2'
          ? { ...step, awarded: 0, evidence: 'the second line has the wrong signs in the brackets', feedback: 'Not yet: check the signs.', misconception_tag: 'sign_error', hint: 'Two numbers multiply to the constant and add to the middle coefficient: which signs make that work?' }
          : step,
      )
      return okResponse({ ...output, steps, total: steps.reduce((acc, step) => acc + step.awarded, 0) })
    })
    const created = await request(ctx.app)
      .post('/api/attempts')
      .set('Origin', TEST_ORIGIN)
      .set('Cookie', cookie)
      .send({ itemId: item.id, answerText: 'x² − 5x + 6 = 0\n(x + 2)(x + 3) = 0\nx = −2 or x = −3', idempotencyKey: 'brain-1' })
    expect(created.status).toBe(201)
    const attemptId: string = created.body.attemptId
    const started = await request(ctx.app).post(`/api/attempts/${attemptId}/assess`).set('Origin', TEST_ORIGIN).set('Cookie', cookie)
    expect(started.status).toBe(202)
    await ctx.jobs.wait(`assess:${attemptId}`)

    const view = await request(ctx.app).get(`/api/attempts/${attemptId}`).set('Cookie', cookie)
    expect(view.body.assessment).toMatchObject({ status: 'proposed', total: 3 })

    const [event] = (
      await ctx.db.execute<{ skill_tag: string | null; basis: string; payload: Record<string, unknown> }>(
        `select skill_tag, basis, payload from learning_events where attempt_id = '${attemptId}' and kind = 'assessed'`,
      )
    ).rows
    expect(event).toMatchObject({ skill_tag: F, basis: 'model_high' })
    // Step 1 (also factorise-trinomial) was earned, so the tag is in both lists; the reducer counts it as lost.
    expect(event?.payload).toMatchObject({ skills_correct: [F, S], skills_lost: [F], lost_skills: [F], mode: 'assisted', status: 'proposed', total: 3, max_marks: 4 })

    const brain = await brainFor(cookie)
    expect(brain.skills.find((s) => s.tag === F)).toMatchObject({ state: 'practising', assisted: { correct: 0, total: 1 }, independent: { correct: 0, total: 0 }, retained: { correct: 0, total: 0 }, evidenceCount: 1 })
    expect(brain.skills.find((s) => s.tag === S)).toMatchObject({ state: 'practising', assisted: { correct: 1, total: 1 }, evidenceCount: 1 })
    expect(brain.timeline[0]).toMatchObject({ kind: 'assessed', counted: true, skillLabel: 'Factorise trinomial' })
  })

  it('then a correct independent check and a correct retention check on a later day make it secure', async () => {
    const cookie = await signInAs(ctx.app, 'lerato')
    const now = Date.now()
    await appendEvent(ctx.db, { learnerId: lerato, kind: 'independent_check_completed', skillTag: F, basis: 'model_high', payload: evidencePayload({ correct: true }), occurredAt: new Date(now + DAY) })
    const independent = await brainFor(cookie)
    expect(independent.skills.find((s) => s.tag === F)).toMatchObject({ state: 'practising', independent: { correct: 1, total: 1 }, retained: { correct: 0, total: 0 } })

    await appendEvent(ctx.db, { learnerId: lerato, kind: 'retention_check_completed', skillTag: F, basis: 'teacher_confirmed', payload: evidencePayload({ correct: true }), occurredAt: new Date(now + 3 * DAY) })
    const secure = await brainFor(cookie)
    expect(secure.skills.find((s) => s.tag === F)).toMatchObject({ state: 'secure', assisted: { correct: 0, total: 1 }, independent: { correct: 1, total: 1 }, retained: { correct: 1, total: 1 }, evidenceCount: 3 })
  })
})
