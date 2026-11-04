import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { can } from '../src/access/index.js'
import { attempts, items } from '../src/db/schema.js'
import { SEED_CLASSES, SEED_PEOPLE, SEED_SCHOOLS, type SeedPersonKey } from '../src/db/seed-data.js'
import { PRIVACY_HARNESS_VERSION, writePrivacyHarness } from '../src/evals/privacyHarness.js'
import { freshContext, signInAs, type TestContext } from './integration/db.js'

/**
 * The permission harness (spec 03 §4, §8.2, §9.2; spec 04 §4): every "change the ID"
 * case for the routes that exist, as a table. Later briefs ADD ROWS here, not files.
 *
 * Conventions: no session → 401; wrong role → 403; wrong object (another learner, class,
 * guardian or school) → 404, so the ID is never confirmed.
 */

type Method = 'get' | 'post' | 'delete' | 'patch'

interface HarnessCase {
  name: string
  as: SeedPersonKey | null
  method: Method
  path: string
  body?: Record<string, unknown>
  expect: number
}

const P = SEED_PEOPLE
const C = SEED_CLASSES

const CASES: HarnessCase[] = [
  // ── no session → 401 ─────────────────────────────────────────────────────────────────
  { name: 'anonymous reads /api/me', as: null, method: 'get', path: '/api/me', expect: 401 },
  { name: 'anonymous lists items', as: null, method: 'get', path: '/api/items', expect: 401 },
  { name: 'anonymous creates a class', as: null, method: 'post', path: '/api/teacher/classes', body: { name: 'X' }, expect: 401 },
  { name: 'anonymous joins a class', as: null, method: 'post', path: '/api/learner/join', body: { code: 'ABCDEFGH' }, expect: 401 },
  { name: 'anonymous links a guardian', as: null, method: 'post', path: '/api/guardian/link', body: { code: 'ABCDEFGH' }, expect: 401 },
  { name: 'anonymous lists schools', as: null, method: 'get', path: '/api/schools', expect: 401 },

  // ── wrong role → 403 ─────────────────────────────────────────────────────────────────
  { name: 'learner → POST /api/teacher/classes', as: 'lerato', method: 'post', path: '/api/teacher/classes', body: { name: 'X' }, expect: 403 },
  { name: 'learner → GET /api/teacher/classes/:id (own class)', as: 'lerato', method: 'get', path: `/api/teacher/classes/${C['12A'].id}`, expect: 403 },
  { name: 'guardian → POST /api/learner/join', as: 'mmaLerato', method: 'post', path: '/api/learner/join', body: { code: 'ABCDEFGH' }, expect: 403 },
  { name: 'guardian → POST /api/me/guardian-code', as: 'mmaLerato', method: 'post', path: '/api/me/guardian-code', expect: 403 },
  { name: 'guardian → DELETE /api/me/guardians/:id', as: 'mmaLerato', method: 'delete', path: `/api/me/guardians/${P.mmaLerato.id}`, expect: 403 },
  { name: 'teacher → POST /api/learner/join', as: 'msDlamini', method: 'post', path: '/api/learner/join', body: { code: 'ABCDEFGH' }, expect: 403 },
  { name: 'teacher → POST /api/guardian/link', as: 'msDlamini', method: 'post', path: '/api/guardian/link', body: { code: 'ABCDEFGH' }, expect: 403 },
  { name: 'learner → POST /api/guardian/link', as: 'lerato', method: 'post', path: '/api/guardian/link', body: { code: 'ABCDEFGH' }, expect: 403 },

  // ── wrong object → 404 ───────────────────────────────────────────────────────────────
  { name: 'learner A revokes learner B’s guardian', as: 'thabo', method: 'delete', path: `/api/me/guardians/${P.mmaLerato.id}`, expect: 404 },
  { name: 'learner revokes a guardian that is not linked', as: 'lerato', method: 'delete', path: `/api/me/guardians/${P.msBotha.id}`, expect: 404 },
  { name: 'learner revokes with a non-UUID id', as: 'lerato', method: 'delete', path: '/api/me/guardians/not-a-uuid', expect: 404 },
  { name: 'teacher 11B → class 12A', as: 'mrNaidoo', method: 'get', path: `/api/teacher/classes/${C['12A'].id}`, expect: 404 },
  { name: 'teacher 12A → class 11B', as: 'msDlamini', method: 'get', path: `/api/teacher/classes/${C['11B'].id}`, expect: 404 },
  { name: 'teacher → unknown class', as: 'msDlamini', method: 'get', path: '/api/teacher/classes/019a0b02-0000-7000-8000-00000000c999', expect: 404 },
  { name: 'guardian → an unknown invite code', as: 'mmaLerato', method: 'post', path: '/api/guardian/link', body: { code: 'ABCDEFGH' }, expect: 404 },
  { name: 'learner → an unknown class code', as: 'lerato', method: 'post', path: '/api/learner/join', body: { code: 'ABCDEFGH' }, expect: 404 },
  { name: 'anyone → an unapproved or unknown item', as: 'lerato', method: 'get', path: '/api/items/019a0b02-0000-7000-8000-0000000fffff', expect: 404 },

  // ── another school → 404 (spec 03 §9.2) ──────────────────────────────────────────────
  { name: 'Riverside teacher → Sentinel class 12A', as: 'msBotha', method: 'get', path: `/api/teacher/classes/${C['12A'].id}`, expect: 404 },
  { name: 'Riverside teacher → Sentinel class 11B', as: 'msBotha', method: 'get', path: `/api/teacher/classes/${C['11B'].id}`, expect: 404 },
  { name: 'Sentinel teacher → Riverside class 10C', as: 'msDlamini', method: 'get', path: `/api/teacher/classes/${C['10C'].id}`, expect: 404 },
  { name: 'Sentinel teacher creates a class in Riverside', as: 'msDlamini', method: 'post', path: '/api/teacher/classes', body: { name: '12B', schoolId: SEED_SCHOOLS.riverside.id }, expect: 404 },

  // ── B06: the plan, "We did it", fix it (spec 03 §8.2 "change the ID" rows) ───────────
  { name: 'anonymous reads their plan', as: null, method: 'get', path: '/api/me/plan', expect: 401 },
  { name: 'guardian → GET /api/me/plan (learner route)', as: 'mmaLerato', method: 'get', path: '/api/me/plan', expect: 403 },
  { name: 'learner → a guardian’s week', as: 'lerato', method: 'get', path: `/api/guardian/learners/${P.lerato.id}/plan`, expect: 403 },
  { name: 'guardian → an unlinked learner’s plan', as: 'mmaLerato', method: 'get', path: `/api/guardian/learners/${P.thabo.id}/plan`, expect: 404 },
  { name: 'guardian → We did it on an unlinked learner', as: 'mmaLerato', method: 'post', path: `/api/guardian/learners/${P.thabo.id}/plan/done`, expect: 404 },
  { name: 'guardian → an unknown learner id', as: 'mmaLerato', method: 'get', path: '/api/guardian/learners/019a0b02-0000-7000-8000-00000000ffff/plan', expect: 404 },
  { name: 'guardian → the linked learner’s week (no plan yet)', as: 'mmaLerato', method: 'get', path: `/api/guardian/learners/${P.lerato.id}/plan`, expect: 200 },
  { name: 'guardian → We did it with no plan yet', as: 'mmaLerato', method: 'post', path: `/api/guardian/learners/${P.lerato.id}/plan/done`, expect: 409 },
  { name: 'learner → fix an unknown attempt', as: 'lerato', method: 'post', path: '/api/attempts/019a0b02-0000-7000-8000-00000000ffff/fix', body: { answerText: 'x = 2' }, expect: 404 },
  { name: 'guardian → fix an attempt (wrong role)', as: 'mmaLerato', method: 'post', path: '/api/attempts/019a0b02-0000-7000-8000-00000000ffff/fix', body: { answerText: 'x' }, expect: 403 },
  { name: 'learner reads their plan (none yet)', as: 'lerato', method: 'get', path: '/api/me/plan', expect: 200 },
  { name: 'learner asks for a check-alone item', as: 'lerato', method: 'get', path: '/api/me/check-alone?skill=factorise-trinomial&mode=independent', expect: 200 },
  { name: 'learner asks for a check-alone item with a bad mode', as: 'lerato', method: 'get', path: '/api/me/check-alone?skill=factorise-trinomial&mode=assisted', expect: 400 },
  // ── B07: the teacher space (spec 03 §9.2) ────────────────────────────────────────────
  { name: 'anonymous → class guidelines', as: null, method: 'get', path: `/api/teacher/classes/${C['12A'].id}/guidelines`, expect: 401 },
  { name: 'learner → class guidelines', as: 'lerato', method: 'get', path: `/api/teacher/classes/${C['12A'].id}/guidelines`, expect: 403 },
  { name: 'guardian → the queue', as: 'mmaLerato', method: 'get', path: `/api/teacher/queue?classId=${C['12A'].id}`, expect: 403 },
  { name: 'learner → class picture', as: 'lerato', method: 'get', path: `/api/teacher/classes/${C['12A'].id}/picture`, expect: 403 },
  { name: 'learner → POST /api/teacher/interventions', as: 'lerato', method: 'post', path: '/api/teacher/interventions', body: { learnerId: P.lerato.id, classId: C['12A'].id, skillTag: 'x', action: 'x', followUpOn: '2026-11-10' }, expect: 403 },
  { name: 'teacher → GET /api/guardian/notes', as: 'msDlamini', method: 'get', path: '/api/guardian/notes', expect: 403 },
  { name: 'teacher 11B → class 12A guidelines', as: 'mrNaidoo', method: 'get', path: `/api/teacher/classes/${C['12A'].id}/guidelines`, expect: 404 },
  { name: 'teacher 11B → class 12A picture', as: 'mrNaidoo', method: 'get', path: `/api/teacher/classes/${C['12A'].id}/picture`, expect: 404 },
  { name: 'teacher 11B → class 12A queue', as: 'mrNaidoo', method: 'get', path: `/api/teacher/queue?classId=${C['12A'].id}`, expect: 404 },
  { name: 'teacher 11B → class 12A interventions', as: 'mrNaidoo', method: 'get', path: `/api/teacher/classes/${C['12A'].id}/interventions`, expect: 404 },
  { name: 'teacher 11B → class 12A notes', as: 'mrNaidoo', method: 'get', path: `/api/teacher/notes?classId=${C['12A'].id}`, expect: 404 },
  { name: 'teacher 11B → a 12A learner’s profile', as: 'mrNaidoo', method: 'get', path: `/api/teacher/learners/${P.lerato.id}`, expect: 404 },
  { name: 'teacher 11B → a note for a 12A learner', as: 'mrNaidoo', method: 'post', path: '/api/teacher/notes', body: { learnerId: P.lerato.id, text: 'x' }, expect: 404 },
  { name: 'Riverside teacher → Sentinel 12A guidelines', as: 'msBotha', method: 'get', path: `/api/teacher/classes/${C['12A'].id}/guidelines`, expect: 404 },
  { name: 'Riverside teacher → Sentinel 12A picture', as: 'msBotha', method: 'get', path: `/api/teacher/classes/${C['12A'].id}/picture`, expect: 404 },
  { name: 'Riverside teacher → a Sentinel learner’s profile', as: 'msBotha', method: 'get', path: `/api/teacher/learners/${P.lerato.id}`, expect: 404 },
  { name: 'Riverside teacher → an intervention for a Sentinel learner', as: 'msBotha', method: 'post', path: '/api/teacher/interventions', body: { learnerId: P.lerato.id, classId: C['12A'].id, skillTag: 'x', action: 'x', followUpOn: '2026-11-10' }, expect: 404 },
  { name: 'teacher → unknown review release', as: 'msDlamini', method: 'post', path: '/api/teacher/reviews/019a0b02-0000-7000-8000-00000000f999/release', body: { version: 1 }, expect: 404 },
  { name: 'teacher → unknown intervention', as: 'msDlamini', method: 'patch', path: '/api/teacher/interventions/019a0b02-0000-7000-8000-00000000f999', body: { action: 'x' }, expect: 404 },
  { name: 'guardian → unknown note', as: 'mmaLerato', method: 'get', path: '/api/guardian/notes/019a0b02-0000-7000-8000-00000000f999', expect: 404 },
  { name: 'teacher 12A reads 12A guidelines', as: 'msDlamini', method: 'get', path: `/api/teacher/classes/${C['12A'].id}/guidelines`, expect: 200 },
  { name: 'teacher 12A reads the 12A picture', as: 'msDlamini', method: 'get', path: `/api/teacher/classes/${C['12A'].id}/picture`, expect: 200 },
  { name: 'teacher 12A reads a 12A learner’s profile', as: 'msDlamini', method: 'get', path: `/api/teacher/learners/${P.lerato.id}`, expect: 200 },
  { name: 'guardian lists sent notes', as: 'mmaLerato', method: 'get', path: '/api/guardian/notes', expect: 200 },

  // ── the happy rows the denials are measured against ──────────────────────────────────
  { name: 'teacher 12A reads class 12A', as: 'msDlamini', method: 'get', path: `/api/teacher/classes/${C['12A'].id}`, expect: 200 },
  { name: 'teacher 11B reads class 11B', as: 'mrNaidoo', method: 'get', path: `/api/teacher/classes/${C['11B'].id}`, expect: 200 },
  { name: 'Riverside teacher reads class 10C', as: 'msBotha', method: 'get', path: `/api/teacher/classes/${C['10C'].id}`, expect: 200 },
  { name: 'learner revokes their linked guardian', as: 'lerato', method: 'delete', path: `/api/me/guardians/${P.mmaLerato.id}`, expect: 204 },
  { name: 'learner lists items', as: 'lerato', method: 'get', path: '/api/items', expect: 200 },
  { name: 'guardian lists items', as: 'mmaLerato', method: 'get', path: '/api/items', expect: 200 },
]

let ctx: TestContext
const cookies = new Map<SeedPersonKey, string>()
/** Rows (by index) whose assertions all held; the rest count as failed in the privacy suite. */
const passedRows = new Set<number>()

async function cookieFor(who: SeedPersonKey | null): Promise<string | null> {
  if (!who) return null
  let cookie = cookies.get(who)
  if (!cookie) {
    cookie = await signInAs(ctx.app, who)
    cookies.set(who, cookie)
  }
  return cookie
}

beforeAll(async () => {
  ctx = await freshContext()
})
afterAll(async () => {
  await ctx.close()
  // The proof page's privacy suite (B08) counts these rows from this file; never the test output.
  await writePrivacyHarness({
    schema_version: PRIVACY_HARNESS_VERSION,
    ran_at: new Date().toISOString(),
    rows: CASES.map((c, index) => ({ name: c.name, expect: c.expect, passed: passedRows.has(index) })),
  })
})

describe('permission harness (routes)', () => {
  // Rows run in order: the 204 revoke at the end depends on the earlier 404s not touching data.
  for (const [index, c] of CASES.entries()) {
    it(`${c.name} → ${c.expect}`, async () => {
      const cookie = await cookieFor(c.as)
      let req = request(ctx.app)[c.method](c.path).set('Origin', 'https://guardianbook.test')
      if (cookie) req = req.set('Cookie', cookie)
      if (c.body) req = req.send(c.body)
      const res = await req
      expect(res.status, JSON.stringify(res.body)).toBe(c.expect)
      if (res.status >= 400) {
        expect(res.body).toMatchObject({ error: { code: expect.any(String), message: expect.any(String) } })
      }
      passedRows.add(index)
    })
  }
})

describe('permission harness (resolvers the later briefs call)', () => {
  it('attempts: owner and class teacher only; never a guardian, another class or another school', async () => {
    const { db } = ctx
    const [item] = await db.select({ id: items.id, revision: items.revision }).from(items).limit(1)
    if (!item) throw new Error('no item')
    const [attempt] = await db
      .insert(attempts)
      .values({
        learnerId: P.lerato.id,
        itemId: item.id,
        itemRevision: item.revision,
        kind: 'typed',
        answerText: 'x = 2 or x = 3',
        idempotencyKey: 'harness-1',
        provenance: 'student_provided',
      })
      .returning({ id: attempts.id })
    if (!attempt) throw new Error('no attempt')
    const subject = (who: SeedPersonKey) => ({
      userId: P[who].id,
      role: P[who].role,
      schoolId: P[who].school ? SEED_SCHOOLS[P[who].school].id : null,
    })
    const resource = { type: 'attempt', id: attempt.id } as const

    expect(await can(db, subject('lerato'), 'attempt.read', resource)).toBe(true)
    expect(await can(db, subject('msDlamini'), 'attempt.read', resource)).toBe(true)
    expect(await can(db, subject('thabo'), 'attempt.read', resource)).toBe(false) // classmate
    expect(await can(db, subject('mrNaidoo'), 'attempt.read', resource)).toBe(false) // other class
    expect(await can(db, subject('msBotha'), 'attempt.read', resource)).toBe(false) // other school
    expect(await can(db, subject('mmaLerato'), 'attempt.read', resource)).toBe(false) // guardians never
    expect(await can(db, subject('mmaLerato'), 'item.guideline.read', { type: 'item', id: item.id })).toBe(false)

    // The guideline rule: the learner after their own attempt; the class teacher; no one else.
    expect(await can(db, subject('lerato'), 'item.guideline.read', { type: 'item', id: item.id })).toBe(true)
    expect(await can(db, subject('thabo'), 'item.guideline.read', { type: 'item', id: item.id })).toBe(false)
    expect(await can(db, subject('msDlamini'), 'item.guideline.read', { type: 'item', id: item.id })).toBe(true)
    expect(await can(db, subject('mrNaidoo'), 'item.guideline.read', { type: 'item', id: item.id })).toBe(false)
    expect(await can(db, subject('msBotha'), 'item.guideline.read', { type: 'item', id: item.id })).toBe(false)

    // learner.read: self, class teacher, linked guardian (revoked above → false), nobody else.
    const learner = { type: 'learner', id: P.lerato.id } as const
    expect(await can(db, subject('lerato'), 'learner.read', learner)).toBe(true)
    expect(await can(db, subject('msDlamini'), 'learner.read', learner)).toBe(true)
    expect(await can(db, subject('mmaLerato'), 'learner.read', learner)).toBe(false)
    expect(await can(db, subject('mrNaidoo'), 'learner.read', learner)).toBe(false)
    expect(await can(db, subject('msBotha'), 'learner.read', learner)).toBe(false)
    expect(await can(db, subject('thabo'), 'learner.read', learner)).toBe(false)
  })
})
