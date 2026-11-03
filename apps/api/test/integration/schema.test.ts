import { sql } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { appendEvent } from '../../src/evidence/append.js'
import { APPEND_ONLY_TABLES, PROVENANCE_TABLES, assessments, attempts, items, modelRuns } from '../../src/db/schema.js'
import { SEED_PEOPLE } from '../../src/db/seed-data.js'
import { expectDbError, freshContext, type TestContext } from './db.js'

let ctx: TestContext

beforeAll(async () => {
  ctx = await freshContext()
})
afterAll(async () => {
  await ctx.close()
})

describe('append-only guard (migration 0002)', () => {
  it('rejects UPDATE and DELETE on learning_events, assessments and model_runs', async () => {
    const { db } = ctx
    const learnerId = SEED_PEOPLE.lerato.id
    const [item] = await db.select({ id: items.id, revision: items.revision }).from(items).limit(1)
    if (!item) throw new Error('seed produced no items')

    const event = await appendEvent(db, { learnerId, kind: 'profile_set', basis: 'none', payload: { cards: 4 } })
    const [attempt] = await db
      .insert(attempts)
      .values({
        learnerId,
        itemId: item.id,
        itemRevision: item.revision,
        kind: 'typed',
        answerText: 'x = 2 or x = 3',
        idempotencyKey: 'schema-test-1',
        provenance: 'student_provided',
      })
      .returning({ id: attempts.id })
    if (!attempt) throw new Error('no attempt')
    const [assessment] = await db
      .insert(assessments)
      .values({
        attemptId: attempt.id,
        status: 'uncertain',
        steps: [],
        modelId: 'muse-spark-1.3',
        promptVersion: 'mark-v1',
        consistencyCheck: 'skipped',
        latencyMs: 1,
        costUsd: '0',
        requestId: 'r1',
        provenance: 'model_generated',
        provenanceDetail: { provider: 'meta', model: 'muse-spark-1.3', version: 'mark-v1', model_run_id: event.id },
      })
      .returning({ id: assessments.id })
    const [run] = await db
      .insert(modelRuns)
      .values({
        purpose: 'assess',
        subjectType: 'attempt',
        subjectId: attempt.id,
        modelId: 'muse-spark-1.3',
        promptVersion: 'mark-v1',
        requestId: 'r1',
        latencyMs: 1,
        status: 'accepted',
      })
      .returning({ id: modelRuns.id })
    if (!assessment || !run) throw new Error('no rows')

    const mutations = [
      sql`update learning_events set skill_tag = 'x' where id = ${event.id}`,
      sql`delete from learning_events where id = ${event.id}`,
      sql`update assessments set status = 'proposed' where id = ${assessment.id}`,
      sql`delete from assessments where id = ${assessment.id}`,
      sql`update model_runs set status = 'failed' where id = ${run.id}`,
      sql`delete from model_runs where id = ${run.id}`,
    ]
    for (const mutation of mutations) {
      await expectDbError(db.execute(mutation), /append-only/)
    }
    // The rows are untouched.
    const [still] = (await db.execute<{ n: string }>(sql`select count(*)::text as n from learning_events`)).rows
    expect(Number(still?.n)).toBe(1)
    expect(APPEND_ONLY_TABLES).toEqual(['learning_events', 'assessments', 'model_runs'])
  })

  it('refuses a model run outside the Standard tier (D24)', async () => {
    await expectDbError(
      ctx.db.execute(
        sql`insert into model_runs (purpose, subject_type, subject_id, model_id, tier, prompt_version, request_id, latency_ms, status)
            values ('assess', 'attempt', uuid_generate_v7(), 'muse-spark-1.3-contributor', 'contributor', 'v', 'r', 1, 'accepted')`,
      ),
      /model_runs_tier_standard/,
    )
  })
})

describe('schools and provenance (spec 03 §9.1)', () => {
  it('rejects a class without a school', async () => {
    await expectDbError(
      ctx.db.execute(
        sql`insert into classes (name, teacher_id, code_hash) values ('no school', ${SEED_PEOPLE.msDlamini.id}, 'h')`,
      ),
      /school_id/,
    )
  })

  it('every artifact table requires provenance and defaults training permission to not_permitted', async () => {
    for (const table of PROVENANCE_TABLES) {
      const rows = (
        await ctx.db.execute<{ column_name: string; is_nullable: string; column_default: string | null }>(
          sql`select column_name, is_nullable, column_default from information_schema.columns
              where table_schema = 'public' and table_name = ${table}
                and column_name in ('provenance', 'training_permission', 'provenance_detail')`,
        )
      ).rows
      const byName = Object.fromEntries(rows.map((r) => [r.column_name, r]))
      expect(byName['provenance']?.is_nullable, `${table}.provenance`).toBe('NO')
      expect(byName['provenance']?.column_default, `${table}.provenance has no default`).toBeNull()
      expect(byName['training_permission']?.is_nullable, `${table}.training_permission`).toBe('NO')
      expect(byName['training_permission']?.column_default).toContain('not_permitted')
      expect(byName['provenance_detail']?.is_nullable).toBe('YES')
    }
  })

  it('no seeded or test-written row is training-permitted', async () => {
    for (const table of PROVENANCE_TABLES) {
      const [row] = (
        await ctx.db.execute<{ n: string }>(
          sql.raw(`select count(*)::text as n from "${table}" where training_permission = 'permitted'`),
        )
      ).rows
      expect(Number(row?.n), table).toBe(0)
    }
    const [seeded] = (await ctx.db.execute<{ n: string }>(sql`select count(*)::text as n from items`)).rows
    expect(Number(seeded?.n)).toBeGreaterThan(0)
  })

  it('primary keys are UUID v7', async () => {
    const [row] = (await ctx.db.execute<{ id: string }>(sql`select id from items limit 1`)).rows
    expect(row?.id[14]).toBe('7')
  })
})
