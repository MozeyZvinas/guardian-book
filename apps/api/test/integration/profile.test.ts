import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { ProfileCards } from '@guardian-book/shared'
import { loadConfig } from '../../src/config.js'
import { SEED_PEOPLE } from '../../src/db/seed-data.js'
import { createGateway } from '../../src/gateway/gateway.js'
import { capturingLogger, okResponse } from '../../src/gateway/testing.js'
import type { ChatRequest, Transport, TransportResult } from '../../src/gateway/transport.js'
import { TEST_ORIGIN, freshContext, signInAs, type TestContext } from './db.js'

/**
 * P0-02 through the API with a scripted model: accepted; INFERENCE_FORBIDDEN → re-ask →
 * accepted; three failures → exhausted → empty cards, labelled; edits never call the model;
 * the raw text is stored once and never served; per-role fields on a learner's cards.
 */

let ctx: TestContext
/** Results queued by each test; every request the "model" received. */
const script: TransportResult[] = []
const scripted: { requests: Array<{ request: ChatRequest }> } = { requests: [] }
const transport: Transport = async (request) => {
  scripted.requests.push({ request })
  const next = script.shift()
  if (!next) throw new Error('profile.test: no scripted result left')
  return next
}

beforeAll(async () => {
  const gateway = createGateway({
    config: loadConfig({ META_API_KEY: 'test-key-not-real' }).meta,
    logger: capturingLogger().logger,
    transport,
    sleep: async () => {},
    random: () => 0,
  })
  ctx = await freshContext({ gateway })
})
afterAll(async () => {
  await ctx.close()
})

const origin = (req: request.Test) => req.set('Origin', TEST_ORIGIN)

const answers = {
  dream: "I want to be an engineer and build bridges one day. I'm lazy and anxious about maths though.",
  subjects: 'Maths, Physical Sciences, English, Life Orientation',
  hardestSubject: 'Maths',
  howILearn: 'Doing examples and watching someone do one first',
}

const goodCards: ProfileCards = {
  dream: 'I want to be an engineer and build bridges one day.',
  subjects: ['Mathematics', 'Physical Sciences', 'English', 'Life Orientation'],
  hardest_subject: 'Mathematics',
  how_i_learn: 'I learn by doing examples, after watching someone do one first.',
}

/** The model echoes the learner's self-label: the verifier must refuse it. */
const labelledCards: ProfileCards = { ...goodCards, how_i_learn: 'An anxious, lazy learner who prefers doing examples.' }

describe('POST /api/me/profile', () => {
  it('re-asks when the cards infer mood or personality, then accepts; nothing personal in the prompt', async () => {
    script.push(okResponse(labelledCards), okResponse(goodCards))
    const learner = await signInAs(ctx.app, 'lerato')
    const res = await origin(request(ctx.app).post('/api/me/profile').set('Cookie', learner)).send(answers)
    expect(res.status).toBe(201)
    expect(res.body.source).toBe('model')
    expect(res.body.cards).toEqual(goodCards)
    expect(res.body.modelRunId).toMatch(/^[0-9a-f-]{36}$/)
    expect(JSON.stringify(res.body)).not.toContain('lazy')
    expect(JSON.stringify(res.body)).not.toContain('anxious')

    expect(scripted.requests).toHaveLength(2)
    const second = scripted.requests[1]?.request.messages[1].content as string
    expect(second).toContain('INFERENCE_FORBIDDEN')
    for (const { request: sent } of scripted.requests) {
      const text = JSON.stringify(sent.messages)
      expect(text).not.toContain('Lerato')
      expect(text).not.toContain('@')
      expect(text).toContain('<<<ANSWER')
    }

    const runs = await ctx.db.execute<{ status: string; attempt_no: number; purpose: string; tier: string; subject_id: string }>(
      `select status, attempt_no, purpose, tier, subject_id from model_runs order by attempt_no`,
    )
    expect(runs.rows.map((r) => [r.status, r.attempt_no, r.purpose, r.tier, r.subject_id])).toEqual([
      ['retried', 1, 'profile_cards', 'standard', SEED_PEOPLE.lerato.id],
      ['accepted', 2, 'profile_cards', 'standard', SEED_PEOPLE.lerato.id],
    ])
    const checks = await ctx.db.execute<{ checks: Array<{ code: string; passed: boolean }> }>(`select checks from model_runs where attempt_no = 1`)
    expect(checks.rows[0]?.checks.find((c) => c.code === 'INFERENCE_FORBIDDEN')?.passed).toBe(false)

    const stored = await ctx.db.execute<{ cards: ProfileCards; cards_source_text: string; cards_model_run_id: string | null }>(
      `select cards, cards_source_text, cards_model_run_id from profiles where user_id = '${SEED_PEOPLE.lerato.id}'`,
    )
    expect(stored.rows[0]?.cards).toEqual(goodCards)
    expect(stored.rows[0]?.cards_source_text).toContain('lazy and anxious')
    expect(stored.rows[0]?.cards_model_run_id).toBe(res.body.modelRunId)

    const events = await ctx.db.execute<{ kind: string; basis: string; payload: { source: string } }>(`select kind, basis, payload from learning_events`)
    expect(events.rows).toEqual([{ kind: 'profile_set', basis: 'none', payload: { source: 'model', model_run: res.body.modelRunId } }])
  })

  it('three refused answers → exhausted: cards empty and labelled uncertain, three runs recorded', async () => {
    script.push(okResponse(labelledCards), okResponse(labelledCards), okResponse(labelledCards))
    const learner = await signInAs(ctx.app, 'thabo')
    const before = scripted.requests.length
    const res = await origin(request(ctx.app).post('/api/me/profile').set('Cookie', learner)).send(answers)
    expect(res.status).toBe(201)
    expect(res.body).toEqual({ cards: { dream: null, subjects: [], hardest_subject: null, how_i_learn: null }, source: 'uncertain', modelRunId: expect.any(String) })
    expect(scripted.requests.length - before).toBe(3)
    const runs = await ctx.db.execute<{ status: string }>(`select status from model_runs where subject_id = '${SEED_PEOPLE.thabo.id}' order by attempt_no`)
    expect(runs.rows.map((r) => r.status)).toEqual(['retried', 'retried', 'exhausted'])
    const audit = await ctx.db.execute<{ outcome: string }>(`select outcome from audit_events where action = 'profile.cards_refused' and actor_id = '${SEED_PEOPLE.thabo.id}'`)
    expect(audit.rows).toEqual([{ outcome: 'refused' }])
  })

  it('refuses an answer holding an email or a phone number before any model call', async () => {
    const learner = await signInAs(ctx.app, 'naledi')
    const before = scripted.requests.length
    for (const bad of [{ dream: 'Write to me at naledi@example.com' }, { howILearn: 'Call 082 123 4567 and ask' }]) {
      const res = await origin(request(ctx.app).post('/api/me/profile').set('Cookie', learner)).send({ ...answers, ...bad })
      expect(res.status).toBe(400)
      expect(res.body.error.code).toBe('personal_data')
    }
    expect(scripted.requests.length).toBe(before)
    const tooLong = await origin(request(ctx.app).post('/api/me/profile').set('Cookie', learner)).send({ ...answers, dream: 'x'.repeat(501) })
    expect(tooLong.status).toBe(400)
    const extra = await origin(request(ctx.app).post('/api/me/profile').set('Cookie', learner)).send({ ...answers, name: 'Real Name' })
    expect(extra.status).toBe(400)
  })

  it('a guardian or teacher cannot set a profile', async () => {
    const guardian = await signInAs(ctx.app, 'mmaLerato')
    expect((await origin(request(ctx.app).post('/api/me/profile').set('Cookie', guardian)).send(answers)).status).toBe(403)
    expect((await request(ctx.app).post('/api/me/profile').send(answers)).status).toBe(401)
  })
})

describe('PATCH /api/me/profile/cards', () => {
  it('edits without a model call; keeps the cards about the work', async () => {
    const learner = await signInAs(ctx.app, 'lerato')
    const before = scripted.requests.length
    const res = await origin(request(ctx.app).patch('/api/me/profile/cards').set('Cookie', learner)).send({ hardest_subject: 'Physical Sciences' })
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ cards: { ...goodCards, hardest_subject: 'Physical Sciences' }, origin: 'model' })
    expect(scripted.requests.length).toBe(before)

    const labelled = await origin(request(ctx.app).patch('/api/me/profile/cards').set('Cookie', learner)).send({ how_i_learn: 'I am a visual learner' })
    expect(labelled.status).toBe(400)
    expect(labelled.body.error.code).toBe('inference_forbidden')
    const unknown = await origin(request(ctx.app).patch('/api/me/profile/cards').set('Cookie', learner)).send({ mood: 'fine' })
    expect(unknown.status).toBe(400)

    const me = await request(ctx.app).get('/api/me/profile').set('Cookie', learner)
    expect(me.body.cards.hardest_subject).toBe('Physical Sciences')
    expect(JSON.stringify(me.body)).not.toContain('lazy')
  })
})

describe('GET /api/learners/:id/cards (spec 03 §8.2)', () => {
  it('serves each role its fields only, never the raw text; unlinked, other class, other school → 404', async () => {
    const lerato = SEED_PEOPLE.lerato.id
    const guardian = await signInAs(ctx.app, 'mmaLerato')
    const asGuardian = await request(ctx.app).get(`/api/learners/${lerato}/cards`).set('Cookie', guardian)
    expect(asGuardian.status).toBe(200)
    expect(asGuardian.body).toEqual({
      learner: { id: lerato, nickname: 'Lerato' },
      cards: { dream: goodCards.dream, subjects: goodCards.subjects },
    })
    expect(JSON.stringify(asGuardian.body)).not.toContain('lazy')
    expect(JSON.stringify(asGuardian.body)).not.toContain('anxious')
    expect(JSON.stringify(asGuardian.body)).not.toContain('how_i_learn')
    expect((await request(ctx.app).get(`/api/learners/${SEED_PEOPLE.thabo.id}/cards`).set('Cookie', guardian)).status).toBe(404)

    const teacher = await signInAs(ctx.app, 'msDlamini')
    const asTeacher = await request(ctx.app).get(`/api/learners/${lerato}/cards`).set('Cookie', teacher)
    expect(asTeacher.body.cards).toEqual({ subjects: goodCards.subjects, hardest_subject: 'Physical Sciences' })
    expect(JSON.stringify(asTeacher.body)).not.toContain('bridges')

    const otherClass = await signInAs(ctx.app, 'mrNaidoo')
    expect((await request(ctx.app).get(`/api/learners/${lerato}/cards`).set('Cookie', otherClass)).status).toBe(404)
    const otherSchool = await signInAs(ctx.app, 'msBotha')
    expect((await request(ctx.app).get(`/api/learners/${lerato}/cards`).set('Cookie', otherSchool)).status).toBe(404)
    const classmate = await signInAs(ctx.app, 'thabo')
    expect((await request(ctx.app).get(`/api/learners/${lerato}/cards`).set('Cookie', classmate)).status).toBe(404)
    const own = await request(ctx.app).get(`/api/learners/${lerato}/cards`).set('Cookie', await signInAs(ctx.app, 'lerato'))
    expect(own.body.cards).toEqual({ ...goodCards, hardest_subject: 'Physical Sciences' })
    expect((await request(ctx.app).get(`/api/learners/not-a-uuid/cards`).set('Cookie', guardian)).status).toBe(404)
  })

  it('the raw text never appears in any response the guardian can reach', async () => {
    const guardian = await signInAs(ctx.app, 'mmaLerato')
    for (const path of ['/api/me', `/api/learners/${SEED_PEOPLE.lerato.id}/cards`, `/api/learners/${SEED_PEOPLE.lerato.id}/brain`, '/api/me/profile', '/api/me/today', '/api/me/brain']) {
      const res = await request(ctx.app).get(path).set('Cookie', guardian)
      expect(res.text).not.toContain('lazy and anxious')
      expect(res.text).not.toContain('cards_source_text')
    }
  })
})

describe('without a model configured', () => {
  it('builds PROTOTYPE cards from the learner’s words and still refuses mood or personality words', async () => {
    const plain = await freshContext()
    try {
      const learner = await signInAs(plain.app, 'sipho')
      const res = await origin(request(plain.app).post('/api/me/profile').set('Cookie', learner)).send({ ...answers, dream: 'Build bridges' })
      expect(res.status).toBe(201)
      expect(res.body).toEqual({
        cards: { dream: 'Build bridges', subjects: ['Maths', 'Physical Sciences', 'English', 'Life Orientation'], hardest_subject: 'Maths', how_i_learn: answers.howILearn },
        source: 'prototype',
        modelRunId: null,
      })
      const refused = await origin(request(plain.app).post('/api/me/profile').set('Cookie', learner)).send(answers)
      expect(refused.body.source).toBe('uncertain')
      expect(refused.body.cards.dream).toBeNull()
      expect((await request(plain.app).get('/api/me/profile').set('Cookie', learner)).body).toEqual({
        cards: { dream: null, subjects: [], hardest_subject: null, how_i_learn: null },
        origin: 'student',
      })
    } finally {
      await plain.close()
    }
  })
})
