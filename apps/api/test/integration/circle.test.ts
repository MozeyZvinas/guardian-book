import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { ContentValidationError, loadContent } from '../../src/content/loader.js'
import { attempts, items } from '../../src/db/schema.js'
import { SEED_PEOPLE, SEED_SCHOOLS } from '../../src/db/seed-data.js'
import { TEST_ORIGIN, countRows, freshContext, signInAs, type TestContext } from './db.js'

let ctx: TestContext

beforeAll(async () => {
  ctx = await freshContext()
})
afterAll(async () => {
  await ctx.close()
})

const origin = (req: request.Test) => req.set('Origin', TEST_ORIGIN)

describe('the circle', () => {
  it('a teacher creates a class, a learner joins with the code; the code is stored hashed', async () => {
    const teacher = await signInAs(ctx.app, 'msDlamini')
    const created = await origin(request(ctx.app).post('/api/teacher/classes').set('Cookie', teacher)).send({ name: '12C' })
    expect(created.status).toBe(201)
    expect(created.body.code).toMatch(/^[A-Z2-9]{8}$/)
    expect(created.body.class).toMatchObject({ name: '12C', schoolId: SEED_SCHOOLS.sentinel.id, learnerCount: 0 })

    const stored = await ctx.db.execute<{ code_hash: string }>(`select code_hash from classes where name = '12C'`)
    expect(stored.rows[0]?.code_hash).not.toContain(created.body.code)
    expect(stored.rows[0]?.code_hash).toHaveLength(64)

    const learner = await signInAs(ctx.app, 'thabo')
    const typed = created.body.code.toLowerCase().replace(/(.{4})/, '$1 ') // forgiving input
    const joined = await origin(request(ctx.app).post('/api/learner/join').set('Cookie', learner)).send({ code: typed })
    expect(joined.status).toBe(200)
    expect(joined.body).toEqual({ class: { id: created.body.class.id, name: '12C' }, alreadyMember: false })
    const again = await origin(request(ctx.app).post('/api/learner/join').set('Cookie', learner)).send({ code: created.body.code })
    expect(again.body.alreadyMember).toBe(true)

    const me = await request(ctx.app).get('/api/me').set('Cookie', learner)
    expect(me.body.memberships.map((m: { name: string }) => m.name).sort()).toEqual(['12A', '12C'])

    // A Riverside learner cannot join a Sentinel class: 404, no membership, school unchanged.
    const riverside = await signInAs(ctx.app, 'anele')
    const cross = await origin(request(ctx.app).post('/api/learner/join').set('Cookie', riverside)).send({ code: created.body.code })
    expect(cross.status).toBe(404)
    const anele = await request(ctx.app).get('/api/me').set('Cookie', riverside)
    expect(anele.body.profile.schoolId).toBe(SEED_SCHOOLS.riverside.id)
    expect(anele.body.memberships).toHaveLength(1)
  })

  it('a new teacher needs a school for the first class, then takes it', async () => {
    const signUp = await origin(request(ctx.app).post('/api/auth/sign-up/email')).send({
      nickname: 'Mr New',
      email: 'mr-new@demo.guardianbook.test',
      password: 'a-long-password',
      role: 'teacher',
      ageAttested: true,
    })
    expect(signUp.status).toBe(201)
    const cookie = ([] as string[]).concat(signUp.headers['set-cookie'] ?? []).map((l) => l.split(';')[0]).join('; ')

    const noSchool = await origin(request(ctx.app).post('/api/teacher/classes').set('Cookie', cookie)).send({ name: '9A' })
    expect(noSchool.status).toBe(400)
    expect(noSchool.body.error.code).toBe('school_required')

    const schools = await request(ctx.app).get('/api/schools').set('Cookie', cookie)
    expect(schools.status).toBe(200)
    expect(schools.body.schools.map((s: { name: string }) => s.name)).toEqual([
      'Riverside Secondary (fictional)',
      'Sentinel High (fictional)',
    ])

    const created = await origin(request(ctx.app).post('/api/teacher/classes').set('Cookie', cookie)).send({
      name: '9A',
      schoolId: SEED_SCHOOLS.riverside.id,
    })
    expect(created.status).toBe(201)
    const me = await request(ctx.app).get('/api/me').set('Cookie', cookie)
    expect(me.body.profile.schoolId).toBe(SEED_SCHOOLS.riverside.id)

    // From now on the teacher is bound to Riverside.
    const other = await origin(request(ctx.app).post('/api/teacher/classes').set('Cookie', cookie)).send({
      name: '9B',
      schoolId: SEED_SCHOOLS.sentinel.id,
    })
    expect(other.status).toBe(404)
  })

  it('a learner issues a guardian code (rotating, hashed, 7 days); a guardian links; the learner revokes', async () => {
    const learner = await signInAs(ctx.app, 'naledi')
    const first = await origin(request(ctx.app).post('/api/me/guardian-code').set('Cookie', learner))
    expect(first.status).toBe(201)
    expect(first.body.code).toMatch(/^[A-Z2-9]{8}$/)
    const expires = new Date(first.body.expiresAt).getTime() - Date.now()
    expect(expires).toBeGreaterThan(6.9 * 24 * 3600 * 1000)
    expect(expires).toBeLessThan(7.1 * 24 * 3600 * 1000)

    const second = await origin(request(ctx.app).post('/api/me/guardian-code').set('Cookie', learner))
    expect(second.body.code).not.toBe(first.body.code)
    expect(await countRows(ctx.db, 'guardian_invite_codes')).toBe(1)

    const guardian = await signInAs(ctx.app, 'mmaLerato')
    const stale = await origin(request(ctx.app).post('/api/guardian/link').set('Cookie', guardian)).send({ code: first.body.code })
    expect(stale.status).toBe(404) // rotated away

    const linked = await origin(request(ctx.app).post('/api/guardian/link').set('Cookie', guardian)).send({ code: second.body.code })
    expect(linked.status).toBe(200)
    expect(linked.body).toEqual({ learner: { id: SEED_PEOPLE.naledi.id, nickname: 'Naledi' }, alreadyLinked: false })
    const twice = await origin(request(ctx.app).post('/api/guardian/link').set('Cookie', guardian)).send({ code: second.body.code })
    expect(twice.body.alreadyLinked).toBe(true)

    const guardianMe = await request(ctx.app).get('/api/me').set('Cookie', guardian)
    expect(guardianMe.body.learners.map((l: { nickname: string }) => l.nickname).sort()).toEqual(['Lerato', 'Naledi'])
    // The guardian view carries nicknames only: no email, no work, no images.
    expect(JSON.stringify(guardianMe.body.learners)).not.toContain('@')

    const learnerMe = await request(ctx.app).get('/api/me').set('Cookie', learner)
    expect(learnerMe.body.guardians).toEqual([{ guardianId: SEED_PEOPLE.mmaLerato.id, nickname: 'Mma Lerato', linkedAt: expect.any(String) }])

    const revoked = await origin(request(ctx.app).delete(`/api/me/guardians/${SEED_PEOPLE.mmaLerato.id}`).set('Cookie', learner))
    expect(revoked.status).toBe(204)
    const afterRevoke = await request(ctx.app).get('/api/me').set('Cookie', guardian)
    expect(afterRevoke.body.learners.map((l: { nickname: string }) => l.nickname)).toEqual(['Lerato'])
    const revokeAgain = await origin(request(ctx.app).delete(`/api/me/guardians/${SEED_PEOPLE.mmaLerato.id}`).set('Cookie', learner))
    expect(revokeAgain.status).toBe(404)

    // Re-linking after a revoke works (same PK row, revoked_at cleared).
    const relinked = await origin(request(ctx.app).post('/api/guardian/link').set('Cookie', guardian)).send({ code: second.body.code })
    expect(relinked.status).toBe(200)
    expect(relinked.body.alreadyLinked).toBe(false)

    const audit = await ctx.db.execute<{ action: string; n: string }>(
      `select action, count(*)::text as n from audit_events where action like 'circle.%' group by action order by action`,
    )
    const counts = Object.fromEntries(audit.rows.map((r) => [r.action, Number(r.n)]))
    expect(counts['circle.guardian_code_issued']).toBe(2)
    expect(counts['circle.guardian_linked']).toBeGreaterThanOrEqual(3)
    expect(counts['circle.guardian_revoked']).toBe(1)
  })
})

describe('items and the guideline rule', () => {
  it('serves approved items; guideline steps only after the learner’s own attempt', async () => {
    const learner = await signInAs(ctx.app, 'sipho')
    const list = await request(ctx.app).get('/api/items').set('Cookie', learner)
    expect(list.status).toBe(200)
    expect(list.body.items.map((i: { slug: string }) => i.slug)).toEqual(['alg-12-factorise-trinomial', 'alg-12-nature-of-roots'])
    expect(JSON.stringify(list.body)).not.toContain('guidelineSteps')

    const itemId = list.body.items[0].id
    const before = await request(ctx.app).get(`/api/items/${itemId}`).set('Cookie', learner)
    expect(before.status).toBe(200)
    expect(before.body.item.promptMd).toContain('x^2')
    expect(before.body.item.guidelineSteps).toBeUndefined()

    // A classmate's attempt does not unlock it for Sipho.
    const [item] = await ctx.db.select({ id: items.id, revision: items.revision }).from(items).where(undefined).limit(1)
    await ctx.db.insert(attempts).values({
      learnerId: SEED_PEOPLE.thabo.id,
      itemId,
      itemRevision: item?.revision ?? 1,
      kind: 'typed',
      answerText: 'working',
      idempotencyKey: 'thabo-1',
      provenance: 'student_provided',
    })
    const stillHidden = await request(ctx.app).get(`/api/items/${itemId}`).set('Cookie', learner)
    expect(stillHidden.body.item.guidelineSteps).toBeUndefined()

    await ctx.db.insert(attempts).values({
      learnerId: SEED_PEOPLE.sipho.id,
      itemId,
      itemRevision: item?.revision ?? 1,
      kind: 'typed',
      answerText: 'working',
      idempotencyKey: 'sipho-1',
      provenance: 'student_provided',
    })
    const after = await request(ctx.app).get(`/api/items/${itemId}`).set('Cookie', learner)
    expect(after.body.item.guidelineSteps).toHaveLength(4)
    expect(after.body.item.guidelineSteps[0]).toMatchObject({ stepNo: 1, stepType: 'M', marks: 1 })

    // The class teacher sees them (a learner in her class attempted it); the 11B teacher does not.
    const dlamini = await signInAs(ctx.app, 'msDlamini')
    const teacherView = await request(ctx.app).get(`/api/items/${itemId}`).set('Cookie', dlamini)
    expect(teacherView.body.item.guidelineSteps).toHaveLength(4)
    const naidoo = await signInAs(ctx.app, 'mrNaidoo')
    const otherTeacher = await request(ctx.app).get(`/api/items/${itemId}`).set('Cookie', naidoo)
    expect(otherTeacher.body.item.guidelineSteps).toBeUndefined()
    // A guardian never sees them, even for a linked learner.
    const guardian = await signInAs(ctx.app, 'mmaLerato')
    const guardianView = await request(ctx.app).get(`/api/items/${itemId}`).set('Cookie', guardian)
    expect(guardianView.status).toBe(200)
    expect(guardianView.body.item.guidelineSteps).toBeUndefined()
  })
})

describe('content loader', () => {
  it('refuses a directory with a marks-sum error and loads nothing', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'gb-content-'))
    try {
      const good = {
        slug: 'loader-good',
        topic: 'Algebra',
        skill_tags: ['exponents'],
        prompt_md: 'Simplify $2^3 \\cdot 2^2$.',
        max_marks: 2,
        author: 'test',
        reviewer: 'pending',
        source: 'original',
        provenance: 'original_human',
        guideline_steps: [
          { step_no: 1, step_type: 'M', criterion: 'adds exponents', marks: 1, skill_tag: 'exponents' },
          { step_no: 2, step_type: 'A', criterion: '32', marks: 1, skill_tag: 'exponents' },
        ],
      }
      writeFileSync(path.join(dir, 'good.json'), JSON.stringify(good))
      writeFileSync(path.join(dir, 'bad.json'), JSON.stringify({ ...good, slug: 'loader-bad', max_marks: 5 }))

      const before = await countRows(ctx.db, 'items')
      await expect(loadContent(ctx.db, dir)).rejects.toBeInstanceOf(ContentValidationError)
      await loadContent(ctx.db, dir).catch((err: ContentValidationError) => {
        expect(err.problems.some((p) => p.file.endsWith('bad.json') && /sum to 2 but max_marks is 5/.test(p.message))).toBe(true)
      })
      expect(await countRows(ctx.db, 'items')).toBe(before)

      rmSync(path.join(dir, 'bad.json'))
      const report = await loadContent(ctx.db, dir)
      expect(report.inserted).toEqual(['loader-good'])
      expect(await countRows(ctx.db, 'items')).toBe(before + 1)

      // A changed guideline bumps the revision and replaces the steps; unchanged is a no-op.
      const same = await loadContent(ctx.db, dir)
      expect(same.unchanged).toEqual(['loader-good'])
      writeFileSync(path.join(dir, 'good.json'), JSON.stringify({ ...good, prompt_md: 'Simplify $2^3 \\times 2^2$.' }))
      const bumped = await loadContent(ctx.db, dir)
      expect(bumped.updated).toEqual(['loader-good'])
      const row = await ctx.db.execute<{ revision: number }>(`select revision from items where slug = 'loader-good'`)
      expect(row.rows[0]?.revision).toBe(2)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('refuses a missing directory', async () => {
    await expect(loadContent(ctx.db, '/nonexistent/gb-content')).rejects.toBeInstanceOf(ContentValidationError)
  })
})
