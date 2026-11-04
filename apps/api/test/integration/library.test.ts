import { eq } from 'drizzle-orm'
import request from 'supertest'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { loadContent } from '../../src/content/loader.js'
import { guidelineApprovals, items } from '../../src/db/schema.js'
import { SEED_CLASSES, SEED_PEOPLE } from '../../src/db/seed-data.js'
import { NOINDEX } from '../../src/middleware/securityHeaders.js'
import { memoryStorage } from '../../src/storage/index.js'
import { TEST_ORIGIN, expectDbError, freshContext, signInAs, type TestContext } from './db.js'
import { scriptedModel, type ScriptedModel } from './practiceGateway.js'

/**
 * The past-paper library (brief B17 phase B; D40), against the five fictional questions in
 * `test/fixtures/library` (the loader's `dbe_nsc` format; never DBE text): sign-in and the
 * noindex header on every route; the tree and a paper with attribution on every question;
 * the memo after the learner's own attempt or for a teacher; no bucket URL in any response;
 * held-out items never offered; a teacher approves a whole paper and sets class practice
 * (change-the-ID 404s); Today, the parent's week and "what comes up" read the bank.
 */

const FIXTURE_DIR = new URL('../fixtures/library', import.meta.url).pathname
const DIAGRAM_KEY = 'library-fixture/p1-2023-nov-q2-1.png'
const BUCKET_ORIGIN = 'https://bucket.guardianbook.test'
const PAPER = { subject: 'Mathematics', grade: 12, year: 2023, session: 'november', paper: 1 }
const PAPER_PATH = '/api/library/mathematics/12/2023/november/p1'

let ctx: TestContext
let model: ScriptedModel
let storage: ReturnType<typeof memoryStorage>
const clock = { now: new Date('2026-11-04T10:00:00+02:00') }

beforeAll(async () => {
  model = scriptedModel()
  storage = memoryStorage(BUCKET_ORIGIN)
  ctx = await freshContext({ gateway: model.gateway, storage, now: () => clock.now })
  const report = await loadContent(ctx.db, FIXTURE_DIR)
  expect(report.inserted).toHaveLength(5)
  await storage.putObject(DIAGRAM_KEY, Buffer.from('89504e470d0a1a0a', 'hex'), 'image/png')
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

async function itemIdOf(slug: string): Promise<string> {
  const [row] = await ctx.db.select({ id: items.id }).from(items).where(eq(items.slug, slug)).limit(1)
  if (!row) throw new Error(`fixture item ${slug} missing`)
  return row.id
}

/** No library response may name the bucket, a key under it, or a PDF (D40). */
function expectNoBucketUrl(body: unknown) {
  const text = JSON.stringify(body)
  expect(text).not.toContain(BUCKET_ORIGIN)
  expect(text).not.toContain('library-fixture/')
  expect(text).not.toMatch(/X-Amz|\.pdf\b|diagram_key|diagramKey/i)
}

describe('the loader (D40)', () => {
  it('loaded the dbe_nsc fixture with its source, attribution and held-out flag, and still refuses an unsourced one', async () => {
    const rows = await ctx.db.select({ slug: items.slug, source: items.source, attribution: items.attribution, heldOut: items.heldOut, provenance: items.provenance }).from(items).where(eq(items.source, 'dbe_nsc'))
    expect(rows).toHaveLength(5)
    expect(rows.every((row) => row.attribution?.includes('Department of Basic Education') && row.provenance === 'licensed_content')).toBe(true)
    expect(rows.filter((row) => row.heldOut).map((row) => row.slug)).toEqual(['fx-nsc-maths-p1-2024-nov-q1-1'])
    // The database refuses a dbe_nsc row without its reference, and any other source, whatever the loader does.
    await expectDbError(
      ctx.db.insert(items).values({ slug: 'bad-dbe', topic: 't', skillTags: ['x'], promptMd: 'p', maxMarks: 1, author: 'a', reviewer: 'pending', source: 'dbe_nsc', provenance: 'licensed_content' }),
      /items_dbe_nsc_ref/,
    )
    await expectDbError(
      ctx.db.insert(items).values({ slug: 'bad-source', topic: 't', skillTags: ['x'], promptMd: 'p', maxMarks: 1, author: 'a', reviewer: 'pending', source: 'legacy', provenance: 'original_human' }),
      /items_source_known/,
    )
  })
})

describe('behind sign-in, noindex, never a bucket URL', () => {
  it('answers 401 without a session and carries the noindex header on every library route', async () => {
    for (const path of ['/api/library', `${PAPER_PATH}`, '/api/library/search?q=factor', '/api/library/comes-up', `/api/library/items/${await itemIdOf('fx-nsc-maths-p1-2023-nov-q2-1')}/diagram`]) {
      const res = await request(app()).get(path)
      expect(res.status, path).toBe(401)
      expect(res.headers['x-robots-tag'], path).toBe(NOINDEX)
    }
    const guardian = await signInAs(app(), 'mmaLerato')
    expect((await request(app()).get('/api/library').set('Cookie', guardian)).status).toBe(404)
    expect((await request(app()).get(PAPER_PATH).set('Cookie', guardian)).status).toBe(404)
    // Signed-in screens and the API both say noindex; the public front door does not.
    expect((await request(app()).get('/library')).headers['x-robots-tag']).toBe(NOINDEX)
    expect((await request(app()).get('/api/me')).headers['x-robots-tag']).toBe(NOINDEX)
    expect((await request(app()).get('/healthz')).headers['x-robots-tag']).toBeUndefined()
  })

  it('lists papers newest first without the held-out session, and a paper lists its questions with attribution and the DBE download', async () => {
    const lerato = await signInAs(app(), 'lerato')
    const tree = await request(app()).get('/api/library').set('Cookie', lerato)
    expect(tree.status).toBe(200)
    expect(tree.headers['x-robots-tag']).toBe(NOINDEX)
    expect(tree.body.papers.map((p: { year: number; paper: number; questions: number; title: string }) => [p.year, p.paper, p.questions, p.title])).toEqual([
      [2023, 1, 3, 'NSC Mathematics P1, November 2023'],
      [2022, 1, 1, 'NSC Mathematics P1, November 2022'],
    ])
    expect(tree.body.papers[0]).toMatchObject({ subject: 'Mathematics', subjectSlug: 'mathematics', grade: 12, session: 'november', sessionLabel: 'November', path: 'mathematics/12/2023/november/p1', marks: 9 })
    expectNoBucketUrl(tree.body)

    const paper = await request(app()).get(PAPER_PATH).set('Cookie', lerato)
    expect(paper.status).toBe(200)
    expect(paper.body.questions.map((q: { question: string; maxMarks: number; hasDiagram: boolean; memoSteps: unknown; approvedForYou: boolean; progress: string }) => [q.question, q.maxMarks, q.hasDiagram, q.memoSteps, q.approvedForYou, q.progress])).toEqual([
      ['1.1', 3, false, null, false, 'none'],
      ['1.2', 4, false, null, false, 'none'],
      ['2.1', 2, true, null, false, 'none'],
    ])
    for (const question of paper.body.questions) {
      expect(question.attribution).toMatch(/^NSC Mathematics P1, November 2023, Q[0-9.]+ · Department of Basic Education/)
      expect(question.source).toBe('dbe_nsc')
    }
    expect(paper.body.download.url).toMatch(/^https:\/\/www\.education\.gov\.za\//)
    expectNoBucketUrl(paper.body)

    // Unknown papers, a bad session and the held-out session are 404s.
    expect((await request(app()).get('/api/library/mathematics/12/2024/november/p1').set('Cookie', lerato)).status).toBe(404)
    expect((await request(app()).get('/api/library/mathematics/12/2023/winter/p1').set('Cookie', lerato)).status).toBe(404)
    expect((await request(app()).get('/api/library/mathematics/12/2023/november/p9').set('Cookie', lerato)).status).toBe(404)
  })

  it('searches by topic or skill wording, and the diagram is proxied bytes, never a link', async () => {
    const lerato = await signInAs(app(), 'lerato')
    const search = await request(app()).get('/api/library/search?q=factorising').set('Cookie', lerato)
    expect(search.status).toBe(200)
    expect(search.body.results.map((r: { question: string; paper: { year: number } }) => `${r.paper.year} Q${r.question}`).sort()).toEqual(['2022 Q1.1', '2023 Q1.1'])
    expectNoBucketUrl(search.body)
    const patterns = await request(app()).get('/api/library/search?q=number patterns').set('Cookie', lerato)
    expect(patterns.body.results.map((r: { question: string }) => r.question)).toEqual(['2.1'])
    expect((await request(app()).get('/api/library/search').set('Cookie', lerato)).body.results).toEqual([])
    expect((await request(app()).get(`/api/library/search?q=${'x'.repeat(81)}`).set('Cookie', lerato)).status).toBe(400)

    const diagram = await request(app()).get(`/api/library/items/${await itemIdOf('fx-nsc-maths-p1-2023-nov-q2-1')}/diagram`).set('Cookie', lerato)
    expect(diagram.status).toBe(200)
    expect(diagram.headers['content-type']).toContain('image/png')
    expect(diagram.headers['cache-control']).toBe('private, max-age=3600')
    expect(diagram.headers['x-robots-tag']).toBe(NOINDEX)
    expect(diagram.headers['location']).toBeUndefined()
    expect(Buffer.from(diagram.body as ArrayBuffer).subarray(0, 4).toString('hex')).toBe('89504e47')
    expect((await request(app()).get(`/api/library/items/${await itemIdOf('fx-nsc-maths-p1-2023-nov-q1-1')}/diagram`).set('Cookie', lerato)).status).toBe(404)
  })
})

describe('the teacher approves a paper and sets class practice', () => {
  it('approves every question of the paper for 12A in one action, idempotently; another teacher gets a 404', async () => {
    const dlamini = await signInAs(app(), 'msDlamini')
    const approved = await origin(request(app()).post(`/api/teacher/classes/${C['12A'].id}/library/approve`).set('Cookie', dlamini)).send(PAPER)
    expect(approved.status).toBe(201)
    expect(approved.body).toMatchObject({ title: 'NSC Mathematics P1, November 2023', questions: 3, approved: 3, alreadyApproved: 0 })
    const again = await origin(request(app()).post(`/api/teacher/classes/${C['12A'].id}/library/approve`).set('Cookie', dlamini)).send(PAPER)
    expect(again.status).toBe(200)
    expect(again.body).toMatchObject({ approved: 0, alreadyApproved: 3 })
    const rows = await ctx.db.select({ itemId: guidelineApprovals.itemId }).from(guidelineApprovals).where(eq(guidelineApprovals.classId, C['12A'].id))
    expect(rows).toHaveLength(3 + 3) // the three seed items plus the paper
    const held = await ctx.db.select({ itemId: guidelineApprovals.itemId }).from(guidelineApprovals).where(eq(guidelineApprovals.itemId, await itemIdOf('fx-nsc-maths-p1-2024-nov-q1-1')))
    expect(held).toHaveLength(0)

    // Change the ID: another teacher's class, another school, an unknown paper, a held-out one.
    const naidoo = await signInAs(app(), 'mrNaidoo')
    expect((await origin(request(app()).post(`/api/teacher/classes/${C['12A'].id}/library/approve`).set('Cookie', naidoo)).send(PAPER)).status).toBe(404)
    const botha = await signInAs(app(), 'msBotha')
    expect((await origin(request(app()).post(`/api/teacher/classes/${C['12A'].id}/library/approve`).set('Cookie', botha)).send(PAPER)).status).toBe(404)
    expect((await origin(request(app()).post(`/api/teacher/classes/${C['12A'].id}/library/approve`).set('Cookie', dlamini)).send({ ...PAPER, year: 2024 })).status).toBe(404)
    expect((await origin(request(app()).post(`/api/teacher/classes/${C['12A'].id}/library/approve`).set('Cookie', dlamini)).send({ ...PAPER, paper: 'one' })).status).toBe(400)
    // A learner is never a teacher here.
    const lerato = await signInAs(app(), 'lerato')
    expect((await origin(request(app()).post(`/api/teacher/classes/${C['12A'].id}/library/approve`).set('Cookie', lerato)).send(PAPER)).status).toBe(403)

    // The learner now sees the paper approved for them, with the memo still hidden.
    const paper = await request(app()).get(PAPER_PATH).set('Cookie', lerato)
    expect(paper.body.questions.every((q: { approvedForYou: boolean; memoSteps: unknown }) => q.approvedForYou && q.memoSteps === null)).toBe(true)
  })

  it('a topic set needs its questions approved first (409), then becomes class practice with a date', async () => {
    const dlamini = await signInAs(app(), 'msDlamini')
    // The 2022 factorising question is not approved yet: the set is refused, nothing is written.
    const refused = await origin(request(app()).post(`/api/teacher/classes/${C['12A'].id}/practice`).set('Cookie', dlamini)).send({ kind: 'topic', skillTag: 'algebra.factorising', dueOn: '2026-11-20' })
    expect(refused.status).toBe(409)
    expect(refused.body.error.code).toBe('guideline_not_approved')
    expect((await origin(request(app()).post(`/api/teacher/classes/${C['12A'].id}/practice`).set('Cookie', dlamini)).send({ kind: 'topic', skillTag: 'calc.tangent_line', dueOn: '2026-11-20' })).status).toBe(409)

    const topic = await origin(request(app()).post(`/api/teacher/classes/${C['12A'].id}/library/approve`).set('Cookie', dlamini)).send({ skillTag: 'algebra.factorising' })
    expect(topic.status).toBe(201)
    expect(topic.body).toMatchObject({ paper: null, title: 'Factorising trinomials', questions: 2, approved: 1, alreadyApproved: 1 })

    const set = await origin(request(app()).post(`/api/teacher/classes/${C['12A'].id}/practice`).set('Cookie', dlamini)).send({ kind: 'topic', skillTag: 'algebra.factorising', dueOn: '2026-11-20' })
    expect(set.status).toBe(201)
    expect(set.body.practice).toMatchObject({ kind: 'topic', title: 'Factorising trinomials', skillTag: 'algebra.factorising', paper: null, dueOn: '2026-11-20', questions: 2, assignedBy: { nickname: 'Ms Dlamini' } })

    const paper = await origin(request(app()).post(`/api/teacher/classes/${C['12A'].id}/practice`).set('Cookie', dlamini)).send({ kind: 'paper', paper: PAPER, dueOn: '2026-11-10' })
    expect(paper.status).toBe(201)
    expect(paper.body.practice).toMatchObject({ kind: 'paper', title: 'NSC Mathematics P1, November 2023', questions: 3, paper: { path: 'mathematics/12/2023/november/p1' } })

    const list = await request(app()).get(`/api/teacher/classes/${C['12A'].id}/practice`).set('Cookie', dlamini)
    expect(list.status).toBe(200)
    expect(list.body.practice.map((p: { dueOn: string; kind: string }) => [p.dueOn, p.kind])).toEqual([
      ['2026-11-10', 'paper'],
      ['2026-11-20', 'topic'],
    ])
    expectNoBucketUrl(list.body)

    // Change the ID: another teacher, another school, a learner, bad bodies.
    const naidoo = await signInAs(app(), 'mrNaidoo')
    expect((await request(app()).get(`/api/teacher/classes/${C['12A'].id}/practice`).set('Cookie', naidoo)).status).toBe(404)
    expect((await origin(request(app()).post(`/api/teacher/classes/${C['12A'].id}/practice`).set('Cookie', naidoo)).send({ kind: 'paper', paper: PAPER, dueOn: '2026-11-10' })).status).toBe(404)
    const botha = await signInAs(app(), 'msBotha')
    expect((await request(app()).get(`/api/teacher/classes/${C['12A'].id}/practice`).set('Cookie', botha)).status).toBe(404)
    const lerato = await signInAs(app(), 'lerato')
    expect((await request(app()).get(`/api/teacher/classes/${C['12A'].id}/practice`).set('Cookie', lerato)).status).toBe(403)
    expect((await origin(request(app()).post(`/api/teacher/classes/${C['12A'].id}/practice`).set('Cookie', dlamini)).send({ kind: 'paper', dueOn: '2026-11-10' })).status).toBe(400)
    expect((await origin(request(app()).post(`/api/teacher/classes/${C['12A'].id}/practice`).set('Cookie', dlamini)).send({ kind: 'paper', paper: PAPER, dueOn: 'soon' })).status).toBe(400)
  })

  it('lands on the learner’s Today with progress, and on the parent’s week as a title and a date', async () => {
    const lerato = await signInAs(app(), 'lerato')
    const before = await request(app()).get('/api/me/today').set('Cookie', lerato)
    expect(before.body.practice.map((p: { title: string; done: number; total: number; daysAway: number; path: string | null }) => [p.title, p.done, p.total, p.daysAway, p.path])).toEqual([
      ['NSC Mathematics P1, November 2023', 0, 3, 6, 'mathematics/12/2023/november/p1'],
      ['Factorising trinomials', 0, 2, 16, null],
    ])
    // Thabo is in 12A too; Bongani (11B) and Anele (Riverside) have no practice.
    expect((await request(app()).get('/api/me/today').set('Cookie', await signInAs(app(), 'thabo'))).body.practice).toHaveLength(2)
    expect((await request(app()).get('/api/me/today').set('Cookie', await signInAs(app(), 'bongani'))).body.practice).toEqual([])
    expect((await request(app()).get('/api/me/today').set('Cookie', await signInAs(app(), 'anele'))).body.practice).toEqual([])

    const guardian = await signInAs(app(), 'mmaLerato')
    const week = await request(app()).get(`/api/guardian/learners/${P.lerato.id}/plan`).set('Cookie', guardian)
    expect(week.status).toBe(200)
    expect(week.body.practice).toEqual([
      { title: 'NSC Mathematics P1, November 2023', className: '12A', dueOn: '2026-11-10', daysAway: 6 },
      { title: 'Factorising trinomials', className: '12A', dueOn: '2026-11-20', daysAway: 16 },
    ])
    expect(week.body.pastPapers).toBeNull()
    expectNoBucketUrl(week.body)
  })
})

describe('the bank feeds the loop', () => {
  it('check-it-alone draws a real exam question first and never a held-out one; the memo shows after the learner’s own attempt; the parent reads a plain line', async () => {
    const lerato = await signInAs(app(), 'lerato')
    const match = await request(app()).get('/api/me/check-alone?skill=algebra.factorising&mode=independent').set('Cookie', lerato)
    expect(match.status).toBe(200)
    // Both approved factorising questions are from the bank; the held-out 2024 one is never a candidate.
    expect(match.body.item.source).toBe('dbe_nsc')
    expect(match.body.item.attribution).toContain('Department of Basic Education')
    expect(match.body.item.slug).not.toBe('fx-nsc-maths-p1-2024-nov-q1-1')
    expectNoBucketUrl(match.body)

    // The learner checks a paper question on their own; the mocked model marks it.
    const q11 = await itemIdOf('fx-nsc-maths-p1-2023-nov-q1-1')
    const created = await origin(request(app()).post('/api/attempts').set('Cookie', lerato)).send({ itemId: q11, answerText: '(x − 3)(x − 4) = 0\nx = 3 or x = 4', idempotencyKey: 'lib-1', mode: 'independent' })
    expect(created.status).toBe(201)
    const attemptId: string = created.body.attemptId
    await origin(request(app()).post(`/api/attempts/${attemptId}/assess`).set('Cookie', lerato))
    await ctx.jobs.wait(`assess:${attemptId}`)
    const attempt = await request(app()).get(`/api/attempts/${attemptId}`).set('Cookie', lerato)
    expect(attempt.body.attempt.itemAttribution).toMatch(/^NSC Mathematics P1, November 2023, Q1\.1/)

    const paper = await request(app()).get(PAPER_PATH).set('Cookie', lerato)
    const [first, second] = paper.body.questions
    expect(first).toMatchObject({ question: '1.1', progress: 'checked', attemptId })
    expect(first.memoSteps.map((s: { stepType: string; marks: number }) => [s.stepType, s.marks])).toEqual([
      ['A', 1],
      ['CA', 1],
      ['A', 1],
    ])
    expect(second.memoSteps).toBeNull()
    // The same question is not offered again as a check; the 2022 one is next.
    const next = await request(app()).get('/api/me/check-alone?skill=algebra.factorising&mode=retention').set('Cookie', lerato)
    expect(next.body.item.slug).toBe('fx-nsc-maths-p1-2022-nov-q1-1')
    // A teacher reads every memo without an attempt; the item list and detail say where a question came from.
    const dlamini = await signInAs(app(), 'msDlamini')
    const teachers = await request(app()).get(PAPER_PATH).set('Cookie', dlamini)
    expect(teachers.body.questions.every((q: { memoSteps: unknown[]; approvedForYou: null }) => Array.isArray(q.memoSteps) && q.approvedForYou === null)).toBe(true)
    const detail = await request(app()).get(`/api/items/${q11}`).set('Cookie', dlamini)
    expect(detail.body.item).toMatchObject({ source: 'dbe_nsc', sourceRef: { year: 2023, question: '1.1' } })
    expect(detail.body.item.attribution).toContain('Department of Basic Education')
    const heldOut = await request(app()).get(`/api/items/${await itemIdOf('fx-nsc-maths-p1-2024-nov-q1-1')}`).set('Cookie', dlamini)
    expect(heldOut.status).toBe(404)
    const listed = await request(app()).get('/api/items').set('Cookie', lerato)
    expect(listed.body.items.map((i: { slug: string }) => i.slug)).not.toContain('fx-nsc-maths-p1-2024-nov-q1-1')
    const guidelines = await request(app()).get(`/api/teacher/classes/${C['12A'].id}/guidelines`).set('Cookie', dlamini)
    expect(guidelines.body.items.map((i: { slug: string }) => i.slug)).not.toContain('fx-nsc-maths-p1-2024-nov-q1-1')
    expect(guidelines.body.items.find((i: { slug: string }) => i.slug === 'fx-nsc-maths-p1-2023-nov-q1-1')).toMatchObject({ source: 'dbe_nsc', sourceRef: { question: '1.1' } })

    // The parent's week: "Lerato did 1 past exam question on factorising ...; 1 without help."
    const guardian = await signInAs(app(), 'mmaLerato')
    const week = await request(app()).get(`/api/guardian/learners/${P.lerato.id}/plan`).set('Cookie', guardian)
    expect(week.body.pastPapers).toEqual({ questions: 1, alone: 1, topics: ['Factorising (splitting an expression into two brackets)'], sentence: 'Lerato did 1 past exam question on factorising (splitting an expression into two brackets); 1 without help.' })
    expect(week.body.practice[0]).toMatchObject({ title: 'NSC Mathematics P1, November 2023' })
    expectNoBucketUrl(week.body)
  })

  it('"what comes up" counts papers and marks per skill without the held-out session, on the Brain and the class picture', async () => {
    const lerato = await signInAs(app(), 'lerato')
    const comesUp = await request(app()).get('/api/library/comes-up').set('Cookie', lerato)
    expect(comesUp.status).toBe(200)
    expect(comesUp.body.papers).toBe(2)
    const byTag = Object.fromEntries(comesUp.body.entries.map((e: { skillTag: string }) => [e.skillTag, e]))
    expect(byTag['algebra.factorising']).toMatchObject({ papers: 2, ofPapers: 2, paperNo: 1, since: 2022, marks: 1, sentence: 'In every Paper 1 since 2022, about 1 mark' })
    expect(byTag['algebra.quadratic_formula']).toMatchObject({ papers: 1, ofPapers: 2, marks: 4, sentence: 'In 1 of 2 Paper 1s since 2022, about 4 marks' })
    expect(byTag['seq.arithmetic_general_term']).toMatchObject({ papers: 1, ofPapers: 2, marks: 2 })

    const brain = await request(app()).get('/api/me/brain').set('Cookie', lerato)
    expect(brain.body.whatComesUp['algebra.factorising'].sentence).toBe('In every Paper 1 since 2022, about 1 mark')
    const dlamini = await signInAs(app(), 'msDlamini')
    const picture = await request(app()).get(`/api/teacher/classes/${C['12A'].id}/picture`).set('Cookie', dlamini)
    expect(picture.body.whatComesUp['algebra.zero_product'].sentence).toBe('In every Paper 1 since 2022, about 2 marks')
  })

  it('the plan agent’s resources name a past exam question on the gap skill, with its source, as a non-citable line', async () => {
    const lerato = await signInAs(app(), 'lerato')
    // A lost step on a bank question: the same-day plan runs against the mocked model.
    const q12 = await itemIdOf('fx-nsc-maths-p1-2023-nov-q1-2')
    const created = await origin(request(app()).post('/api/attempts').set('Cookie', lerato)).send({ itemId: q12, answerText: 'x = (−3 ± √41) / 4\nx = 0.85', idempotencyKey: 'lib-2' })
    expect(created.status).toBe(201)
    await origin(request(app()).post(`/api/attempts/${created.body.attemptId}/assess`).set('Cookie', lerato))
    await ctx.jobs.wait(`assess:${created.body.attemptId}`)
    await ctx.jobs.wait(`plan:${P.lerato.id}`)
    const resourcesCall = model.requests.filter((req) => req.response_format.json_schema.name === 'plan').map((req) => req.messages[1].content).find((content) => typeof content === 'string' && content.includes('Past exam question on this skill'))
    expect(resourcesCall).toBeDefined()
    expect(resourcesCall).toContain('NSC Mathematics P1, November 2023, Q1.2 · Department of Basic Education')
    expect(resourcesCall).toContain('4 marks')
    expect(resourcesCall).not.toContain(BUCKET_ORIGIN)
  })
})
