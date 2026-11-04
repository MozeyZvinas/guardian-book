import { eq } from 'drizzle-orm'
import sharp from 'sharp'
import request from 'supertest'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { attempts, inputs, items } from '../../src/db/schema.js'
import { SEED_CLASSES, SEED_PEOPLE } from '../../src/db/seed-data.js'
import { memoryStorage } from '../../src/storage/index.js'
import { TEST_ORIGIN, freshContext, signInAs, type TestContext } from './db.js'
import { hasImage, purposeOf, scriptedModel, type ScriptedModel } from './practiceGateway.js'

/**
 * B11 · a teacher uploads a learner's script (P1-g): Ms Dlamini posts Lerato's photographed
 * test answer on an approved question → an independent, `school_provided` attempt in her
 * queue, assessed by the mocked model in the background → nothing visible to Lerato or her
 * parent until release → after release, Lerato sees it with the teacher's values. Plus the
 * 409 for an unapproved guideline and every change-the-ID row the brief names.
 */

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
const C = SEED_CLASSES
const P = SEED_PEOPLE

async function itemId(slug = 'alg-12-factorise-trinomial'): Promise<string> {
  const [row] = await ctx.db.select({ id: items.id }).from(items).where(eq(items.slug, slug)).limit(1)
  if (!row) throw new Error('seed item missing')
  return row.id
}

/** A synthetic "script": pale paper with a few dark strokes, as a JPEG with EXIF-free output expected. */
async function scriptJpeg(): Promise<Buffer> {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="900" height="1200"><rect width="100%" height="100%" fill="#f7f3ea"/><text x="60" y="200" font-size="56" fill="#222">x² − 5x + 6 = 0</text><text x="60" y="400" font-size="56" fill="#222">(x − 2)(x − 3) = 0</text></svg>`
  return sharp(Buffer.from(svg)).jpeg({ quality: 85 }).toBuffer()
}

function upload(cookie: string, classId: string, fields: Record<string, string>, image: Buffer | null) {
  let req = origin(request(app()).post(`/api/teacher/classes/${classId}/scripts`).set('Cookie', cookie))
  for (const [name, value] of Object.entries(fields)) req = req.field(name, value)
  if (image) req = req.attach('image', image, { filename: 'script.jpg', contentType: 'image/jpeg' })
  return req
}

describe('B11 · upload a script', () => {
  it('creates an independent school_provided attempt for the learner, assessed in the background, hidden from the learner and the guardian until release', async () => {
    const dlamini = await signInAs(app(), 'msDlamini')
    const lerato = await signInAs(app(), 'lerato')
    const guardian = await signInAs(app(), 'mmaLerato')
    const item = await itemId()

    const posted = await upload(dlamini, C['12A'].id, { learnerId: P.lerato.id, itemId: item, idempotencyKey: 'script-1' }, await scriptJpeg())
    expect(posted.status).toBe(202)
    expect(posted.body).toMatchObject({ replayed: false })
    const attemptId: string = posted.body.attemptId
    const inputId: string = posted.body.inputId

    // The rows: the attempt is Lerato's, independent, a photo, school_provided; the input carries the uploader (D37).
    const [attempt] = await ctx.db.select().from(attempts).where(eq(attempts.id, attemptId)).limit(1)
    expect(attempt).toMatchObject({ learnerId: P.lerato.id, kind: 'photo', mode: 'independent', provenance: 'school_provided', trainingPermission: 'not_permitted' })
    const [input] = await ctx.db.select().from(inputs).where(eq(inputs.id, inputId)).limit(1)
    expect(input).toMatchObject({ learnerId: P.msDlamini.id, kind: 'work', kindOverridden: true, attemptId, provenance: 'school_provided', idempotencyKey: 'script:script-1' })
    expect(input?.objectKey).toMatch(/^scripts\//)
    expect(storage.objects.has(input?.objectKey ?? '')).toBe(true)
    const audit = await ctx.db.execute<{ actor_id: string; action: string; subject_id: string }>(`select actor_id, action, subject_id from audit_events where action in ('script.uploaded', 'attempt.assess_started') order by at`)
    expect(audit.rows.map((r) => [r.action, r.actor_id === P.msDlamini.id, r.subject_id === attemptId])).toEqual([
      ['script.uploaded', true, true],
      ['attempt.assess_started', true, true],
    ])

    // Nothing reaches Lerato or her parent before release: the attempt, its image, its review, a fix — all 404; her Today never lists it.
    expect((await request(app()).get(`/api/attempts/${attemptId}`).set('Cookie', lerato)).status).toBe(404)
    expect((await request(app()).get(`/api/attempts/${attemptId}/image`).set('Cookie', lerato)).status).toBe(404)
    expect((await request(app()).get(`/api/attempts/${attemptId}/review`).set('Cookie', lerato)).status).toBe(404)
    expect((await origin(request(app()).post(`/api/attempts/${attemptId}/assess`).set('Cookie', lerato))).status).toBe(404)
    expect((await origin(request(app()).post(`/api/attempts/${attemptId}/fix`).set('Cookie', lerato)).send({ answerText: 'x = 2' })).status).toBe(404)
    expect((await request(app()).get(`/api/attempts/${attemptId}`).set('Cookie', guardian)).status).toBe(404) // guardians never read attempts
    expect((await request(app()).get(`/api/attempts/${attemptId}/review`).set('Cookie', guardian)).status).toBe(404)
    const inputsList = await request(app()).get('/api/inputs').set('Cookie', lerato)
    expect(inputsList.body.inputs.map((i: { id: string }) => i.id)).not.toContain(inputId)
    const today = await request(app()).get('/api/me/today').set('Cookie', lerato)
    expect(today.status).toBe(200)
    expect(JSON.stringify(today.body)).not.toContain(attemptId)

    // The background check ran through runModel with the photo; the proposal lands in Ms Dlamini's queue like any other.
    await ctx.jobs.wait(`assess:${attemptId}`)
    await ctx.jobs.waitAll()
    const assess = model.requests.filter((r) => purposeOf(r) === 'assess')
    expect(assess).toHaveLength(1)
    expect(hasImage(assess[0]!)).toBe(true)
    const queue = await request(app()).get(`/api/teacher/queue?classId=${C['12A'].id}`).set('Cookie', dlamini)
    expect(queue.status).toBe(200)
    expect(queue.body.rows.find((r: { attemptId: string }) => r.attemptId === attemptId)).toMatchObject({ learner: { id: P.lerato.id, nickname: 'Lerato' }, kind: 'photo', mode: 'independent', status: 'proposed', proposedTotal: 3, maxMarks: 4 })
    const review = await request(app()).get(`/api/teacher/attempts/${attemptId}`).set('Cookie', dlamini)
    expect(review.status).toBe(200)
    expect(review.body.attempt).toMatchObject({ kind: 'photo', mode: 'independent', hasImage: true, status: 'proposed', classId: C['12A'].id })
    expect(review.body.steps.map((s: { proposed: { box: number[] | null } | null }) => s.proposed?.box)).toEqual([
      [100, 100, 900, 220],
      [100, 250, 900, 370],
      [100, 400, 900, 520],
      [100, 550, 900, 670],
    ])
    // Still hidden from the learner while only proposed.
    expect((await request(app()).get(`/api/attempts/${attemptId}`).set('Cookie', lerato)).status).toBe(404)

    // A replay with the same key: the same attempt, no second upload, no second model call.
    const again = await upload(dlamini, C['12A'].id, { learnerId: P.lerato.id, itemId: item, idempotencyKey: 'script-1' }, await scriptJpeg())
    expect(again.status).toBe(200)
    expect(again.body).toEqual({ attemptId, inputId, replayed: true })
    expect(model.requests.filter((r) => purposeOf(r) === 'assess')).toHaveLength(1)

    // The teacher corrects step 4 to earned, confirms and releases: now Lerato sees it, with the teacher's values.
    const awards = review.body.steps.map((s: { stepId: string; marks: number }) => ({ stepId: s.stepId, awarded: s.marks }))
    const confirmed = await origin(request(app()).post(`/api/teacher/attempts/${attemptId}/review`).set('Cookie', dlamini)).send({ steps: awards })
    expect(confirmed.status).toBe(200)
    expect((await request(app()).get(`/api/attempts/${attemptId}`).set('Cookie', lerato)).status).toBe(404) // confirmed is not released
    const released = await origin(request(app()).post(`/api/teacher/attempts/${attemptId}/release`).set('Cookie', dlamini)).send({ version: confirmed.body.review.version })
    expect(released.status).toBe(200)
    const mine = await request(app()).get(`/api/attempts/${attemptId}`).set('Cookie', lerato)
    expect(mine.status).toBe(200)
    expect(mine.body.attempt).toMatchObject({ mode: 'independent', provenance: 'school_provided', status: 'proposed' })
    const myReview = await request(app()).get(`/api/attempts/${attemptId}/review`).set('Cookie', lerato)
    expect(myReview.body.review).toMatchObject({ state: 'released', total: 4 })
    expect((await request(app()).get(`/api/attempts/${attemptId}/image`).set('Cookie', lerato)).status).toBe(302)
    // The guardian still never reads an attempt.
    expect((await request(app()).get(`/api/attempts/${attemptId}`).set('Cookie', guardian)).status).toBe(404)
    expect((await request(app()).get(`/api/attempts/${attemptId}/review`).set('Cookie', guardian)).status).toBe(404)
  })

  it('refuses an unapproved guideline (409), a missing or non-photo file (400) and a PDF (400), with nothing stored', async () => {
    const naidoo = await signInAs(app(), 'mrNaidoo')
    const before = (await ctx.db.select({ id: attempts.id }).from(attempts)).length
    // 11B's guidelines are not approved by the seed.
    const refused = await upload(naidoo, C['11B'].id, { learnerId: P.bongani.id, itemId: await itemId(), idempotencyKey: 'script-11b' }, await scriptJpeg())
    expect(refused.status).toBe(409)
    expect(refused.body.error.code).toBe('guideline_not_approved')

    const dlamini = await signInAs(app(), 'msDlamini')
    const noFile = await upload(dlamini, C['12A'].id, { learnerId: P.thabo.id, itemId: await itemId(), idempotencyKey: 'script-nofile' }, null)
    expect(noFile.status).toBe(400)
    expect(noFile.body.error.code).toBe('photo_required')
    const pdf = await origin(request(app()).post(`/api/teacher/classes/${C['12A'].id}/scripts`).set('Cookie', dlamini))
      .field('learnerId', P.thabo.id)
      .field('itemId', await itemId())
      .field('idempotencyKey', 'script-pdf')
      .attach('image', Buffer.from('%PDF-1.4 fake'), { filename: 'script.pdf', contentType: 'application/pdf' })
    expect(pdf.status).toBe(400)
    expect(pdf.body.error.code).toBe('photo_required')
    const bad = await origin(request(app()).post(`/api/teacher/classes/${C['12A'].id}/scripts`).set('Cookie', dlamini)).send({ learnerId: P.thabo.id, itemId: await itemId(), idempotencyKey: 'script-json' })
    expect(bad.status).toBe(400)
    expect((await ctx.db.select({ id: attempts.id }).from(attempts)).length).toBe(before)
    expect(model.requests).toHaveLength(0)
  })

  it('change the ID: another class’s learner → 404; another school → 404; a learner or guardian → 403', async () => {
    const item = await itemId()
    const image = await scriptJpeg()
    const dlamini = await signInAs(app(), 'msDlamini')
    // Bongani is in 11B, not 12A; Anele is at Riverside.
    expect((await upload(dlamini, C['12A'].id, { learnerId: P.bongani.id, itemId: item, idempotencyKey: 'x1' }, image)).status).toBe(404)
    expect((await upload(dlamini, C['12A'].id, { learnerId: P.anele.id, itemId: item, idempotencyKey: 'x2' }, image)).status).toBe(404)
    // 11B's teacher posting to 12A; the Riverside teacher posting to a Sentinel class; an unknown class.
    expect((await upload(await signInAs(app(), 'mrNaidoo'), C['12A'].id, { learnerId: P.lerato.id, itemId: item, idempotencyKey: 'x3' }, image)).status).toBe(404)
    expect((await upload(await signInAs(app(), 'msBotha'), C['12A'].id, { learnerId: P.lerato.id, itemId: item, idempotencyKey: 'x4' }, image)).status).toBe(404)
    expect((await upload(dlamini, '019a0b02-0000-7000-8000-00000000c999', { learnerId: P.lerato.id, itemId: item, idempotencyKey: 'x5' }, image)).status).toBe(404)
    // The wrong role.
    expect((await upload(await signInAs(app(), 'lerato'), C['12A'].id, { learnerId: P.lerato.id, itemId: item, idempotencyKey: 'x6' }, image)).status).toBe(403)
    expect((await upload(await signInAs(app(), 'mmaLerato'), C['12A'].id, { learnerId: P.lerato.id, itemId: item, idempotencyKey: 'x7' }, image)).status).toBe(403)
    expect((await origin(request(app()).post(`/api/teacher/classes/${C['12A'].id}/scripts`))).status).toBe(401)
    expect(model.requests).toHaveLength(0)
  })

  it('without storage the upload answers 503 and stores nothing; without a model key, 503 after the rows exist and a replay starts the check later', async () => {
    const bare = await freshContext({ storage: null })
    try {
      const dlamini = await signInAs(bare.app, 'msDlamini')
      const item = await (async () => {
        const [row] = await bare.db.select({ id: items.id }).from(items).where(eq(items.slug, 'alg-12-factorise-trinomial')).limit(1)
        return row?.id ?? ''
      })()
      const res = await origin(request(bare.app).post(`/api/teacher/classes/${C['12A'].id}/scripts`).set('Cookie', dlamini))
        .field('learnerId', P.lerato.id)
        .field('itemId', item)
        .field('idempotencyKey', 'bare-1')
        .attach('image', await scriptJpeg(), { filename: 'script.jpg', contentType: 'image/jpeg' })
      expect(res.status).toBe(503)
      expect(res.body.error.code).toBe('storage_not_configured')
      expect((await bare.db.select({ id: attempts.id }).from(attempts)).length).toBe(0)
    } finally {
      await bare.close()
    }
  })
})
