import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { seed } from '../../src/db/seed.js'
import { SEED_PEOPLE } from '../../src/db/seed-data.js'
import { TEST_ORIGIN, TEST_PASSWORD, cookieHeader, countRows, freshContext, signInAs, type TestContext } from './db.js'

let ctx: TestContext

beforeAll(async () => {
  ctx = await freshContext()
})
afterAll(async () => {
  await ctx.close()
})

const TABLES = ['user', 'account', 'profiles', 'schools', 'classes', 'class_members', 'guardian_links', 'items', 'guideline_steps', 'guideline_approvals']

describe('seeds', () => {
  it('seeding twice leaves the same row counts and bumps no revision', async () => {
    const before = await Promise.all(TABLES.map((t) => countRows(ctx.db, t)))
    const second = await seed(ctx.db, { password: TEST_PASSWORD })
    const after = await Promise.all(TABLES.map((t) => countRows(ctx.db, t)))
    expect(after).toEqual(before)
    expect(second.items).toEqual({ inserted: 0, updated: 0, unchanged: 2 })
    expect(before[TABLES.indexOf('user')]).toBe(Object.keys(SEED_PEOPLE).length)
    expect(before[TABLES.indexOf('schools')]).toBe(2)
    expect(before[TABLES.indexOf('classes')]).toBe(3)
    expect(before[TABLES.indexOf('class_members')]).toBe(8)
    expect(before[TABLES.indexOf('guideline_approvals')]).toBe(2)
  })

  it('refuses a short seed password', async () => {
    await expect(seed(ctx.db, { password: 'short' })).rejects.toThrow(/SEED_PASSWORD/)
  })
})

describe('sign-up (D19: adults only)', () => {
  const body = { nickname: 'Newbie', email: 'newbie@demo.guardianbook.test', password: 'a-long-password', role: 'learner' }

  it('refuses sign-up without ageAttested: true and writes nothing', async () => {
    const users = await countRows(ctx.db, 'user')
    const profiles = await countRows(ctx.db, 'profiles')
    for (const bad of [{}, { ageAttested: false }, { ageAttested: 'true' }, { ageAttested: 1 }]) {
      const res = await request(ctx.app).post('/api/auth/sign-up/email').set('Origin', TEST_ORIGIN).send({ ...body, ...bad })
      expect(res.status).toBe(400)
      expect(res.body.error.code).toBe('validation')
    }
    expect(await countRows(ctx.db, 'user')).toBe(users)
    expect(await countRows(ctx.db, 'profiles')).toBe(profiles)
  })

  it('refuses role admin and unknown roles', async () => {
    for (const role of ['admin', 'parent', 'superuser']) {
      const res = await request(ctx.app).post('/api/auth/sign-up/email').set('Origin', TEST_ORIGIN).send({ ...body, role, ageAttested: true })
      expect(res.status).toBe(400)
    }
  })

  it('creates the user, credential and profile together, sets a secure cookie and signs in', async () => {
    const res = await request(ctx.app).post('/api/auth/sign-up/email').set('Origin', TEST_ORIGIN).send({ ...body, ageAttested: true })
    expect(res.status).toBe(201)
    expect(res.body.profile).toMatchObject({ role: 'learner', nickname: 'Newbie', schoolId: null })
    expect(typeof res.body.profile.ageAttestedAt).toBe('string')
    const setCookie = ([] as string[]).concat(res.headers['set-cookie'] ?? [])
    const sessionCookie = setCookie.find((line) => line.includes('session_token'))
    expect(sessionCookie).toBeDefined()
    expect(sessionCookie).toMatch(/HttpOnly/i)
    expect(sessionCookie).toMatch(/Secure/i)
    expect(sessionCookie).toMatch(/SameSite=Lax/i)

    const me = await request(ctx.app).get('/api/me').set('Cookie', cookieHeader(setCookie))
    expect(me.status).toBe(200)
    expect(me.body.profile.nickname).toBe('Newbie')
    expect(me.body.user.email).toBe(body.email)

    const audit = await ctx.db.execute<{ n: string }>(`select count(*)::text as n from audit_events where action = 'auth.sign_up'`)
    expect(Number(audit.rows[0]?.n)).toBe(1)
  })

  it('refuses a duplicate email with 409 and the built-in Better Auth sign-up is off', async () => {
    const dup = await request(ctx.app).post('/api/auth/sign-up/email').set('Origin', TEST_ORIGIN).send({ ...body, ageAttested: true })
    expect(dup.status).toBe(409)
    expect(dup.body.error.code).toBe('email_in_use')
  })

  it('rejects an unknown field (no real-name field exists)', async () => {
    const res = await request(ctx.app)
      .post('/api/auth/sign-up/email')
      .set('Origin', TEST_ORIGIN)
      .send({ ...body, email: 'other@demo.guardianbook.test', ageAttested: true, fullName: 'Someone Real' })
    expect(res.status).toBe(400)
  })
})

describe('sessions', () => {
  it('signs a seeded teacher in, reads /api/me with classes, and signs out', async () => {
    const cookie = await signInAs(ctx.app, 'msDlamini')
    const me = await request(ctx.app).get('/api/me').set('Cookie', cookie)
    expect(me.status).toBe(200)
    expect(me.body.profile.role).toBe('teacher')
    expect(me.body.school.name).toBe('Sentinel High (fictional)')
    expect(me.body.classes).toEqual([{ id: expect.any(String), name: '12A', schoolId: expect.any(String), learnerCount: 6 }])

    const out = await request(ctx.app).post('/api/auth/sign-out').set('Cookie', cookie).set('Origin', TEST_ORIGIN)
    expect(out.status).toBe(200)
    const after = await request(ctx.app).get('/api/me').set('Cookie', cookie)
    expect(after.status).toBe(401)
  })

  it('a wrong password is refused', async () => {
    await expect(signInAs(ctx.app, 'lerato', 'not-the-password')).rejects.toThrow(/401/)
  })
})
