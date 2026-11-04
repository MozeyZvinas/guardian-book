import { eq } from 'drizzle-orm'
import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { items, notes } from '../../src/db/schema.js'
import { SEED_CLASSES, SEED_PEOPLE } from '../../src/db/seed-data.js'
import { okResponse } from '../../src/gateway/testing.js'
import { protectText, restoreText } from '../../src/translate/placeholders.js'
import { stripPlaceholders } from '../../src/verify/checks/translate.js'
import { TEST_ORIGIN, TEST_PASSWORD, cookieHeader, freshContext, signInAs, type TestContext } from './db.js'
import { purposeOf, scriptedModel, userText, type ScriptedModel } from './practiceGateway.js'

/**
 * The parent's home language (brief B12 acceptance): the guardian picks isiZulu; a plan,
 * a sent note and an intervention sentence are translated in the background through
 * `runModel` (charged to the guardian), with no name or digit in any prompt; a draft note
 * is never translated or served; when the model drops a placeholder three times the
 * English stands and the runs say `exhausted`; a guardian of another learner sees nothing.
 */

let ctx: TestContext
let model: ScriptedModel
const lerato = SEED_PEOPLE.lerato.id

beforeAll(async () => {
  model = scriptedModel()
  ctx = await freshContext({ gateway: model.gateway })
})
afterAll(async () => {
  await ctx.jobs.waitAll()
  await ctx.close()
})

const origin = (req: request.Test) => req.set('Origin', TEST_ORIGIN)
const app = () => ctx.app
const sql = <T extends Record<string, unknown>>(text: string) => ctx.db.execute<T>(text).then((r) => r.rows)
const translatePrompts = () => model.requests.filter((req) => purposeOf(req) === 'translate').map(userText)
const translateRuns = () => sql<{ subject_type: string; subject_id: string; status: string; attempt_no: number }>(`select subject_type, subject_id, status, attempt_no from model_runs where purpose = 'translate' order by created_at, attempt_no`)

const names = { learner: 'Lerato', teacher: 'Ms Dlamini' }

/** What the mocked model (practiceGateway) gives back once restored: every word reversed, names and numbers intact. */
function pseudo(english: string): string {
  const protectedText = protectText(english, names)
  return restoreText(protectedText.text.replace(/[\p{L}']+/gu, (word) => [...word].reverse().join('')), protectedText)
}

async function itemIdOf(slug: string): Promise<string> {
  const [row] = await ctx.db.select({ id: items.id }).from(items).where(eq(items.slug, slug)).limit(1)
  if (!row) throw new Error(`seed item ${slug} missing`)
  return row.id
}

function expectPrivatePrompts(prompts: string[]) {
  expect(prompts.length).toBeGreaterThan(0)
  for (const prompt of prompts) {
    expect(stripPlaceholders(prompt)).not.toMatch(/\d/)
    expect(prompt).not.toMatch(/lerato|dlamini/i)
    expect(prompt).not.toMatch(/@/)
  }
}

describe('G4 · the parent picks a language', () => {
  it('English by default; the choice is stored and audited; an unknown code is refused; other roles are refused', async () => {
    const guardian = await signInAs(app(), 'mmaLerato')
    expect((await request(app()).get('/api/guardian/language').set('Cookie', guardian)).body).toEqual({ language: 'en' })
    const bad = await origin(request(app()).patch('/api/guardian/language').set('Cookie', guardian)).send({ language: 'fr' })
    expect(bad.status).toBe(400)
    const set = await origin(request(app()).patch('/api/guardian/language').set('Cookie', guardian)).send({ language: 'zu' })
    expect(set.status).toBe(200)
    expect(set.body).toEqual({ language: 'zu' })
    expect((await request(app()).get('/api/guardian/language').set('Cookie', guardian)).body).toEqual({ language: 'zu' })
    expect((await sql(`select 1 from audit_events where action = 'guardian.language_set' and actor_id = '${SEED_PEOPLE.mmaLerato.id}'`)).length).toBe(1)
    expect((await sql<{ preferred_language: string }>(`select preferred_language from profiles where user_id = '${SEED_PEOPLE.mmaLerato.id}'`))[0]?.preferred_language).toBe('zu')

    const learner = await signInAs(app(), 'lerato')
    expect((await request(app()).get('/api/guardian/language').set('Cookie', learner)).status).toBe(403)
    expect((await origin(request(app()).patch('/api/guardian/language').set('Cookie', learner)).send({ language: 'zu' })).status).toBe(403)
    expect((await request(app()).get('/api/guardian/language')).status).toBe(401)
  })
})

describe('G1 · This week in isiZulu', () => {
  it('a plan is issued; the week serves English with the translation pending, then the isiZulu beside it; no name or digit reached the model', async () => {
    const cookie = await signInAs(app(), 'lerato')
    const created = await origin(request(app()).post('/api/attempts').set('Cookie', cookie)).send({ itemId: await itemIdOf('alg-12-factorise-trinomial'), answerText: 'x² − 5x + 6 = 0\n(x − 2)(x − 3) = 0', idempotencyKey: 'b12-1' })
    expect(created.status).toBe(201)
    await origin(request(app()).post(`/api/attempts/${created.body.attemptId}/assess`).set('Cookie', cookie))
    await ctx.jobs.wait(`assess:${created.body.attemptId}`)
    await ctx.jobs.wait(`plan:${lerato}`)

    const guardian = await signInAs(app(), 'mmaLerato')
    const first = await request(app()).get(`/api/guardian/learners/${lerato}/plan`).set('Cookie', guardian)
    expect(first.status).toBe(200)
    expect(first.body.language).toBe('zu')
    expect(first.body.plan.action).toContain('Ask them to teach you step 2')
    expect(first.body.plan.translations).toMatchObject({
      gap: { language: 'zu', status: 'pending', text: null },
      action: { language: 'zu', status: 'pending', text: null },
      celebrate: { language: 'zu', status: 'pending', text: null },
    })

    await ctx.jobs.waitAll()
    const second = await request(app()).get(`/api/guardian/learners/${lerato}/plan`).set('Cookie', guardian)
    const { plan } = second.body
    expect(plan.translations.action).toEqual({ language: 'zu', status: 'ready', text: pseudo(plan.action) })
    expect(plan.translations.gap).toEqual({ language: 'zu', status: 'ready', text: pseudo(plan.gap) })
    expect(plan.translations.celebrate).toEqual({ language: 'zu', status: 'ready', text: pseudo(plan.celebrate) })
    expect(plan.translations.action.text).toContain('2') // the number came back through its placeholder
    expect(plan.translations.action.text).not.toContain('Ask them')
    // The English is still there for "Show English"; the week carries no attempt or answer.
    expect(plan.action).toContain('Ask them to teach you step 2')
    expect(JSON.stringify(second.body)).not.toMatch(/x² − 5x|answerText|imageKey/)

    expectPrivatePrompts(translatePrompts())
    const runs = await translateRuns()
    expect(runs.map((run) => [run.subject_type, run.status])).toEqual([
      ['plan_gap', 'accepted'],
      ['plan_action', 'accepted'],
      ['plan_celebrate', 'accepted'],
    ])
    expect(runs.every((run) => run.subject_id === plan.id)).toBe(true)
    const usage = await sql<{ calls: number }>(`select calls from model_usage_daily where user_id = '${SEED_PEOPLE.mmaLerato.id}'`)
    expect(usage[0]?.calls).toBe(3) // charged to the guardian, not the learner
    const rows = await sql<{ source_kind: string; status: string; provenance: string; model_run_id: string | null; language: string }>(`select source_kind, status, provenance, model_run_id, language from translations order by created_at`)
    expect(rows).toHaveLength(3)
    for (const row of rows) expect(row).toMatchObject({ status: 'ready', provenance: 'model_generated', language: 'zu' })
    expect(rows.every((row) => row.model_run_id !== null)).toBe(true)

    // A third read serves the cache: no new call.
    await request(app()).get(`/api/guardian/learners/${lerato}/plan`).set('Cookie', guardian)
    await ctx.jobs.waitAll()
    expect((await translateRuns()).length).toBe(3)
  })

  it('a sent note is translated with the names and numbers protected; a draft note is neither served nor translated', async () => {
    const base = { teacherId: SEED_PEOPLE.msDlamini.id, learnerId: lerato, guardianId: SEED_PEOPLE.mmaLerato.id, provenance: 'teacher_verified' as const }
    const [sent, draft] = await ctx.db
      .insert(notes)
      .values([
        { ...base, draftText: 'd', finalText: 'Lerato worked on factorising this week and one step slipped. Ask Lerato to explain step 3 to you tonight; 10 minutes is enough. Ms Dlamini', status: 'sent', origin: 'teacher_revised', audience: 'guardian', approvedAt: new Date(), sentAt: new Date() },
        { ...base, draftText: 'A draft the parent must never see, in any language.', status: 'draft', origin: 'ai_suggested', audience: 'guardian' },
      ])
      .returning({ id: notes.id, text: notes.finalText })
    const guardian = await signInAs(app(), 'mmaLerato')
    const runsBefore = (await translateRuns()).length

    const first = await request(app()).get('/api/guardian/notes').set('Cookie', guardian)
    expect(first.status).toBe(200)
    expect(first.body.language).toBe('zu')
    expect(first.body.notes).toHaveLength(1)
    expect(first.body.notes[0]).toMatchObject({ id: sent?.id, label: 'Teacher-reviewed', translation: { language: 'zu', status: 'pending', text: null } })
    await ctx.jobs.waitAll()

    const second = await request(app()).get('/api/guardian/notes').set('Cookie', guardian)
    const note = second.body.notes[0]
    expect(note.translation).toEqual({ language: 'zu', status: 'ready', text: pseudo(sent?.text ?? '') })
    expect(note.translation.text).toContain('Lerato') // restored after the checks, never sent
    expect(note.translation.text).toContain('Ms Dlamini')
    expect(note.translation.text).toContain('10 minutes'.replace('minutes', 'setunim'))
    expectPrivatePrompts(translatePrompts().slice(runsBefore))
    expect((await translateRuns()).slice(runsBefore).map((run) => [run.subject_type, run.subject_id, run.status])).toEqual([['note', sent?.id, 'accepted']])
    expect((await sql(`select 1 from translations where source_id = '${draft?.id}'`)).length).toBe(0)
    expect(JSON.stringify(second.body)).not.toContain('A draft')
    expect((await request(app()).get(`/api/guardian/notes/${draft?.id}`).set('Cookie', guardian)).status).toBe(404)

    // The same note on This week is served from the cache: no new call.
    const week = await request(app()).get(`/api/guardian/learners/${lerato}/plan`).set('Cookie', guardian)
    const message = week.body.teacherMessages.find((m: { id: string }) => m.id === sent?.id)
    expect(message.translation).toEqual({ language: 'zu', status: 'ready', text: pseudo(sent?.text ?? '') })
    await ctx.jobs.waitAll()
    expect((await translateRuns()).length).toBe(runsBefore + 1)
  })

  it('the intervention sentence is translated with the teacher, the learner and the date protected', async () => {
    const teacher = await signInAs(app(), 'msDlamini')
    const assigned = await origin(request(app()).post('/api/teacher/interventions').set('Cookie', teacher)).send({ learnerId: lerato, classId: SEED_CLASSES['12A'].id, skillTag: 'factorise-trinomial', action: 'Ten-minute starter on factorising.', followUpOn: '2026-11-19' })
    expect(assigned.status).toBe(201)
    const guardian = await signInAs(app(), 'mmaLerato')
    const runsBefore = (await translateRuns()).length
    await request(app()).get(`/api/guardian/learners/${lerato}/plan`).set('Cookie', guardian)
    await ctx.jobs.waitAll()
    const week = await request(app()).get(`/api/guardian/learners/${lerato}/plan`).set('Cookie', guardian)
    const message = week.body.teacherMessages.find((m: { kind: string }) => m.kind === 'intervention')
    expect(message.text).toMatch(/^Ms Dlamini is working on .+ with Lerato this week\. Check-in on Thursday, 19 November\.$/)
    expect(message.text).not.toContain('Ten-minute starter') // the teacher's action line stays in the teacher space
    expect(message.translation).toEqual({ language: 'zu', status: 'ready', text: pseudo(message.text) })
    expect(message.translation.text).toContain('Ms Dlamini')
    expect(message.translation.text).toContain('19')
    expectPrivatePrompts(translatePrompts().slice(runsBefore))
    expect((await translateRuns()).slice(runsBefore).map((run) => [run.subject_type, run.status])).toEqual([['intervention', 'accepted']])
  })

  it('when the model drops a placeholder three times, the parent sees English only and the runs say exhausted', async () => {
    const [note] = await ctx.db
      .insert(notes)
      .values({ teacherId: SEED_PEOPLE.msDlamini.id, learnerId: lerato, guardianId: SEED_PEOPLE.mmaLerato.id, provenance: 'teacher_verified', draftText: 'Please check that Lerato has the 2 worksheets for Friday.', status: 'sent', origin: 'teacher_added', audience: 'guardian', approvedAt: new Date(), sentAt: new Date() })
      .returning({ id: notes.id })
    const noPlaceholders = () => okResponse({ text: 'Sicela uhlole ukuthi unamaphepha okusebenza ngoLwesihlanu.' })
    model.queue.push(noPlaceholders, noPlaceholders, noPlaceholders)
    const guardian = await signInAs(app(), 'mmaLerato')
    const runsBefore = (await translateRuns()).length

    const first = await request(app()).get('/api/guardian/notes').set('Cookie', guardian)
    const pending = first.body.notes.find((n: { id: string }) => n.id === note?.id)
    expect(pending.translation).toEqual({ language: 'zu', status: 'pending', text: null })
    await ctx.jobs.waitAll()

    const second = await request(app()).get('/api/guardian/notes').set('Cookie', guardian)
    const served = second.body.notes.find((n: { id: string }) => n.id === note?.id)
    expect(served.text).toBe('Please check that Lerato has the 2 worksheets for Friday.')
    expect(served.translation).toEqual({ language: 'zu', status: 'unavailable', text: null })
    expect((await translateRuns()).slice(runsBefore).map((run) => [run.subject_id, run.status, run.attempt_no])).toEqual([
      [note?.id, 'retried', 1],
      [note?.id, 'retried', 2],
      [note?.id, 'exhausted', 3],
    ])
    const checks = await sql<{ checks: Array<{ code: string; passed: boolean }> }>(`select checks from model_runs where purpose = 'translate' and subject_id = '${note?.id}' order by attempt_no`)
    expect(checks[2]?.checks.filter((check) => !check.passed).map((check) => check.code)).toContain('PLACEHOLDER_MISSING')
    const rows = await sql<{ status: string; text: string | null; provenance: string; model_run_id: string | null }>(`select status, text, provenance, model_run_id from translations where source_id = '${note?.id}'`)
    expect(rows).toEqual([{ status: 'unavailable', text: null, provenance: 'model_generated', model_run_id: expect.any(String) }])
    expect((await sql(`select 1 from audit_events where action = 'translation.refused'`)).length).toBe(1)

    // The failure is remembered: another read makes no new call.
    await request(app()).get('/api/guardian/notes').set('Cookie', guardian)
    await ctx.jobs.waitAll()
    expect((await translateRuns()).length).toBe(runsBefore + 3)
  })

  it('an answer cut off by max_tokens is remembered as unavailable after one call: the English stands, nothing is re-spent', async () => {
    const [note] = await ctx.db
      .insert(notes)
      .values({ teacherId: SEED_PEOPLE.msDlamini.id, learnerId: lerato, guardianId: SEED_PEOPLE.mmaLerato.id, provenance: 'teacher_verified', draftText: 'Bring the calculator on Monday, please.', status: 'sent', origin: 'teacher_added', audience: 'guardian', approvedAt: new Date(), sentAt: new Date() })
      .returning({ id: notes.id })
    model.queue.push(okResponse('', { finishReason: 'length', completionTokens: 6000 }))
    const guardian = await signInAs(app(), 'mmaLerato')
    const runsBefore = (await translateRuns()).length
    await request(app()).get('/api/guardian/notes').set('Cookie', guardian)
    await ctx.jobs.waitAll()
    const served = (await request(app()).get('/api/guardian/notes').set('Cookie', guardian)).body.notes.find((n: { id: string }) => n.id === note?.id)
    expect(served).toMatchObject({ text: 'Bring the calculator on Monday, please.', translation: { language: 'zu', status: 'unavailable', text: null } })
    expect((await translateRuns()).slice(runsBefore).map((run) => [run.subject_id, run.status])).toEqual([[note?.id, 'failed']])
    expect((await sql<{ status: string }>(`select status from translations where source_id = '${note?.id}'`))[0]?.status).toBe('unavailable')
    await request(app()).get('/api/guardian/notes').set('Cookie', guardian)
    await ctx.jobs.waitAll()
    expect((await translateRuns()).length).toBe(runsBefore + 1)
  })

  it('a guardian of another learner: 404 on the week, an empty notes list, their own language only', async () => {
    const signedUp = await origin(request(app()).post('/api/auth/sign-up/email')).send({ nickname: 'Gogo', email: 'gogo@demo.guardianbook.test', password: TEST_PASSWORD, role: 'guardian', ageAttested: true })
    expect(signedUp.status).toBe(201)
    const gogoId: string = signedUp.body.user.id
    const signedIn = await origin(request(app()).post('/api/auth/sign-in/email')).send({ email: 'gogo@demo.guardianbook.test', password: TEST_PASSWORD })
    const gogo = cookieHeader(signedIn.headers['set-cookie'])
    expect((await request(app()).get(`/api/guardian/learners/${lerato}/plan`).set('Cookie', gogo)).status).toBe(404)
    expect((await origin(request(app()).post(`/api/guardian/learners/${lerato}/plan/done`).set('Cookie', gogo))).status).toBe(404)
    const sentIds = await sql<{ id: string }>(`select id from notes where status = 'sent'`)
    for (const row of sentIds) expect((await request(app()).get(`/api/guardian/notes/${row.id}`).set('Cookie', gogo)).status).toBe(404)
    expect((await request(app()).get('/api/guardian/notes').set('Cookie', gogo)).body).toEqual({ language: 'en', notes: [] })
    expect((await request(app()).get('/api/guardian/language').set('Cookie', gogo)).body).toEqual({ language: 'en' })
    expect((await origin(request(app()).patch('/api/guardian/language').set('Cookie', gogo)).send({ language: 'tn' })).body).toEqual({ language: 'tn' })
    expect((await request(app()).get('/api/guardian/language').set('Cookie', await signInAs(app(), 'mmaLerato'))).body).toEqual({ language: 'zu' })
    await ctx.jobs.waitAll()
    // Gogo is linked to nobody: the warm-up had nothing to translate, so nothing was charged to them.
    expect((await sql(`select 1 from model_usage_daily where user_id = '${gogoId}'`)).length).toBe(0)
    expect((await sql(`select 1 from translations where language = 'tn'`)).length).toBe(0)
  })

  it('switching to Afrikaans translates the same texts again, into Afrikaans, charged to the guardian', async () => {
    const guardian = await signInAs(app(), 'mmaLerato')
    const runsBefore = (await translateRuns()).length
    expect((await origin(request(app()).patch('/api/guardian/language').set('Cookie', guardian)).send({ language: 'af' })).body).toEqual({ language: 'af' })
    await ctx.jobs.waitAll()
    const week = await request(app()).get(`/api/guardian/learners/${lerato}/plan`).set('Cookie', guardian)
    expect(week.body.language).toBe('af')
    expect(week.body.plan.translations.action).toMatchObject({ language: 'af', status: 'ready' })
    expect(week.body.teacherMessages.every((m: { translation: { language: string } }) => m.translation.language === 'af')).toBe(true)
    const afrikaans = translatePrompts().slice(runsBefore)
    expect(afrikaans.every((prompt) => prompt.startsWith('Translate into Afrikaans (af).'))).toBe(true)
    expectPrivatePrompts(afrikaans)
    expect((await sql(`select 1 from translations where language = 'af'`)).length).toBeGreaterThanOrEqual(5)
  })
})

describe('without a model gateway', () => {
  it('the English stands, marked unavailable, with no call and no crash', async () => {
    await ctx.close()
    ctx = await freshContext()
    await ctx.db.insert(notes).values({ teacherId: SEED_PEOPLE.msDlamini.id, learnerId: lerato, guardianId: SEED_PEOPLE.mmaLerato.id, provenance: 'teacher_verified', draftText: 'One step slipped this week.', status: 'sent', origin: 'teacher_added', audience: 'guardian', approvedAt: new Date(), sentAt: new Date() })
    const guardian = await signInAs(app(), 'mmaLerato')
    expect((await origin(request(app()).patch('/api/guardian/language').set('Cookie', guardian)).send({ language: 'xh' })).status).toBe(200)
    const res = await request(app()).get('/api/guardian/notes').set('Cookie', guardian)
    expect(res.body.notes[0]).toMatchObject({ text: 'One step slipped this week.', translation: { language: 'xh', status: 'unavailable', text: null } })
    expect((await sql(`select 1 from model_runs`)).length).toBe(0)
    expect((await sql(`select 1 from translations`)).length).toBe(0)
  })
})
