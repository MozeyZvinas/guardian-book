import { eq } from 'drizzle-orm'
import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { dueRetentionChecks } from '@guardian-book/shared'
import { items, notes } from '../../src/db/schema.js'
import { SEED_PEOPLE } from '../../src/db/seed-data.js'
import { loadBrainEvents } from '../../src/evidence/projection.js'
import { TEST_ORIGIN, freshContext, signInAs, type TestContext } from './db.js'
import { scriptedModel, type ScriptedModel } from './practiceGateway.js'

/**
 * The loop closes (brief B06 acceptance): a lost step issues a Help Plan the same day, with
 * three views and every statement cited; the learner fixes the step (counted once), checks
 * it alone (no hint before submission) and a follow-up check falls due two days later; the
 * guardian reads the gap and one action, never the work, and "We did it" writes one event.
 */

let ctx: TestContext
let model: ScriptedModel
const clock = { now: new Date() }
const lerato = SEED_PEOPLE.lerato.id
const DAY = 24 * 60 * 60 * 1000

beforeAll(async () => {
  model = scriptedModel()
  ctx = await freshContext({ gateway: model.gateway, now: () => clock.now })
})
afterAll(async () => {
  await ctx.jobs.waitAll()
  await ctx.close()
})

const origin = (req: request.Test) => req.set('Origin', TEST_ORIGIN)
const app = () => ctx.app
const sql = <T extends Record<string, unknown>>(text: string) => ctx.db.execute<T>(text).then((r) => r.rows)

async function itemIdOf(slug: string): Promise<string> {
  const [row] = await ctx.db.select({ id: items.id }).from(items).where(eq(items.slug, slug)).limit(1)
  if (!row) throw new Error(`seed item ${slug} missing`)
  return row.id
}

describe('fix it → check it alone → the plan → the guardian', () => {
  let attemptId = ''
  let childId = ''
  let checkId = ''

  it('a lost step is assessed and a Help Plan is issued the same day, three views, every statement cited', async () => {
    const cookie = await signInAs(app(), 'lerato')
    const created = await origin(request(app()).post('/api/attempts').set('Cookie', cookie)).send({ itemId: await itemIdOf('alg-12-factorise-trinomial'), answerText: 'x² − 5x + 6 = 0\n(x − 2)(x − 3) = 0', idempotencyKey: 'loop-1' })
    expect(created.status).toBe(201)
    attemptId = created.body.attemptId
    await origin(request(app()).post(`/api/attempts/${attemptId}/assess`).set('Cookie', cookie))
    await ctx.jobs.wait(`assess:${attemptId}`)
    await ctx.jobs.wait(`plan:${lerato}`)

    const plans = await sql<{ id: string; status: string; provenance: string; gap_skill_tag: string; agent_trace: Array<{ tool: string; status: string }>; learner_view: { tonight_step: { evidence_ids: string[] } }; guardian_view: { gap: { text: string } }; teacher_view: object; evidence_event_ids: string[] }>(
      `select id, status, provenance, gap_skill_tag, agent_trace, learner_view, guardian_view, teacher_view, evidence_event_ids from help_plans where learner_id = '${lerato}'`,
    )
    expect(plans).toHaveLength(1)
    const plan = plans[0]!
    expect(plan).toMatchObject({ status: 'issued', provenance: 'model_generated', gap_skill_tag: 'solve-quadratic-by-factors' })
    expect(plan.agent_trace.map((s) => [s.tool, s.status])).toEqual([
      ['getEvidence', 'done'],
      ['getResources', 'done'],
      ['writePlan', 'plan'],
    ])
    // Aliases became real event IDs of this learner.
    const eventIds = new Set((await loadBrainEvents(ctx.db, lerato)).map((e) => e.id))
    expect(plan.evidence_event_ids.length).toBeGreaterThan(0)
    for (const id of [...plan.evidence_event_ids, ...plan.learner_view.tonight_step.evidence_ids]) expect(eventIds.has(id)).toBe(true)
    expect(plan.guardian_view.gap.text.length).toBeGreaterThan(0)
    const runs = await sql<{ status: string }>(`select status from model_runs where purpose = 'plan' and subject_id = '${plan.id}'`)
    expect(runs.map((r) => r.status)).toEqual(['accepted', 'accepted', 'accepted'])
    expect((await sql(`select 1 from learning_events where learner_id = '${lerato}' and kind = 'plan_issued'`)).length).toBe(1)

    const mine = await request(app()).get('/api/me/plan').set('Cookie', cookie)
    expect(mine.body.plan).toMatchObject({ gapSkillTag: 'solve-quadratic-by-factors', source: 'model', attemptId })
    const today = await request(app()).get('/api/me/today').set('Cookie', cookie)
    expect(today.body.tonight).toMatchObject({ kind: 'plan', attemptId })
  })

  it('the first retry that passes is "fixed on your own"; a second retry never is', async () => {
    const cookie = await signInAs(app(), 'lerato')
    const fix = await origin(request(app()).post(`/api/attempts/${attemptId}/fix`).set('Cookie', cookie)).send({ answerText: 'x − 2 = 0 or x − 3 = 0\nx = 2 or x = 3' })
    expect(fix.status).toBe(202)
    expect(fix.body).toMatchObject({ parentAttemptId: attemptId, retryNo: 1, status: 'assessing' })
    childId = fix.body.attemptId
    await ctx.jobs.wait(`assess:${childId}`)
    const view = await request(app()).get(`/api/attempts/${childId}`).set('Cookie', cookie)
    expect(view.body.attempt).toMatchObject({ parentAttemptId: attemptId, mode: 'assisted', status: 'proposed' })
    expect(view.body.assessment.steps.map((s: { stepNo: number }) => s.stepNo)).toEqual([4]) // marked on the lost step only
    expect(view.body.fix).toEqual({ parentAttemptId: attemptId, retryNo: 1, targetStepNos: [4], fixedIndependently: true })
    expect((await sql(`select 1 from learning_events where learner_id = '${lerato}' and kind = 'fixed_independently'`)).length).toBe(1)

    const again = await origin(request(app()).post(`/api/attempts/${attemptId}/fix`).set('Cookie', cookie)).send({ answerText: 'x = 2 or x = 3' })
    expect(again.body.retryNo).toBe(2)
    await ctx.jobs.wait(`assess:${again.body.attemptId}`)
    const second = await request(app()).get(`/api/attempts/${again.body.attemptId}`).set('Cookie', cookie)
    expect(second.body.fix.fixedIndependently).toBe(false)
    expect((await sql(`select 1 from learning_events where learner_id = '${lerato}' and kind = 'fixed_independently'`)).length).toBe(1)

    // Another learner cannot fix it; a step-less attempt has nothing to fix.
    expect((await origin(request(app()).post(`/api/attempts/${attemptId}/fix`).set('Cookie', await signInAs(app(), 'thabo'))).send({ answerText: 'x' })).status).toBe(404)
    expect((await origin(request(app()).post(`/api/attempts/${childId}/fix`).set('Cookie', cookie)).send({ answerText: 'x' })).status).toBe(409)
  })

  it('check it alone: a matched, unattempted item; no hint before submission; the check and the follow-up are recorded', async () => {
    const cookie = await signInAs(app(), 'lerato')
    const match = await request(app()).get(`/api/me/check-alone?skill=solve-quadratic-by-factors&mode=independent&from=${attemptId}`).set('Cookie', cookie)
    expect(match.status).toBe(200)
    expect(match.body.item).toMatchObject({ slug: 'alg-12-factorise-trinomial-2', matchingSteps: 2 })
    expect(match.body.why).toContain('step 4')

    const created = await origin(request(app()).post('/api/attempts').set('Cookie', cookie)).send({ itemId: match.body.item.id, answerText: 'x² + x − 12 = 0\n(x + 4)(x − 3) = 0\nx = −4 or x = 3', idempotencyKey: 'loop-check', mode: 'independent' })
    checkId = created.body.attemptId
    const before = await request(app()).get(`/api/attempts/${checkId}`).set('Cookie', cookie)
    expect(before.body).toMatchObject({ hintsVisible: false, assessment: null })
    expect(JSON.stringify(before.body)).not.toContain('hint":"')

    await origin(request(app()).post(`/api/attempts/${checkId}/assess`).set('Cookie', cookie))
    await ctx.jobs.wait(`assess:${checkId}`)
    const after = await request(app()).get(`/api/attempts/${checkId}`).set('Cookie', cookie)
    expect(after.body.attempt).toMatchObject({ mode: 'independent', status: 'proposed' })
    expect(after.body.assessment.steps.every((s: { awarded: number; available: number }) => s.awarded >= s.available)).toBe(true)
    const done = await sql<{ payload: { mode: string; passed: boolean } }>(`select payload from learning_events where attempt_id = '${checkId}' and kind = 'independent_check_completed'`)
    expect(done[0]?.payload).toMatchObject({ mode: 'independent', passed: true })

    // No follow-up today; in two days it is due (RETENTION_CHECK_DAYS, default 2).
    expect((await request(app()).get('/api/me/checks').set('Cookie', cookie)).body.checks).toEqual([])
    clock.now = new Date(Date.now() + 2 * DAY + 60_000)
    try {
      const due = await request(app()).get('/api/me/checks').set('Cookie', cookie)
      // Both skills on the follow-up item were done alone, so both fall due.
      expect(due.body.checks.map((c: { kind: string; skillTag: string }) => [c.kind, c.skillTag])).toEqual([
        ['retention', 'factorise-trinomial'],
        ['retention', 'solve-quadratic-by-factors'],
      ])
      expect(dueRetentionChecks(await loadBrainEvents(ctx.db, lerato), clock.now).map((d) => d.skillTag)).toEqual(['factorise-trinomial', 'solve-quadratic-by-factors'])
      const retention = await request(app()).get('/api/me/check-alone?skill=solve-quadratic-by-factors&mode=retention').set('Cookie', cookie)
      expect(retention.body.item).toBeNull() // both matching items are attempted now: the teacher adds one
      expect(retention.body.why).toContain('Two days ago')
    } finally {
      clock.now = new Date()
    }
  })

  it('the guardian reads the gap and one action, never the work; teacher messages only for them; We did it once', async () => {
    const guardian = await signInAs(app(), 'mmaLerato')
    const week = await request(app()).get(`/api/guardian/learners/${lerato}/plan`).set('Cookie', guardian)
    expect(week.status).toBe(200)
    expect(week.body.learner).toEqual({ id: lerato, nickname: 'Lerato' })
    expect(week.body.plan).toMatchObject({ gapSkillTag: 'solve-quadratic-by-factors', source: 'model', doneAt: null })
    expect(week.body.plan.gap.length).toBeGreaterThan(0)
    expect(week.body.plan.action).toContain('Ask them')
    expect(week.body.effort).toMatchObject({ pieces: 4, days: 1 })
    expect(week.body.celebrate).toBeTruthy()
    const text = JSON.stringify(week.body)
    for (const leak of ['x² − 5x', 'x − 2 = 0', '(x + 4)', 'answerText', 'imageKey', 'hasImage', 'awarded', 'attemptId']) expect(text).not.toContain(leak)

    // Notes B07 will write: only a sent, guardian-audience note addressed to this guardian appears, labelled.
    const base = { teacherId: SEED_PEOPLE.msDlamini.id, learnerId: lerato, guardianId: SEED_PEOPLE.mmaLerato.id, provenance: 'teacher_verified' as const }
    await ctx.db.insert(notes).values([
      { ...base, draftText: 'Guardian note (approved draft).', finalText: 'One step slipped this week. Ten minutes at home will help.', status: 'sent', origin: 'teacher_approved', audience: 'guardian', approvedAt: new Date(), sentAt: new Date() },
      { ...base, draftText: 'Learner-audience note.', status: 'sent', origin: 'teacher_added', audience: 'learner', approvedAt: new Date(), sentAt: new Date() },
      { ...base, draftText: 'Teacher-only note.', status: 'sent', origin: 'teacher_added', audience: 'teacher_only', approvedAt: new Date(), sentAt: new Date() },
      { ...base, draftText: 'A draft for the guardian.', status: 'draft', origin: 'ai_suggested', audience: 'guardian' },
    ])
    const withNotes = await request(app()).get(`/api/guardian/learners/${lerato}/plan`).set('Cookie', guardian)
    expect(withNotes.body.teacherMessages).toEqual([{ id: expect.any(String), kind: 'note', label: 'Teacher-reviewed', text: 'One step slipped this week. Ten minutes at home will help.', at: expect.any(String), translation: null }])
    expect(JSON.stringify(withNotes.body)).not.toContain('Learner-audience')
    expect(JSON.stringify(withNotes.body)).not.toContain('Teacher-only')
    expect(JSON.stringify(withNotes.body)).not.toContain('A draft')

    const first = await origin(request(app()).post(`/api/guardian/learners/${lerato}/plan/done`).set('Cookie', guardian))
    expect(first.status).toBe(201)
    expect(first.body).toMatchObject({ planId: week.body.plan.id, alreadyDone: false })
    const second = await origin(request(app()).post(`/api/guardian/learners/${lerato}/plan/done`).set('Cookie', guardian))
    expect(second.status).toBe(200)
    expect(second.body).toMatchObject({ planId: week.body.plan.id, alreadyDone: true, doneAt: first.body.doneAt })
    expect((await sql(`select 1 from learning_events where learner_id = '${lerato}' and kind = 'support_given'`)).length).toBe(1)
    expect((await request(app()).get(`/api/guardian/learners/${lerato}/plan`).set('Cookie', guardian)).body.plan.doneAt).toBe(first.body.doneAt)

    // Change the ID: an unlinked learner, an attempt, the work itself.
    expect((await request(app()).get(`/api/guardian/learners/${SEED_PEOPLE.thabo.id}/plan`).set('Cookie', guardian)).status).toBe(404)
    expect((await request(app()).get(`/api/attempts/${attemptId}`).set('Cookie', guardian)).status).toBe(404)
    expect((await request(app()).get(`/api/attempts/${childId}/image`).set('Cookie', guardian)).status).toBe(404)
  })
})
