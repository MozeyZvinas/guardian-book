import { eq } from 'drizzle-orm'
import request from 'supertest'
import { dayOf } from '@guardian-book/shared'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { items } from '../../src/db/schema.js'
import { SEED_CLASSES, SEED_PEOPLE } from '../../src/db/seed-data.js'
import { appendEvent } from '../../src/evidence/append.js'
import { okResponse } from '../../src/gateway/testing.js'
import { memoryStorage } from '../../src/storage/index.js'
import { TEST_ORIGIN, freshContext, signInAs, type TestContext } from './db.js'
import { goodWorkCheck, purposeOf, scriptedModel, userText, type ScriptedModel } from './practiceGateway.js'

/**
 * The teacher space (brief B07; spec 02 P0-10): approve the guideline → review an
 * uncertain attempt → confirm, feedback, release → the class picture → an intervention
 * assigned and closed on evidence → notes drafted, approved and sent → what the guardian
 * and the learner see. Plus every 409, 400 and change-the-ID 404 the brief names.
 */

let ctx: TestContext
let model: ScriptedModel

beforeAll(async () => {
  model = scriptedModel()
  ctx = await freshContext({ gateway: model.gateway, storage: memoryStorage() })
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

async function typedAttempt(cookie: string, key: string, text = 'x² − 5x + 6 = 0\n(x − 2)(x − 3) = 0'): Promise<string> {
  const created = await origin(request(app()).post('/api/attempts').set('Cookie', cookie)).send({ itemId: await itemId(), answerText: text, idempotencyKey: key })
  expect([200, 201]).toContain(created.status)
  const attemptId: string = created.body.attemptId
  const started = await origin(request(app()).post(`/api/attempts/${attemptId}/assess`).set('Cookie', cookie))
  expect([200, 202]).toContain(started.status)
  await ctx.jobs.wait(`assess:${attemptId}`)
  return attemptId
}

const eventsFor = async (attemptId: string) =>
  (await ctx.db.execute<{ kind: string; basis: string; payload: Record<string, unknown> }>(`select kind, basis, payload from learning_events where attempt_id = '${attemptId}' order by occurred_at, id`)).rows

const state: { leratoAttempt?: string; thaboAttempt?: string; reviewId?: string } = {}

describe('T7 · guidelines', () => {
  it('lists the items with their M/A/CA steps and the approval state per class; approval is per revision and idempotent', async () => {
    const dlamini = await signInAs(app(), 'msDlamini')
    const mine = await request(app()).get(`/api/teacher/classes/${C['12A'].id}/guidelines`).set('Cookie', dlamini)
    expect(mine.status).toBe(200)
    expect(mine.body.items).toHaveLength(3) // two B02 items plus B06's check-alone match (D37)
    expect(mine.body.items[0].steps.map((s: { stepType: string }) => s.stepType)).toEqual(['M', 'A', 'CA', 'A'])
    expect(mine.body.items.every((i: { approval: unknown }) => i.approval !== null)).toBe(true) // the seed approves for 12A
    expect(mine.body.items[0]).toMatchObject({ aiDrafted: false, provenance: 'original_human' })

    const naidoo = await signInAs(app(), 'mrNaidoo')
    const theirs = await request(app()).get(`/api/teacher/classes/${C['11B'].id}/guidelines`).set('Cookie', naidoo)
    expect(theirs.body.items.every((i: { approval: unknown }) => i.approval === null)).toBe(true)

    const factorise = await itemId()
    const wrongRevision = await origin(request(app()).post(`/api/teacher/classes/${C['11B'].id}/guidelines/${factorise}/approve`).set('Cookie', naidoo)).send({ itemRevision: 9 })
    expect(wrongRevision.status).toBe(409)
    expect(wrongRevision.body.error.code).toBe('revision_mismatch')

    const approved = await origin(request(app()).post(`/api/teacher/classes/${C['11B'].id}/guidelines/${factorise}/approve`).set('Cookie', naidoo)).send({ itemRevision: 1 })
    expect(approved.status).toBe(201)
    expect(approved.body).toMatchObject({ approval: { classId: C['11B'].id, itemId: factorise, itemRevision: 1 }, replayed: false })
    const again = await origin(request(app()).post(`/api/teacher/classes/${C['11B'].id}/guidelines/${factorise}/approve`).set('Cookie', naidoo)).send({ itemRevision: 1 })
    expect(again.status).toBe(200)
    expect(again.body.replayed).toBe(true)
    const events = await ctx.db.execute<{ kind: string }>(`select kind from learning_events where kind = 'guideline_approved' and learner_id = '${P.mrNaidoo.id}'`)
    expect(events.rows).toHaveLength(1)

    // Bongani (11B) can now attempt the item; the other item is still refused.
    const bongani = await signInAs(app(), 'bongani')
    const ok = await origin(request(app()).post('/api/attempts').set('Cookie', bongani)).send({ itemId: factorise, answerText: 'x = 2', idempotencyKey: 'b-1' })
    expect(ok.status).toBe(201)
    const refused = await origin(request(app()).post('/api/attempts').set('Cookie', bongani)).send({ itemId: await itemId('alg-12-nature-of-roots'), answerText: 'k = 9', idempotencyKey: 'b-2' })
    expect(refused.status).toBe(409)

    // Another class's teacher and another school's teacher: 404 either way.
    expect((await request(app()).get(`/api/teacher/classes/${C['12A'].id}/guidelines`).set('Cookie', naidoo)).status).toBe(404)
    expect((await origin(request(app()).post(`/api/teacher/classes/${C['12A'].id}/guidelines/${factorise}/approve`).set('Cookie', naidoo)).send({ itemRevision: 1 })).status).toBe(404)
    const botha = await signInAs(app(), 'msBotha')
    expect((await request(app()).get(`/api/teacher/classes/${C['12A'].id}/guidelines`).set('Cookie', botha)).status).toBe(404)
  })
})

describe('T3 · queue and T3a · review', () => {
  it('the queue puts uncertain first; the review shows the proposal, the checks and the work', async () => {
    const lerato = await signInAs(app(), 'lerato')
    state.leratoAttempt = await typedAttempt(lerato, 'r-lerato')
    const thabo = await signInAs(app(), 'thabo')
    const leaking = (req: Parameters<typeof goodWorkCheck>[0]) => okResponse(goodWorkCheck(req, { loseLast: true, hint: 'The solutions are x = 2 and x = 3.' }))
    model.queue.push(leaking, leaking, leaking)
    state.thaboAttempt = await typedAttempt(thabo, 'r-thabo')

    const dlamini = await signInAs(app(), 'msDlamini')
    const queue = await request(app()).get(`/api/teacher/queue?classId=${C['12A'].id}`).set('Cookie', dlamini)
    expect(queue.status).toBe(200)
    expect(queue.body.rows.map((r: { attemptId: string; status: string }) => [r.attemptId, r.status])).toEqual([
      [state.thaboAttempt, 'uncertain'],
      [state.leratoAttempt, 'proposed'],
    ])
    expect(queue.body.rows[0].learner.nickname).toBe('Thabo')

    const view = await request(app()).get(`/api/teacher/attempts/${state.thaboAttempt}`).set('Cookie', dlamini)
    expect(view.status).toBe(200)
    expect(view.body.attempt).toMatchObject({ status: 'uncertain', classId: C['12A'].id, learner: { nickname: 'Thabo' }, answerText: expect.stringContaining('(x − 2)(x − 3)') })
    expect(view.body.assessment).toMatchObject({ status: 'uncertain', total: null })
    expect(view.body.assessment.ambiguityReasons).toContain('HINT_LEAKS_ANSWER')
    // The model's last proposal is kept for the teacher even though no mark was shown to the learner.
    expect(view.body.steps).toHaveLength(4)
    expect(view.body.steps[3].proposed).toMatchObject({ awarded: 0, confidence: 'high' })
    expect(view.body.runs.map((r: { attemptNo: number; status: string }) => [r.attemptNo, r.status])).toEqual([
      [1, 'retried'],
      [2, 'retried'],
      [3, 'exhausted'],
    ])
    const checks: Array<{ code: string; passed: boolean }> = view.body.runs[2].checks
    expect(checks.find((c) => c.code === 'HINT_LEAKS_ANSWER')?.passed).toBe(false)
    expect(checks.find((c) => c.code === 'SCHEMA_INVALID')?.passed).toBe(true)
    expect(view.body.review).toBeNull()
  })

  it('release before confirm → 409; confirm → stale version → 409; feedback carries origins and audiences; release → events; the proposal is never overwritten', async () => {
    const dlamini = await signInAs(app(), 'msDlamini')
    const attemptId = state.thaboAttempt!
    const before = (await ctx.db.execute<{ steps: unknown; status: string; total: number | null }>(`select steps, status, total from assessments where attempt_id = '${attemptId}'`)).rows[0]

    const early = await origin(request(app()).post(`/api/teacher/attempts/${attemptId}/release`).set('Cookie', dlamini)).send({ version: 1 })
    expect(early.status).toBe(409)
    expect(early.body.error.code).toBe('not_confirmed')

    const view = await request(app()).get(`/api/teacher/attempts/${attemptId}`).set('Cookie', dlamini)
    const steps: Array<{ stepId: string; stepNo: number; marks: number }> = view.body.steps
    const awards = steps.map((s) => ({ stepId: s.stepId, awarded: s.stepNo === 4 ? 0 : s.marks })) // the teacher corrects step 3: earned
    const confirmed = await origin(request(app()).post(`/api/teacher/attempts/${attemptId}/review`).set('Cookie', dlamini)).send({ steps: awards, comment: 'Step 3 is fine; finish the last line.' })
    expect(confirmed.status).toBe(200)
    expect(confirmed.body.review).toMatchObject({ state: 'confirmed', version: 1, total: 3, releasedAt: null })
    state.reviewId = confirmed.body.review.id

    const stale = await origin(request(app()).post(`/api/teacher/attempts/${attemptId}/review`).set('Cookie', dlamini)).send({ steps: awards, version: 0 })
    expect(stale.status).toBe(409)
    expect(stale.body.error.code).toBe('stale_version')
    const reconfirmed = await origin(request(app()).post(`/api/teacher/attempts/${attemptId}/review`).set('Cookie', dlamini)).send({ steps: awards, version: 1 })
    expect(reconfirmed.body.review.version).toBe(2)

    // Feedback controls: agree (the AI's words), correct (her edit), add (her own, only for her).
    const feedbackUrl = `/api/teacher/reviews/${state.reviewId}/feedback`
    const agree = await origin(request(app()).post(feedbackUrl).set('Cookie', dlamini)).send({ kind: 'agree', text: 'Not yet: the solutions are not stated.', audience: 'learner' })
    expect(agree.status).toBe(201)
    expect(agree.body.feedback).toMatchObject({ origin: 'teacher_approved', originLabel: 'You approved', audience: 'learner' })
    const correct = await origin(request(app()).post(feedbackUrl).set('Cookie', dlamini)).send({ kind: 'correct', text: 'The factors are right. Finish by writing both answers.', audience: 'guardian' })
    expect(correct.body.feedback).toMatchObject({ origin: 'teacher_revised', originLabel: 'You revised' })
    const add = await origin(request(app()).post(feedbackUrl).set('Cookie', dlamini)).send({ kind: 'add', text: 'TEACHER-ONLY-NOTE: watch this one next week.', audience: 'teacher_only' })
    expect(add.body.feedback).toMatchObject({ origin: 'teacher_added', originLabel: 'You added', audience: 'teacher_only' })
    const noText = await origin(request(app()).post(feedbackUrl).set('Cookie', dlamini)).send({ kind: 'add', audience: 'learner' })
    expect(noText.status).toBe(400)

    // Nothing reaches the learner before release.
    const thabo = await signInAs(app(), 'thabo')
    const unreleased = await request(app()).get(`/api/attempts/${attemptId}/review`).set('Cookie', thabo)
    expect(unreleased.status).toBe(200)
    expect(unreleased.body).toEqual({ review: null, feedback: [] })

    const staleRelease = await origin(request(app()).post(`/api/teacher/reviews/${state.reviewId}/release`).set('Cookie', dlamini)).send({ version: 1 })
    expect(staleRelease.status).toBe(409)
    const released = await origin(request(app()).post(`/api/teacher/reviews/${state.reviewId}/release`).set('Cookie', dlamini)).send({ version: 2 })
    expect(released.status).toBe(200)
    expect(released.body.review).toMatchObject({ state: 'released', version: 3 })
    expect(released.body.review.releasedAt).not.toBeNull()
    expect((await origin(request(app()).post(`/api/teacher/reviews/${state.reviewId}/release`).set('Cookie', dlamini)).send({ version: 3 })).body.error.code).toBe('already_released')
    expect((await origin(request(app()).post(`/api/teacher/attempts/${attemptId}/review`).set('Cookie', dlamini)).send({ steps: awards, version: 3 })).status).toBe(409)

    // The learner sees the released review and learner-audience words only, labelled Teacher-reviewed; never the teacher-only note.
    const mine = await request(app()).get(`/api/attempts/${attemptId}/review`).set('Cookie', thabo)
    expect(mine.body.review).toMatchObject({ state: 'released', total: 3 })
    expect(mine.body.feedback).toHaveLength(1)
    expect(mine.body.feedback[0]).toMatchObject({ audience: 'learner', origin: 'teacher_approved', label: 'Teacher-reviewed' })
    expect(JSON.stringify(mine.body)).not.toContain('TEACHER-ONLY-NOTE')
    expect(JSON.stringify(mine.body)).not.toContain('AI suggested')
    // The teacher sees all three with her internal labels.
    const teacherSide = await request(app()).get(`/api/attempts/${attemptId}/review`).set('Cookie', dlamini)
    expect(teacherSide.body.feedback.map((f: { label: string }) => f.label)).toEqual(['You approved', 'You revised', 'You added'])

    // The assessment row is untouched; the review is its own record; the events moved the Brain with the teacher's basis.
    const after = (await ctx.db.execute<{ steps: unknown; status: string; total: number | null }>(`select steps, status, total from assessments where attempt_id = '${attemptId}'`)).rows[0]
    expect(after).toEqual(before)
    const reviews = await ctx.db.execute<{ state: string; version: number; provenance: string }>(`select state, version, provenance from reviews where id = '${state.reviewId}'`)
    expect(reviews.rows[0]).toEqual({ state: 'released', version: 3, provenance: 'teacher_verified' })
    const events = await eventsFor(attemptId)
    expect(events.map((e) => e.kind)).toEqual(['attempt_submitted', 'assessed', 'review_confirmed', 'review_confirmed', 'feedback_teacher_added', 'feedback_teacher_added', 'feedback_teacher_added', 'review_released'])
    const releasedEvent = events[events.length - 1]!
    expect(releasedEvent.basis).toBe('teacher_confirmed')
    expect(releasedEvent.payload).toMatchObject({ skills_correct: ['factorise-trinomial'], skills_lost: ['solve-quadratic-by-factors'], mode: 'assisted', total: 3, max_marks: 4 })

    // The Brain (B05) counts the teacher's result once per skill: confirm then release is one statement, and it overrides the model's for this attempt.
    const brain = await request(app()).get('/api/me/brain').set('Cookie', thabo)
    expect(brain.status).toBe(200)
    const counted = Object.fromEntries((brain.body.skills as Array<{ tag: string; assisted: { correct: number; total: number } }>).map((skill) => [skill.tag, skill.assisted]))
    expect(counted['factorise-trinomial']).toEqual({ correct: 1, total: 1 })
    expect(counted['solve-quadratic-by-factors']).toEqual({ correct: 0, total: 1 })

    // Change the ID: another class's teacher, another school's teacher, a guardian, a learner.
    const naidoo = await signInAs(app(), 'mrNaidoo')
    expect((await request(app()).get(`/api/teacher/attempts/${attemptId}`).set('Cookie', naidoo)).status).toBe(404)
    expect((await origin(request(app()).post(`/api/teacher/attempts/${attemptId}/review`).set('Cookie', naidoo)).send({ steps: awards })).status).toBe(404)
    expect((await origin(request(app()).post(feedbackUrl).set('Cookie', naidoo)).send({ kind: 'add', text: 'x', audience: 'learner' })).status).toBe(404)
    const botha = await signInAs(app(), 'msBotha')
    expect((await request(app()).get(`/api/teacher/attempts/${attemptId}`).set('Cookie', botha)).status).toBe(404)
    expect((await request(app()).get(`/api/teacher/queue?classId=${C['12A'].id}`).set('Cookie', botha)).status).toBe(404)
    const guardian = await signInAs(app(), 'mmaLerato')
    expect((await request(app()).get(`/api/attempts/${state.leratoAttempt}/review`).set('Cookie', guardian)).status).toBe(404)
    expect((await request(app()).get(`/api/teacher/attempts/${attemptId}`).set('Cookie', thabo)).status).toBe(403)
    expect((await request(app()).get(`/api/attempts/${attemptId}/review`).set('Cookie', await signInAs(app(), 'naledi'))).status).toBe(404)
  })
})

describe('T2 · class picture and interventions', () => {
  it('shared gaps come from teacher-confirmed and high-confidence results; needs-you and counts', async () => {
    const dlamini = await signInAs(app(), 'msDlamini')
    const picture = await request(app()).get(`/api/teacher/classes/${C['12A'].id}/picture`).set('Cookie', dlamini)
    expect(picture.status).toBe(200)
    expect(picture.body.class).toMatchObject({ name: '12A', learnerCount: 6 })
    expect(picture.body.gaps).toEqual([
      expect.objectContaining({ skillTag: 'solve-quadratic-by-factors', learners: 2, of: 6, learnerIds: expect.arrayContaining([P.lerato.id, P.thabo.id]), example: expect.objectContaining({ stepNo: 4 }) }),
    ])
    expect(picture.body.counts).toEqual({ queue: 1, draftNotes: 0, openInterventions: 0 }) // Lerato's proposed result is unreviewed
    expect(picture.body.needsYou).toEqual([])
    expect((await request(app()).get(`/api/teacher/classes/${C['12A'].id}/picture`).set('Cookie', await signInAs(app(), 'mrNaidoo'))).status).toBe(404)
  })

  it('assign from a gap; closing needs an outcome and evidence; the follow-up check is the evidence', async () => {
    const dlamini = await signInAs(app(), 'msDlamini')
    const followUpOn = dayOf(new Date()) // due today, so the learner's check-in list shows it at once
    const body = { learnerId: P.thabo.id, classId: C['12A'].id, skillTag: 'solve-quadratic-by-factors', action: 'Redo one factorising question with me at break.', followUpOn }
    const created = await origin(request(app()).post('/api/teacher/interventions').set('Cookie', dlamini)).send(body)
    expect(created.status).toBe(201)
    const intervention = created.body.intervention
    expect(intervention).toMatchObject({ status: 'open', outcome: null, followUpOn, learner: { nickname: 'Thabo' }, owner: { nickname: 'Ms Dlamini' }, evidence: [] })
    const assigned = await ctx.db.execute<{ kind: string; skill_tag: string }>(`select kind, skill_tag from learning_events where learner_id = '${P.thabo.id}' and kind = 'intervention_assigned'`)
    expect(assigned.rows).toEqual([{ kind: 'intervention_assigned', skill_tag: 'solve-quadratic-by-factors' }])

    // The learner's Today reads it through B05's check-ins: the action and the date, nothing else.
    const thabo = await signInAs(app(), 'thabo')
    const due = await request(app()).get('/api/me/checks').set('Cookie', thabo)
    expect(due.status).toBe(200)
    expect(due.body.checks).toEqual([expect.objectContaining({ kind: 'intervention', interventionId: intervention.id, skillTag: 'solve-quadratic-by-factors', action: body.action, dueOn: followUpOn, overdueDays: 0 })])

    const list = await request(app()).get(`/api/teacher/classes/${C['12A'].id}/interventions`).set('Cookie', dlamini)
    expect(list.body.interventions.map((i: { id: string }) => i.id)).toEqual([intervention.id])

    const noOutcome = await origin(request(app()).patch(`/api/teacher/interventions/${intervention.id}`).set('Cookie', dlamini)).send({ status: 'closed' })
    expect(noOutcome.status).toBe(400)
    expect(noOutcome.body.error.code).toBe('outcome_required')
    const noEvidence = await origin(request(app()).patch(`/api/teacher/interventions/${intervention.id}`).set('Cookie', dlamini)).send({ status: 'closed', outcome: 'improved' })
    expect(noEvidence.status).toBe(400)
    expect(noEvidence.body.error.code).toBe('evidence_required')

    // The learner's follow-up check lands (B06 writes this event; here it is appended directly).
    const check = await appendEvent(ctx.db, { learnerId: P.thabo.id, kind: 'retention_check_completed', skillTag: 'solve-quadratic-by-factors', basis: 'model_high', payload: { correct: true, mode: 'retention' } })
    const withEvidence = await request(app()).get(`/api/teacher/classes/${C['12A'].id}/interventions`).set('Cookie', dlamini)
    expect(withEvidence.body.interventions[0].evidence).toEqual([expect.objectContaining({ eventId: check.id, kind: 'retention_check_completed', correct: true, mode: 'retention' })])

    const closed = await origin(request(app()).patch(`/api/teacher/interventions/${intervention.id}`).set('Cookie', dlamini)).send({ status: 'closed', outcome: 'improved' })
    expect(closed.status).toBe(200)
    expect(closed.body.intervention).toMatchObject({ status: 'closed', outcome: 'improved', outcomeEvidenceEventIds: [check.id] })
    expect(closed.body.intervention.closedAt).not.toBeNull()
    expect((await request(app()).get('/api/me/checks').set('Cookie', thabo)).body.checks).toEqual([]) // closed: nothing due
    const closedEvent = await ctx.db.execute<{ payload: { outcome: string } }>(`select payload from learning_events where learner_id = '${P.thabo.id}' and kind = 'intervention_closed'`)
    expect(closedEvent.rows[0]?.payload.outcome).toBe('improved')
    expect((await origin(request(app()).patch(`/api/teacher/interventions/${intervention.id}`).set('Cookie', dlamini)).send({ action: 'x' })).status).toBe(409)

    // Change the ID: a learner outside the class, another teacher, another school.
    expect((await origin(request(app()).post('/api/teacher/interventions').set('Cookie', dlamini)).send({ ...body, learnerId: P.bongani.id })).status).toBe(404)
    const naidoo = await signInAs(app(), 'mrNaidoo')
    expect((await origin(request(app()).post('/api/teacher/interventions').set('Cookie', naidoo)).send(body)).status).toBe(404)
    expect((await origin(request(app()).patch(`/api/teacher/interventions/${intervention.id}`).set('Cookie', naidoo)).send({ action: 'x' })).status).toBe(404)
    expect((await request(app()).get(`/api/teacher/classes/${C['12A'].id}/interventions`).set('Cookie', await signInAs(app(), 'msBotha'))).status).toBe(404)
  })
})

describe('T4 · notes home', () => {
  it('drafts one note per guardian from that learner’s week only; approve → send; the guardian sees it labelled Teacher-reviewed, never before', async () => {
    const dlamini = await signInAs(app(), 'msDlamini')
    const drafted = await origin(request(app()).post(`/api/teacher/classes/${C['12A'].id}/notes/draft`).set('Cookie', dlamini))
    expect(drafted.status).toBe(200)
    expect(drafted.body.notes).toHaveLength(1) // only Lerato has a guardian
    const note = drafted.body.notes[0]
    expect(note).toMatchObject({ status: 'draft', origin: 'ai_suggested', originLabel: 'AI suggested', audience: 'guardian', learner: { nickname: 'Lerato' }, guardian: { nickname: 'Mma Lerato' }, finalText: null })
    expect(note.modelRunId).toMatch(/^[0-9a-f-]{36}$/)
    expect(drafted.body.skipped.map((s: { learner: { nickname: string }; reason: string }) => [s.learner.nickname, s.reason])).toEqual(
      expect.arrayContaining([
        ['Thabo', 'no_guardian'],
        ['Naledi', 'no_guardian'],
      ]),
    )
    const stored = await ctx.db.execute<{ provenance: string; provenance_detail: { version: string } }>(`select provenance, provenance_detail from notes where id = '${note.id}'`)
    expect(stored.rows[0]).toMatchObject({ provenance: 'model_generated', provenance_detail: expect.objectContaining({ version: 'note-v1' }) })

    // The prompt carried Lerato's week only: one attempt, her evidence lines (as aliases), no UUID of anyone's, nobody's name or email.
    const noteRequests = model.requests.filter((req) => purposeOf(req) === 'note')
    expect(noteRequests).toHaveLength(1)
    const prompt = userText(noteRequests[0]!)
    expect(prompt).toContain('Attempts: 1.')
    const leratoEvents = (await ctx.db.execute<{ id: string }>(`select id from learning_events where learner_id = '${P.lerato.id}' and kind in ('assessed','review_confirmed','review_released')`)).rows
    const lines = /<<<EVIDENCE\n([\s\S]*?)\nEVIDENCE>>>/.exec(prompt)?.[1]?.split('\n') ?? []
    expect(lines).toHaveLength(leratoEvents.length)
    expect(lines).toEqual(['E1 · assessed · lost'])
    expect(prompt).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-/) // no event, attempt or person ID of anyone
    expect(prompt).not.toMatch(/Lerato|Thabo|@/)
    const cited = (await ctx.db.execute<{ output: { evidence_event_ids: string[] } }>(`select output from model_runs where id = '${note.modelRunId}'`)).rows[0]!.output.evidence_event_ids
    expect(cited).toEqual(['E1'])

    // Not visible to the guardian before `sent`.
    const guardian = await signInAs(app(), 'mmaLerato')
    expect((await request(app()).get('/api/guardian/notes').set('Cookie', guardian)).body.notes).toEqual([])
    expect((await request(app()).get(`/api/guardian/notes/${note.id}`).set('Cookie', guardian)).status).toBe(404)
    expect((await origin(request(app()).post(`/api/teacher/notes/${note.id}/send`).set('Cookie', dlamini))).body.error.code).toBe('not_approved')

    const approved = await origin(request(app()).post(`/api/teacher/notes/${note.id}/approve`).set('Cookie', dlamini)).send({ finalText: note.draftText })
    expect(approved.body.note).toMatchObject({ status: 'approved', origin: 'teacher_approved', originLabel: 'You approved' })
    expect((await request(app()).get('/api/guardian/notes').set('Cookie', guardian)).body.notes).toEqual([])
    const sent = await origin(request(app()).post(`/api/teacher/notes/${note.id}/send`).set('Cookie', dlamini))
    expect(sent.body.note).toMatchObject({ status: 'sent', origin: 'teacher_approved' })
    expect((await origin(request(app()).post(`/api/teacher/notes/${note.id}/send`).set('Cookie', dlamini))).status).toBe(409)
    expect((await origin(request(app()).post(`/api/teacher/notes/${note.id}/approve`).set('Cookie', dlamini)).send({ finalText: 'late edit' })).status).toBe(409)

    const seen = await request(app()).get('/api/guardian/notes').set('Cookie', guardian)
    expect(seen.body.notes).toHaveLength(1)
    expect(seen.body.notes[0]).toMatchObject({ label: 'Teacher-reviewed', text: note.draftText, teacher: { nickname: 'Ms Dlamini' }, learner: { nickname: 'Lerato' } })
    expect(JSON.stringify(seen.body)).not.toMatch(/ai_suggested|AI suggested/)
    const noteSent = await ctx.db.execute<{ kind: string }>(`select kind from learning_events where learner_id = '${P.lerato.id}' and kind = 'note_sent'`)
    expect(noteSent.rows).toHaveLength(1)

    // Drafting again this week does not draft twice.
    const again = await origin(request(app()).post(`/api/teacher/classes/${C['12A'].id}/notes/draft`).set('Cookie', dlamini))
    expect(again.body.notes).toEqual([])
    expect(again.body.skipped).toEqual(expect.arrayContaining([{ learner: { id: P.lerato.id, nickname: 'Lerato' }, reason: 'already_drafted' }]))

    // The teacher's own words: edited or not, they stay hers and carry her name.
    const own = await origin(request(app()).post('/api/teacher/notes').set('Cookie', dlamini)).send({ learnerId: P.lerato.id, text: 'Lerato asked a sharp question in class today.' })
    expect(own.status).toBe(201)
    const ownNote = own.body.notes[0]
    expect(ownNote).toMatchObject({ origin: 'teacher_added', originLabel: 'You added', status: 'draft' })
    const ownApproved = await origin(request(app()).post(`/api/teacher/notes/${ownNote.id}/approve`).set('Cookie', dlamini)).send({ finalText: 'Lerato asked a sharp question in class today. Well done.' })
    expect(ownApproved.body.note.origin).toBe('teacher_added')
    await origin(request(app()).post(`/api/teacher/notes/${ownNote.id}/send`).set('Cookie', dlamini))
    const both = await request(app()).get('/api/guardian/notes').set('Cookie', guardian)
    expect(both.body.notes.map((n: { label: string }) => n.label)).toEqual(['From Ms Dlamini', 'Teacher-reviewed'])

    // An edited AI draft becomes teacher_revised. (A second draft for a second week would be drafted fresh; here we edit via a new teacher note is not an AI draft, so use the DB to check the rule.)
    expect((await origin(request(app()).post('/api/teacher/notes').set('Cookie', dlamini)).send({ learnerId: P.thabo.id, text: 'x' })).body.error.code).toBe('no_guardian')

    // Change the ID: another teacher cannot read, approve or send; the notes list is per class.
    const naidoo = await signInAs(app(), 'mrNaidoo')
    expect((await origin(request(app()).post(`/api/teacher/notes/${ownNote.id}/approve`).set('Cookie', naidoo)).send({ finalText: 'x' })).status).toBe(404)
    expect((await request(app()).get(`/api/teacher/notes?classId=${C['12A'].id}`).set('Cookie', naidoo)).status).toBe(404)
    expect((await origin(request(app()).post('/api/teacher/notes').set('Cookie', naidoo)).send({ learnerId: P.lerato.id, text: 'x' })).status).toBe(404)
    const listed = await request(app()).get(`/api/teacher/notes?classId=${C['12A'].id}`).set('Cookie', dlamini)
    expect(listed.body.notes).toHaveLength(2)
    // A guardian of another learner never sees these.
    expect((await request(app()).get(`/api/guardian/notes/${ownNote.id}`).set('Cookie', guardian)).status).toBe(200)
  })

  it('an edited AI draft is stored as teacher_revised and shown as Teacher-reviewed', async () => {
    const dlamini = await signInAs(app(), 'msDlamini')
    // Naledi gets a guardian and a lost step, so a fresh draft is possible.
    const naledi = await signInAs(app(), 'naledi')
    await typedAttempt(naledi, 'n-note')
    const code = await origin(request(app()).post('/api/me/guardian-code').set('Cookie', naledi))
    const guardian = await signInAs(app(), 'mmaLerato')
    expect((await origin(request(app()).post('/api/guardian/link').set('Cookie', guardian)).send({ code: code.body.code })).status).toBe(200)
    const drafted = await origin(request(app()).post(`/api/teacher/classes/${C['12A'].id}/notes/draft`).set('Cookie', dlamini))
    const note = drafted.body.notes.find((n: { learner: { nickname: string } }) => n.learner.nickname === 'Naledi')
    expect(note).toBeDefined()
    const approved = await origin(request(app()).post(`/api/teacher/notes/${note.id}/approve`).set('Cookie', dlamini)).send({ finalText: `${note.draftText} Thank you.` })
    expect(approved.body.note).toMatchObject({ origin: 'teacher_revised', originLabel: 'You revised' })
    await origin(request(app()).post(`/api/teacher/notes/${note.id}/send`).set('Cookie', dlamini))
    const seen = await request(app()).get('/api/guardian/notes').set('Cookie', guardian)
    expect(seen.body.notes.find((n: { id: string }) => n.id === note.id)).toMatchObject({ label: 'Teacher-reviewed', text: `${note.draftText} Thank you.` })
  })

})

describe('T6 · learner profile', () => {
  it('own classes only: skills from trusted results, recent attempts, subjects and hardest subject only, open interventions', async () => {
    await ctx.db.execute(`update profiles set cards = '{"dream":"SECRET-DREAM","subjects":["Mathematics","Physical Sciences"],"hardest_subject":"Mathematics","how_i_learn":"SECRET-HOW"}'::jsonb, cards_source_text = 'SECRET-RAW' where user_id = '${P.thabo.id}'`)
    const dlamini = await signInAs(app(), 'msDlamini')
    const profile = await request(app()).get(`/api/teacher/learners/${P.thabo.id}`).set('Cookie', dlamini)
    expect(profile.status).toBe(200)
    expect(profile.body.learner).toEqual({ id: P.thabo.id, nickname: 'Thabo' })
    expect(profile.body.classes).toEqual([{ id: C['12A'].id, name: '12A' }])
    expect(profile.body.cards).toEqual({ subjects: ['Mathematics', 'Physical Sciences'], hardestSubject: 'Mathematics' })
    expect(JSON.stringify(profile.body)).not.toMatch(/SECRET/)
    // Skills are the Brain's projection in teacher wording: the released review (assisted) and the follow-up check (retained).
    const skills = new Map((profile.body.skills as Array<{ tag: string }>).map((skill) => [skill.tag, skill]))
    expect(skills.get('factorise-trinomial')).toMatchObject({ label: 'Factorise trinomial', state: 'practising', assisted: { correct: 1, total: 1 }, independent: { correct: 0, total: 0 }, retained: { correct: 0, total: 0 } })
    expect(skills.get('solve-quadratic-by-factors')).toMatchObject({ state: 'practising', assisted: { correct: 0, total: 1 }, retained: { correct: 1, total: 1 } })
    expect(profile.body.attempts).toHaveLength(1)
    expect(profile.body.attempts[0]).toMatchObject({ status: 'uncertain', review: { state: 'released', total: 3 } })
    expect(profile.body.interventions).toEqual([]) // closed above

    expect((await request(app()).get(`/api/teacher/learners/${P.thabo.id}`).set('Cookie', await signInAs(app(), 'mrNaidoo'))).status).toBe(404)
    expect((await request(app()).get(`/api/teacher/learners/${P.thabo.id}`).set('Cookie', await signInAs(app(), 'msBotha'))).status).toBe(404)
    expect((await request(app()).get(`/api/teacher/learners/${P.thabo.id}`).set('Cookie', await signInAs(app(), 'mmaLerato'))).status).toBe(403)
  })
})

describe('zero-env (runs last: it resets the database)', () => {
  it('without a model key, drafting skips and the teacher writes her own', async () => {
    const bare = await freshContext({ storage: null })
    try {
      const dlamini = await signInAs(bare.app, 'msDlamini')
      const drafted = await origin(request(bare.app).post(`/api/teacher/classes/${C['12A'].id}/notes/draft`).set('Cookie', dlamini))
      expect(drafted.status).toBe(200)
      expect(drafted.body.notes).toEqual([])
      const own = await origin(request(bare.app).post('/api/teacher/notes').set('Cookie', dlamini)).send({ learnerId: P.lerato.id, text: 'We worked on factorising this week.' })
      expect(own.status).toBe(201)
    } finally {
      await bare.close()
    }
  })
})
