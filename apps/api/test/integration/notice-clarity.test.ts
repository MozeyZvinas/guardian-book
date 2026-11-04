import request from 'supertest'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { okResponse } from '../../src/gateway/testing.js'
import type { ChatRequest } from '../../src/gateway/transport.js'
import { TEST_ORIGIN, freshContext, signInAs, type TestContext } from './db.js'
import { classification, purposeOf, scriptedModel, type ScriptedModel } from './practiceGateway.js'

/**
 * B16 §5: a notice the model reads but finds no dates on is "I couldn't find any dates on
 * this" (`not_a_notice`), never the failure message; a real failure (the model call timed
 * out) stays `failed`. Both leave the calendar untouched.
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
beforeEach(() => model.reset())

const origin = (req: request.Test) => req.set('Origin', TEST_ORIGIN)

/** An override that answers the notice call as told and any classify call with "notice". */
const noticeAnswer = (answer: (request: ChatRequest) => ReturnType<typeof okResponse>) => (request: ChatRequest) =>
  purposeOf(request) === 'notice' ? answer(request) : okResponse(classification('notice'))

async function bringNotice(cookie: string, text: string, key: string): Promise<string> {
  const upload = await origin(request(ctx.app).post('/api/inputs').set('Cookie', cookie)).send({ kind: 'notice', text, idempotencyKey: key })
  expect(upload.status).toBe(201)
  const id: string = upload.body.input.id
  await ctx.jobs.wait(`notice:${id}`)
  return id
}

const runStatuses = async (inputId: string) =>
  (await ctx.db.execute<{ status: string }>(`select status from model_runs where subject_type = 'input' and subject_id = '${inputId}' and purpose = 'notice' order by attempt_no`)).rows.map((r) => r.status)

describe('a notice with no dates (B16 §5)', () => {
  it('the model reads it and lists no dated events: not_a_notice, nothing added, the run accepted', async () => {
    const naledi = await signInAs(ctx.app, 'naledi')
    model.queue.push(noticeAnswer(() => okResponse({ events: [], not_a_notice: false }, { requestId: 'req_nodates' })))
    const id = await bringNotice(naledi, 'Dear parents, the hall is closed this week for painting. Thank you for your patience.', 'k-b16-nodates')

    const view = await request(ctx.app).get(`/api/inputs/${id}`).set('Cookie', naledi)
    expect(view.status).toBe(200)
    expect(view.body.input.notice).toEqual({ state: 'not_a_notice', events: 0, proposed: 0 })
    expect(await runStatuses(id)).toEqual(['accepted'])

    const calendar = await request(ctx.app).get('/api/calendar').set('Cookie', naledi)
    expect(calendar.body.events.filter((e: { sourceInputId: string }) => e.sourceInputId === id)).toEqual([])
  })

  it('the model says it is not a notice at all: the same words, nothing added', async () => {
    const naledi = await signInAs(ctx.app, 'naledi')
    model.queue.push(noticeAnswer(() => okResponse({ events: [], not_a_notice: true }, { requestId: 'req_notanotice' })))
    const id = await bringNotice(naledi, 'x^2 - 5x + 6 = 0 so (x - 2)(x - 3) = 0', 'k-b16-notanotice')
    const view = await request(ctx.app).get(`/api/inputs/${id}`).set('Cookie', naledi)
    expect(view.body.input.notice).toEqual({ state: 'not_a_notice', events: 0, proposed: 0 })
  })

  it('a real failure (the model call timed out) stays failed, with a failed run row', async () => {
    const naledi = await signInAs(ctx.app, 'naledi')
    model.queue.push((request: ChatRequest) => (purposeOf(request) === 'notice' ? { ok: false as const, kind: 'timeout' as const } : okResponse(classification('notice'))))
    const id = await bringNotice(naledi, 'Grade 12 November timetable', 'k-b16-timeout')

    const view = await request(ctx.app).get(`/api/inputs/${id}`).set('Cookie', naledi)
    expect(view.body.input.notice).toEqual({ state: 'failed', events: 0, proposed: 0 })
    expect(await runStatuses(id)).toEqual(['failed'])
  })

  it('a notice with dates still reads as extracted', async () => {
    const naledi = await signInAs(ctx.app, 'naledi')
    const id = await bringNotice(naledi, 'Physics test on 2026-11-18', 'k-b16-dates')
    const view = await request(ctx.app).get(`/api/inputs/${id}`).set('Cookie', naledi)
    expect(view.body.input.notice).toEqual({ state: 'extracted', events: 1, proposed: 0 })
  })
})
