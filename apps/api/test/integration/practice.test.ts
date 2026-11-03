import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import sharp from 'sharp'
import request from 'supertest'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { sweepStuckAttempts } from '../../src/assessment/service.js'
import { loadContent } from '../../src/content/loader.js'
import { attempts, guidelineApprovals, items } from '../../src/db/schema.js'
import { SEED_CLASSES, SEED_PEOPLE } from '../../src/db/seed-data.js'
import { okResponse } from '../../src/gateway/testing.js'
import { silentLogger } from '../../src/logger.js'
import { hasExif } from '../../src/storage/images.js'
import { memoryStorage } from '../../src/storage/index.js'
import { TEST_ORIGIN, countRows, freshContext, signInAs, type TestContext } from './db.js'
import { goodWorkCheck, hasImage, purposeOf, scriptedModel, type ScriptedModel } from './practiceGateway.js'
import { eq } from 'drizzle-orm'

let ctx: TestContext
let model: ScriptedModel
let storage: ReturnType<typeof memoryStorage>

beforeAll(async () => {
  model = scriptedModel()
  storage = memoryStorage()
  ctx = await freshContext({ gateway: model.gateway, storage })
})
afterAll(async () => {
  await ctx.jobs.waitAll()
  await ctx.close()
})
beforeEach(() => model.reset())

const origin = (req: request.Test) => req.set('Origin', TEST_ORIGIN)
const app = () => ctx.app

async function approvedItemId(): Promise<string> {
  const [row] = await ctx.db.select({ id: items.id }).from(items).where(eq(items.slug, 'alg-12-factorise-trinomial')).limit(1)
  if (!row) throw new Error('seed item missing')
  return row.id
}

/** Submits typed work, starts the check, waits for the background job, returns the final view. */
async function typedAttempt(cookie: string, text: string, key: string, extra: Record<string, unknown> = {}) {
  const created = await origin(request(app()).post('/api/attempts').set('Cookie', cookie)).send({ itemId: await approvedItemId(), answerText: text, idempotencyKey: key, ...extra })
  expect([200, 201]).toContain(created.status)
  const attemptId: string = created.body.attemptId
  const started = await origin(request(app()).post(`/api/attempts/${attemptId}/assess`).set('Cookie', cookie))
  expect([200, 202]).toContain(started.status)
  await ctx.jobs.wait(`assess:${attemptId}`)
  const view = await request(app()).get(`/api/attempts/${attemptId}`).set('Cookie', cookie)
  expect(view.status).toBe(200)
  return { attemptId, created, started, view }
}

const modelRunsFor = async (attemptId: string) =>
  (await ctx.db.execute<{ status: string; attempt_no: number; cost_usd: string; request_id: string }>(`select status, attempt_no, cost_usd, request_id from model_runs where subject_type = 'attempt' and subject_id = '${attemptId}' order by attempt_no`)).rows

describe('the homework check (P0-04)', () => {
  it('a typed answer: one attempt, one model run, one proposed assessment, two events, provenance set', async () => {
    const lerato = await signInAs(app(), 'lerato')
    const { attemptId, started, view } = await typedAttempt(lerato, 'x² − 5x + 6 = 0\n(x − 2)(x − 3) = 0\nx − 2 = 0 or x − 3 = 0', 'k-typed-1')
    expect(started.status).toBe(202)
    expect(started.body).toEqual({ status: 'assessing', attemptId })

    expect(view.body.attempt).toMatchObject({ kind: 'typed', mode: 'assisted', status: 'proposed', provenance: 'student_provided', maxMarks: 4 })
    expect(view.body.assessment).toMatchObject({ status: 'proposed', total: 3, promptVersion: 'work-check-v1' })
    expect(view.body.assessment.steps).toHaveLength(4)
    expect(view.body.assessment.steps[3]).toMatchObject({ stepNo: 4, awarded: 0, available: 1, hint: expect.stringContaining('factor') })
    expect(view.body.hintsVisible).toBe(true)
    expect(view.body.guideline).toHaveLength(4)

    const runs = await modelRunsFor(attemptId)
    expect(runs).toHaveLength(1)
    expect(runs[0]).toMatchObject({ status: 'accepted', attempt_no: 1 })
    expect(Number(runs[0]?.cost_usd)).toBeGreaterThan(0)

    const assessment = await ctx.db.execute<{ provenance: string; provenance_detail: { model_run_id: string; provider: string }; training_permission: string }>(
      `select provenance, provenance_detail, training_permission from assessments where attempt_id = '${attemptId}'`,
    )
    expect(assessment.rows[0]?.provenance).toBe('model_generated')
    expect(assessment.rows[0]?.provenance_detail.provider).toBe('meta')
    expect(assessment.rows[0]?.provenance_detail.model_run_id).toMatch(/^[0-9a-f-]{36}$/)
    expect(assessment.rows[0]?.training_permission).toBe('not_permitted')

    const events = await ctx.db.execute<{ kind: string; basis: string; skill_tag: string | null }>(
      `select kind, basis, skill_tag from learning_events where attempt_id = '${attemptId}' order by occurred_at`,
    )
    expect(events.rows.map((r) => r.kind)).toEqual(['attempt_submitted', 'assessed'])
    expect(events.rows[1]).toMatchObject({ basis: 'model_high', skill_tag: 'solve-quadratic-by-factors' })

    const usage = await ctx.db.execute<{ calls: number }>(`select calls from model_usage_daily where user_id = '${SEED_PEOPLE.lerato.id}'`)
    expect(usage.rows[0]?.calls).toBe(1)

    // The prompt carried the item, the guideline and the answer; nothing about the person.
    const prompt = JSON.stringify(model.requests[0]?.messages)
    expect(prompt).not.toContain('Lerato')
    expect(prompt).not.toContain('@')
  })

  it('a replay with the same idempotency key makes no second model call', async () => {
    const lerato = await signInAs(app(), 'lerato')
    const first = await typedAttempt(lerato, 'x² − 5x + 6 = 0\n(x − 2)(x − 3) = 0', 'k-replay')
    const callsBefore = model.requests.length
    const again = await origin(request(app()).post('/api/attempts').set('Cookie', lerato)).send({ itemId: await approvedItemId(), answerText: 'different text, same key', idempotencyKey: 'k-replay' })
    expect(again.status).toBe(200)
    expect(again.body).toMatchObject({ attemptId: first.attemptId, replayed: true })
    const assess = await origin(request(app()).post(`/api/attempts/${first.attemptId}/assess`).set('Cookie', lerato))
    expect(assess.status).toBe(200)
    expect(assess.body.status).toBe('done')
    expect(model.requests.length).toBe(callsBefore)
    expect(await modelRunsFor(first.attemptId)).toHaveLength(1)
  })

  it('refuses an item the class teacher has not approved: 409, no model call, nothing stored', async () => {
    const bongani = await signInAs(app(), 'bongani') // 11B: the seed approves items for 12A only
    const runsBefore = await countRows(ctx.db, 'model_runs')
    const inputsBefore = await countRows(ctx.db, 'inputs')
    const res = await origin(request(app()).post('/api/attempts').set('Cookie', bongani)).send({ itemId: await approvedItemId(), answerText: 'x = 2', idempotencyKey: 'k-11b' })
    expect(res.status).toBe(409)
    expect(res.body.error.code).toBe('guideline_not_approved')
    expect(await countRows(ctx.db, 'model_runs')).toBe(runsBefore)
    expect(await countRows(ctx.db, 'inputs')).toBe(inputsBefore)
  })

  it('a hint that leaks the answer three times: exhausted → uncertain, three runs, no marks shown', async () => {
    const thabo = await signInAs(app(), 'thabo')
    const leaking = (req: Parameters<typeof goodWorkCheck>[0]) => okResponse(goodWorkCheck(req, { loseLast: true, hint: 'The solutions are x = 2 and x = 3.' }))
    model.queue.push(leaking, leaking, leaking)
    const { attemptId, view } = await typedAttempt(thabo, 'x² − 5x + 6 = 0\n(x − 2)(x − 3) = 0', 'k-leak')
    expect(view.body.attempt.status).toBe('uncertain')
    expect(view.body.assessment).toMatchObject({ status: 'uncertain', total: null, steps: [] })
    expect(view.body.assessment.ambiguityReasons).toContain('HINT_LEAKS_ANSWER')
    const runs = await modelRunsFor(attemptId)
    expect(runs.map((r) => r.status)).toEqual(['retried', 'retried', 'exhausted'])
    expect(JSON.stringify(view.body)).not.toContain('x = 2 and x = 3')
    const events = await ctx.db.execute<{ kind: string; basis: string }>(`select kind, basis from learning_events where attempt_id = '${attemptId}' and kind = 'assessed'`)
    expect(events.rows[0]?.basis).toBe('none')
  })

  it('retried once then accepted: two runs, a proposed result', async () => {
    const naledi = await signInAs(app(), 'naledi')
    model.queue.push((req) => okResponse({ ...goodWorkCheck(req), total: 99 })) // TOTAL_MISMATCH, then the default answer
    const { attemptId, view } = await typedAttempt(naledi, 'x² − 5x + 6 = 0\n(x − 2)(x − 3) = 0', 'k-retry')
    expect(view.body.attempt.status).toBe('proposed')
    expect((await modelRunsFor(attemptId)).map((r) => r.status)).toEqual(['retried', 'accepted'])
    expect(model.requests[1] && JSON.stringify(model.requests[1].messages)).toContain('TOTAL_MISMATCH')
  })

  it('a timeout: failed → uncertain, never an invented mark', async () => {
    const sipho = await signInAs(app(), 'sipho')
    model.queue.push({ ok: false, kind: 'timeout' })
    const { attemptId, view } = await typedAttempt(sipho, 'x² − 5x + 6 = 0', 'k-timeout')
    expect(view.body.attempt.status).toBe('uncertain')
    expect(view.body.assessment.total).toBeNull()
    expect(view.body.assessment.ambiguityReasons).toEqual(expect.arrayContaining(['failed', 'timeout']))
    expect((await modelRunsFor(attemptId)).map((r) => r.status)).toEqual(['failed'])
  })

  it('independent mode: the hint is stored but served only once assessed', async () => {
    const zanele = await signInAs(app(), 'zanele')
    const { view } = await typedAttempt(zanele, 'x² − 5x + 6 = 0\n(x − 2)(x − 3) = 0', 'k-indep', { mode: 'independent' })
    expect(view.body.attempt.mode).toBe('independent')
    expect(view.body.hintsVisible).toBe(true) // assessed now
    const stored = await ctx.db.execute<{ steps: Array<{ hint: string | null }> }>(`select steps from assessments where attempt_id = '${view.body.attempt.id}'`)
    expect(stored.rows[0]?.steps[3]?.hint).toBeTruthy()
  })

  it('a stuck assessment is marked uncertain by the boot sweep', async () => {
    const kagiso = await signInAs(app(), 'kagiso')
    const created = await origin(request(app()).post('/api/attempts').set('Cookie', kagiso)).send({ itemId: await approvedItemId(), answerText: 'stuck', idempotencyKey: 'k-stuck' })
    const attemptId: string = created.body.attemptId
    await ctx.db.update(attempts).set({ assessingStartedAt: new Date(Date.now() - 10 * 60 * 1000) }).where(eq(attempts.id, attemptId))
    const before = await request(app()).get(`/api/attempts/${attemptId}`).set('Cookie', kagiso)
    expect(before.body.attempt.status).toBe('assessing')
    expect(await sweepStuckAttempts(ctx.db, silentLogger)).toBe(1)
    const after = await request(app()).get(`/api/attempts/${attemptId}`).set('Cookie', kagiso)
    expect(after.body.attempt.status).toBe('uncertain')
    expect(after.body.assessment.ambiguityReasons).toEqual(['stuck_after_restart'])
    expect(await sweepStuckAttempts(ctx.db, silentLogger)).toBe(0)
  })
})

describe('bring anything (P0-03): photos, classification, access', () => {
  async function jpegWithExif(): Promise<Buffer> {
    return sharp({ create: { width: 1200, height: 900, channels: 3, background: { r: 250, g: 250, b: 250 } } })
      .jpeg()
      .withMetadata({ exif: { IFD0: { ImageDescription: 'kitchen table', Copyright: 'the learner' } } })
      .toBuffer()
  }

  it('a photo answer is stored private with EXIF stripped; the owner and class teacher get a short link; others 404', async () => {
    const lerato = await signInAs(app(), 'lerato')
    const upload = await origin(request(app()).post('/api/inputs').set('Cookie', lerato))
      .field('kind', 'work')
      .field('itemId', await approvedItemId())
      .field('idempotencyKey', 'k-photo-1')
      .attach('file', await jpegWithExif(), { filename: 'IMG_0001.jpg', contentType: 'image/jpeg' })
    expect(upload.status).toBe(201)
    expect(upload.body.input).toMatchObject({ kind: 'work', kindOverridden: true, needsKind: false, mediaType: 'image/jpeg' })
    const attemptId: string = upload.body.input.attemptId
    expect(attemptId).toMatch(/^[0-9a-f-]{36}$/)

    // Read the stored object back: no EXIF, and the description text is gone.
    const [key, object] = [...storage.objects.entries()][0] ?? []
    expect(key).toMatch(/^inputs\/[0-9a-f-]{36}\/[0-9a-f-]{36}\.jpg$/)
    expect(await hasExif(object!.body)).toBe(false)
    expect(object!.body.toString('latin1')).not.toContain('kitchen table')

    // The model is asked with the image; the result is a proposed assessment with boxes.
    await origin(request(app()).post(`/api/attempts/${attemptId}/assess`).set('Cookie', lerato))
    await ctx.jobs.wait(`assess:${attemptId}`)
    expect(hasImage(model.requests[model.requests.length - 1]!)).toBe(true)
    const view = await request(app()).get(`/api/attempts/${attemptId}`).set('Cookie', lerato)
    expect(view.body.attempt).toMatchObject({ kind: 'photo', hasImage: true, status: 'proposed' })
    expect(view.body.assessment.steps[0].box).toEqual([100, 100, 900, 220])

    // The image: 302 to a presigned link (≤ 5 min) for the owner and the class teacher only.
    const mine = await request(app()).get(`/api/attempts/${attemptId}/image`).set('Cookie', lerato)
    expect(mine.status).toBe(302)
    const url = new URL(mine.headers['location'] ?? '')
    expect(url.origin).toBe(storage.presignOrigin)
    expect(Number(url.searchParams.get('X-Amz-Expires'))).toBeLessThanOrEqual(300)
    expect(mine.headers['content-security-policy']).toContain(storage.presignOrigin)

    const dlamini = await signInAs(app(), 'msDlamini')
    expect((await request(app()).get(`/api/attempts/${attemptId}/image`).set('Cookie', dlamini)).status).toBe(302)
    expect((await request(app()).get(`/api/attempts/${attemptId}`).set('Cookie', dlamini)).status).toBe(200)

    // Learner B, a guardian (even the linked one), another class's teacher, another school's teacher: 404.
    for (const who of ['thabo', 'mmaLerato', 'mrNaidoo', 'msBotha', 'anele'] as const) {
      const cookie = await signInAs(app(), who)
      expect((await request(app()).get(`/api/attempts/${attemptId}/image`).set('Cookie', cookie)).status, who).toBe(404)
      expect((await request(app()).get(`/api/attempts/${attemptId}`).set('Cookie', cookie)).status, who).toBe(404)
      expect((await request(app()).get(`/api/inputs/${upload.body.input.id}`).set('Cookie', cookie)).status, who).toBe(404)
    }
    // No session: 401. The object has no public route: the key is not served by the app.
    expect((await request(app()).get(`/api/attempts/${attemptId}/image`)).status).toBe(401)
    expect((await request(app()).get(`/${key}`)).status).not.toBe(200)
  })

  it('refuses a file that is not an image or PDF, and an oversize one', async () => {
    const lerato = await signInAs(app(), 'lerato')
    const svg = await origin(request(app()).post('/api/inputs').set('Cookie', lerato))
      .field('idempotencyKey', 'k-svg')
      .attach('file', Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'), { filename: 'x.svg', contentType: 'image/jpeg' })
    expect(svg.status).toBe(400)
    expect(svg.body.error.code).toBe('unsupported_file')
    const big = await origin(request(app()).post('/api/inputs').set('Cookie', lerato))
      .field('idempotencyKey', 'k-big')
      .attach('file', Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), Buffer.alloc(8 * 1024 * 1024 + 1)]), { filename: 'big.jpg', contentType: 'image/jpeg' })
    expect(big.status).toBe(413)
  })

  it('classifies a typed input; low confidence asks the learner, who routes it without a second upload', async () => {
    const lerato = await signInAs(app(), 'lerato')
    model.queue.push(okResponse({ kind: 'work', confidence: 'low', reason: 'Could be working or a question.' }))
    const created = await origin(request(app()).post('/api/inputs').set('Cookie', lerato)).send({ text: 'x² − 5x + 6 = 0\n(x − 2)(x − 3) = 0', idempotencyKey: 'k-classify-low' })
    expect(created.status).toBe(201)
    expect(created.body.input).toMatchObject({ kind: 'work', kindOverridden: false, confidence: 'low', needsKind: true, attemptId: null })
    expect(purposeOf(model.requests[0]!)).toBe('classify')

    const routed = await origin(request(app()).patch(`/api/inputs/${created.body.input.id}/kind`).set('Cookie', lerato)).send({ kind: 'work', itemId: await approvedItemId() })
    expect(routed.status).toBe(200)
    expect(routed.body.input).toMatchObject({ kind: 'work', kindOverridden: true, needsKind: false })
    expect(routed.body.input.attemptId).toMatch(/^[0-9a-f-]{36}$/)
    expect(await countRows(ctx.db, 'inputs')).toBeGreaterThan(0)

    // A question is stored and goes nowhere yet.
    const question = await origin(request(app()).post('/api/inputs').set('Cookie', lerato)).send({ kind: 'question', text: 'Why does the sign flip in step 2?', idempotencyKey: 'k-q' })
    expect(question.status).toBe(201)
    expect(question.body.input).toMatchObject({ kind: 'question', attemptId: null, notice: { state: 'none' } })

    const list = await request(app()).get('/api/inputs').set('Cookie', lerato)
    expect(list.body.inputs.length).toBeGreaterThanOrEqual(2)
  })

  it('the learner cannot change the kind of another learner’s input', async () => {
    const thabo = await signInAs(app(), 'thabo')
    const created = await origin(request(app()).post('/api/inputs').set('Cookie', thabo)).send({ kind: 'question', text: 'mine', idempotencyKey: 'k-thabo-q' })
    const naledi = await signInAs(app(), 'naledi')
    const res = await origin(request(app()).patch(`/api/inputs/${created.body.input.id}/kind`).set('Cookie', naledi)).send({ kind: 'work' })
    expect(res.status).toBe(404)
  })
})

describe('notice to plan (P0-06)', () => {
  const notice = ['Grade 12 November timetable', 'Maths Paper 1 on 2026-11-20', 'Maths Paper 2 on 2026-11-24?', 'Office hours: 011 555 1234 56', 'Maths Paper 1 on 2026-11-20'].join('\n')

  it('a teacher’s notice becomes class events with source lines; low confidence is proposed; guardians see confirmed only', async () => {
    const dlamini = await signInAs(app(), 'msDlamini')
    const upload = await origin(request(app()).post('/api/inputs').set('Cookie', dlamini)).send({ text: notice, idempotencyKey: 'k-notice-1', classId: SEED_CLASSES['12A'].id })
    expect(upload.status).toBe(201)
    expect(upload.body.input).toMatchObject({ kind: 'notice', kindOverridden: true })
    await ctx.jobs.wait(`notice:${upload.body.input.id}`)
    expect(JSON.stringify(model.requests[0]?.messages)).not.toContain('555 1234') // scrubbed before the prompt

    const view = await request(app()).get(`/api/inputs/${upload.body.input.id}`).set('Cookie', dlamini)
    expect(view.body.input.notice).toEqual({ state: 'extracted', events: 2, proposed: 1 }) // the duplicate line merged

    const teacherCal = await request(app()).get(`/api/calendar?scope=class:${SEED_CLASSES['12A'].id}`).set('Cookie', dlamini)
    expect(teacherCal.status).toBe(200)
    expect(teacherCal.body.events.map((e: { title: string; status: string; canDecide: boolean }) => [e.title, e.status, e.canDecide])).toEqual([
      ['Maths Paper 1', 'confirmed', true],
      ['Maths Paper 2', 'proposed', true],
    ])
    expect(teacherCal.body.events[0]).toMatchObject({ sourceLine: 'Maths Paper 1 on 2026-11-20', onDate: '2026-11-20', scopeType: 'class' })
    const stored = await ctx.db.execute<{ provenance: string }>(`select provenance from calendar_events`)
    expect(new Set(stored.rows.map((r) => r.provenance))).toEqual(new Set(['school_provided']))

    const lerato = await signInAs(app(), 'lerato')
    const learnerCal = await request(app()).get('/api/calendar').set('Cookie', lerato)
    expect(learnerCal.body.events.map((e: { title: string }) => e.title)).toEqual(['Maths Paper 1'])
    expect(learnerCal.body.events[0].canDecide).toBe(false)
    const guardian = await signInAs(app(), 'mmaLerato')
    const guardianCal = await request(app()).get('/api/calendar').set('Cookie', guardian)
    expect(guardianCal.body.events.map((e: { title: string }) => e.title)).toEqual(['Maths Paper 1'])

    // Reject the proposed one: it never reaches a guardian. Confirm would publish it.
    const proposedId = teacherCal.body.events[1].id
    const rejected = await origin(request(app()).post(`/api/calendar/${proposedId}/reject`).set('Cookie', dlamini))
    expect(rejected.status).toBe(200)
    expect(rejected.body.event.status).toBe('rejected')
    expect((await request(app()).get('/api/calendar').set('Cookie', guardian)).body.events).toHaveLength(1)
    const confirmed = await origin(request(app()).post(`/api/calendar/${proposedId}/confirm`).set('Cookie', dlamini))
    expect(confirmed.body.published).toEqual({ learners: 6, guardians: 1 })
    expect((await request(app()).get('/api/calendar').set('Cookie', guardian)).body.events).toHaveLength(2)

    // Only the class teacher decides: the 11B teacher, the other school, a learner → 404.
    for (const who of ['mrNaidoo', 'msBotha', 'lerato', 'anele'] as const) {
      const cookie = await signInAs(app(), who)
      expect((await origin(request(app()).post(`/api/calendar/${proposedId}/reject`).set('Cookie', cookie))).status, who).toBe(404)
    }
    expect((await request(app()).get(`/api/calendar?scope=class:${SEED_CLASSES['12A'].id}`).set('Cookie', await signInAs(app(), 'msBotha'))).body.events).toEqual([])
  })

  it('a learner’s own notice is learner-scoped and student_provided; a teacher needs a class', async () => {
    const naledi = await signInAs(app(), 'naledi')
    const upload = await origin(request(app()).post('/api/inputs').set('Cookie', naledi)).send({ kind: 'notice', text: 'Physics test on 2026-11-18?', idempotencyKey: 'k-notice-learner' })
    await ctx.jobs.wait(`notice:${upload.body.input.id}`)
    const cal = await request(app()).get('/api/calendar').set('Cookie', naledi)
    const own = cal.body.events.filter((e: { scopeType: string }) => e.scopeType === 'learner')
    expect(own).toHaveLength(1)
    expect(own[0]).toMatchObject({ status: 'proposed', canDecide: true })
    const confirmed = await origin(request(app()).post(`/api/calendar/${own[0].id}/confirm`).set('Cookie', naledi))
    expect(confirmed.body).toMatchObject({ event: { status: 'confirmed' }, published: null })
    const events = await ctx.db.execute<{ kind: string }>(`select kind from learning_events where learner_id = '${SEED_PEOPLE.naledi.id}' and kind = 'notice_confirmed'`)
    expect(events.rows).toHaveLength(1)
    const provenance = await ctx.db.execute<{ provenance: string }>(`select provenance from calendar_events where id = '${own[0].id}'`)
    expect(provenance.rows[0]?.provenance).toBe('student_provided')

    const dlamini = await signInAs(app(), 'msDlamini')
    const noClass = await origin(request(app()).post('/api/inputs').set('Cookie', dlamini)).send({ text: notice, idempotencyKey: 'k-notice-noclass' })
    expect(noClass.status).toBe(400)
    expect(noClass.body.error.code).toBe('class_required')
    const otherClass = await origin(request(app()).post('/api/inputs').set('Cookie', dlamini)).send({ text: notice, idempotencyKey: 'k-notice-11b', classId: SEED_CLASSES['11B'].id })
    expect(otherClass.status).toBe(404)
  })
})

describe('caps and configuration', () => {
  it('refuses with 429 budget_exhausted at the per-user call cap and at the global budget', async () => {
    const capped = scriptedModel()
    const small = await freshContext({ gateway: capped.gateway, env: { MODEL_USER_DAILY_CALLS: '1', MODEL_DAILY_BUDGET_USD: '5' } })
    try {
      const lerato = await signInAs(small.app, 'lerato')
      const item = (await small.db.select({ id: items.id }).from(items).limit(1))[0]!.id
      const first = await origin(request(small.app).post('/api/attempts').set('Cookie', lerato)).send({ itemId: item, answerText: 'x² − 5x + 6 = 0', idempotencyKey: 'c1' })
      await origin(request(small.app).post(`/api/attempts/${first.body.attemptId}/assess`).set('Cookie', lerato))
      await small.jobs.wait(`assess:${first.body.attemptId}`)
      const second = await origin(request(small.app).post('/api/attempts').set('Cookie', lerato)).send({ itemId: item, answerText: 'x² − 5x + 6 = 0', idempotencyKey: 'c2' })
      const refused = await origin(request(small.app).post(`/api/attempts/${second.body.attemptId}/assess`).set('Cookie', lerato))
      expect(refused.status).toBe(429)
      expect(refused.body.error.code).toBe('budget_exhausted')
      expect(capped.requests).toHaveLength(1)
      // Another learner is still within their own cap but the global budget decides for everyone.
      await small.db.execute(`update model_usage_daily set cost_usd = 5`)
      const thabo = await signInAs(small.app, 'thabo')
      const third = await origin(request(small.app).post('/api/attempts').set('Cookie', thabo)).send({ itemId: item, answerText: 'x² − 5x + 6 = 0', idempotencyKey: 'c3' })
      const global = await origin(request(small.app).post(`/api/attempts/${third.body.attemptId}/assess`).set('Cookie', thabo))
      expect(global.status).toBe(429)
      expect(global.body.error.message).toMatch(/everyone/)
    } finally {
      await small.close()
    }
  })

  it('without storage, uploads answer 503 and typed work still runs; without a model key, assess answers 503', async () => {
    const bare = await freshContext({ storage: null })
    try {
      const lerato = await signInAs(bare.app, 'lerato')
      const upload = await origin(request(bare.app).post('/api/inputs').set('Cookie', lerato))
        .field('idempotencyKey', 'k-nostore')
        .attach('file', Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0]), { filename: 'a.jpg', contentType: 'image/jpeg' })
      expect(upload.status).toBe(503)
      expect(upload.body.error.code).toBe('storage_not_configured')
      const item = (await bare.db.select({ id: items.id }).from(items).limit(1))[0]!.id
      const typed = await origin(request(bare.app).post('/api/attempts').set('Cookie', lerato)).send({ itemId: item, answerText: 'x = 2', idempotencyKey: 'k-typed-nomodel' })
      expect(typed.status).toBe(201)
      const assess = await origin(request(bare.app).post(`/api/attempts/${typed.body.attemptId}/assess`).set('Cookie', lerato))
      expect(assess.status).toBe(503)
      expect(assess.body.error.code).toBe('model_not_configured')
      expect(await countRows(bare.db, 'model_runs')).toBe(0)
    } finally {
      await bare.close()
    }
  })
})

describe('content loader accepts AI-drafted items (brief B04 §0)', () => {
  it('a model_generated item loads with reviewer pending; it cannot be assessed until the class teacher approves it', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'gb-b04-'))
    const drafted = {
      slug: 'b04-ai-drafted',
      topic: 'Algebra',
      skill_tags: ['exponents'],
      prompt_md: 'Simplify $2^3 \\cdot 2^2$.',
      max_marks: 2,
      author: 'Muse Spark draft, planning session prompt',
      reviewer: 'pending',
      source: 'original',
      provenance: 'model_generated',
      guideline_steps: [
        { step_no: 1, step_type: 'M', criterion: 'adds the exponents', marks: 1, skill_tag: 'exponents' },
        { step_no: 2, step_type: 'A', criterion: '$2^5 = 32$', marks: 1, skill_tag: 'exponents' },
      ],
    }
    try {
      writeFileSync(path.join(dir, 'drafted.json'), JSON.stringify(drafted))
      const report = await loadContent(ctx.db, dir)
      expect(report.inserted).toEqual(['b04-ai-drafted'])
      const [row] = await ctx.db.select({ id: items.id, provenance: items.provenance, revision: items.revision }).from(items).where(eq(items.slug, 'b04-ai-drafted'))
      expect(row?.provenance).toBe('model_generated')

      // The teacher sees the provenance on the item; the learner does not.
      const dlamini = await signInAs(app(), 'msDlamini')
      const teacherView = await request(app()).get(`/api/items/${row!.id}`).set('Cookie', dlamini)
      expect(teacherView.body.item).toMatchObject({ provenance: 'model_generated', reviewer: 'pending' })
      const lerato = await signInAs(app(), 'lerato')
      const learnerView = await request(app()).get(`/api/items/${row!.id}`).set('Cookie', lerato)
      expect(learnerView.body.item.provenance).toBeUndefined()

      const refused = await origin(request(app()).post('/api/attempts').set('Cookie', lerato)).send({ itemId: row!.id, answerText: '2^5 = 32', idempotencyKey: 'k-drafted-1' })
      expect(refused.status).toBe(409)
      expect(refused.body.error.code).toBe('guideline_not_approved')

      await ctx.db.insert(guidelineApprovals).values({ classId: SEED_CLASSES['12A'].id, itemId: row!.id, itemRevision: row!.revision, approvedBy: SEED_PEOPLE.msDlamini.id })
      const allowed = await origin(request(app()).post('/api/attempts').set('Cookie', lerato)).send({ itemId: row!.id, answerText: '2^5 = 32', idempotencyKey: 'k-drafted-2' })
      expect(allowed.status).toBe(201)

      // Reviewed means teacher_verified, not model_generated with a named reviewer.
      writeFileSync(path.join(dir, 'drafted.json'), JSON.stringify({ ...drafted, slug: 'b04-ai-reviewed', reviewer: 'Ms Dlamini' }))
      await expect(loadContent(ctx.db, dir)).rejects.toThrow(/invalid file/)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
