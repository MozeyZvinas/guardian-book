import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { guidelineApprovals, items } from '../../src/db/schema.js'
import { SEED_CLASSES, SEED_PEOPLE, SEED_SCHOOLS } from '../../src/db/seed-data.js'
import { capLimits, checkCaps, recordUsage } from '../../src/modelRuns/caps.js'
import { TEST_ORIGIN, TEST_PASSWORD, cookieHeader, freshContext, signInAs, type TestContext } from './db.js'

/**
 * B09: the public "Try it" path. A judge signs up as a learner through /try and lands in
 * the seeded try-it class (decided server-side from PUBLIC_TRY_CLASS_CODE); the class's
 * teacher has no usable login; try-it learners carry a tighter daily model-call cap; the
 * items list shows the question and puts the learner's approved items first.
 */

let ctx: TestContext

beforeAll(async () => {
  ctx = await freshContext({ env: { TRY_USER_DAILY_CALLS: '2' } })
})
afterAll(async () => {
  await ctx.close()
})

const signUp = (body: Record<string, unknown>) => request(ctx.app).post('/api/auth/sign-up/email').set('Origin', TEST_ORIGIN).send(body)
const judge = { nickname: 'Judge', email: 'judge@demo.guardianbook.test', password: 'try-it-password-1', role: 'learner', ageAttested: true, tryClass: true }

describe('/try (B09)', () => {
  it('GET /api/try is public and names the class, never the code', async () => {
    const res = await request(ctx.app).get('/api/try')
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ available: true, className: 'Try it (fictional)' })
    expect(JSON.stringify(res.body)).not.toContain(ctx.seeded.classCodes.try)
  })

  it('the try-it class teacher cannot sign in with the seed password', async () => {
    await expect(signInAs(ctx.app, 'tryTeacher')).rejects.toThrow(/sign-in as tryTeacher failed: 401/)
    await expect(signInAs(ctx.app, 'msDlamini')).resolves.toBeTruthy()
  })

  it('a learner signing up through /try joins the try-it class, takes its school, and is audited', async () => {
    const res = await signUp(judge)
    expect(res.status).toBe(201)
    expect(res.body.joinedClass).toEqual({ id: SEED_CLASSES.try.id, name: 'Try it (fictional)' })
    expect(res.body.profile.schoolId).toBe(SEED_SCHOOLS.sentinel.id)

    const cookie = cookieHeader(([] as string[]).concat(res.headers['set-cookie'] ?? []))
    const me = await request(ctx.app).get('/api/me').set('Cookie', cookie)
    expect(me.status).toBe(200)
    expect(me.body.memberships).toEqual([{ classId: SEED_CLASSES.try.id, name: 'Try it (fictional)' }])

    const audit = await ctx.db.execute<{ n: string }>(`select count(*)::text as n from audit_events where action = 'circle.class_joined' and outcome = 'ok'`)
    expect(Number(audit.rows[0]?.n)).toBe(1)

    // Every seed item is approved for the try-it class: the picker can start a check on any of them.
    const list = await request(ctx.app).get('/api/items').set('Cookie', cookie)
    expect(list.status).toBe(200)
    expect(list.body.items).toHaveLength(3)
    for (const item of list.body.items) {
      expect(item.approvedForYou).toBe(true)
      expect(typeof item.promptMd).toBe('string')
      expect(item.promptMd.length).toBeGreaterThan(0)
    }
  })

  it('tryClass without the learner role joins nothing and still signs up', async () => {
    const res = await signUp({ ...judge, email: 'judge-teacher@demo.guardianbook.test', role: 'teacher' })
    expect(res.status).toBe(201)
    expect(res.body.joinedClass).toBeNull()
    expect(res.body.profile.schoolId).toBeNull()
  })

  it('a plain sign-up (no tryClass) joins nothing', async () => {
    const res = await signUp({ ...judge, email: 'plain@demo.guardianbook.test', tryClass: undefined })
    expect(res.status).toBe(201)
    expect(res.body.joinedClass).toBeNull()
  })

  it('a try-it learner is capped at TRY_USER_DAILY_CALLS; a 12A learner keeps the user cap', async () => {
    const [row] = await ctx.db.execute<{ id: string }>(`select user_id as id from profiles where nickname = 'Judge' and role = 'learner'`).then((r) => r.rows)
    expect(row).toBeDefined()
    const judgeId = row!.id
    const limits = capLimits({ userDailyCalls: 60, dailyBudgetUsd: 5 }, { classCode: ctx.seeded.classCodes.try, userDailyCalls: 2 })
    const now = new Date()
    expect(await checkCaps(ctx.db, judgeId, limits, now)).toEqual({ ok: true, remainingCalls: 2 })
    await recordUsage(ctx.db, { userId: judgeId, calls: 2, costUsd: 0.02, now })
    await recordUsage(ctx.db, { userId: SEED_PEOPLE.lerato.id, calls: 2, costUsd: 0.02, now })
    expect(await checkCaps(ctx.db, judgeId, limits, now)).toEqual({ ok: false, reason: 'user_calls' })
    expect(await checkCaps(ctx.db, SEED_PEOPLE.lerato.id, limits, now)).toEqual({ ok: true, remainingCalls: 58 })
  })

  it('the items list puts a learner’s approved items first and flags the rest', async () => {
    // Bongani (11B): nothing approved yet → every item flagged false, slug order.
    const bongani = await signInAs(ctx.app, 'bongani')
    const before = await request(ctx.app).get('/api/items').set('Cookie', bongani)
    expect(before.body.items.map((i: { approvedForYou: boolean }) => i.approvedForYou)).toEqual([false, false, false])
    expect(before.body.items.map((i: { slug: string }) => i.slug)).toEqual(['alg-12-factorise-trinomial', 'alg-12-factorise-trinomial-2', 'alg-12-nature-of-roots'])

    // Mr Naidoo approves the last item for 11B: it moves to the front.
    const target = (await ctx.db.select({ id: items.id, revision: items.revision, slug: items.slug }).from(items)).find((i) => i.slug === 'alg-12-nature-of-roots')
    await ctx.db.insert(guidelineApprovals).values({ classId: SEED_CLASSES['11B'].id, itemId: target!.id, itemRevision: target!.revision, approvedBy: SEED_PEOPLE.mrNaidoo.id })
    const after = await request(ctx.app).get('/api/items').set('Cookie', bongani)
    expect(after.body.items.map((i: { slug: string; approvedForYou: boolean }) => [i.slug, i.approvedForYou])).toEqual([
      ['alg-12-nature-of-roots', true],
      ['alg-12-factorise-trinomial', false],
      ['alg-12-factorise-trinomial-2', false],
    ])

    // A teacher's list carries no flag.
    const teacher = await signInAs(ctx.app, 'msDlamini', TEST_PASSWORD)
    const teacherList = await request(ctx.app).get('/api/items').set('Cookie', teacher)
    expect(teacherList.body.items.every((i: { approvedForYou?: boolean }) => i.approvedForYou === undefined)).toBe(true)
  })
})
