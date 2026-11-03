import { learningEventInputSchema, type LearningEventInput } from '@guardian-book/shared'
import type { DbOrTx } from '../db/client.js'
import { learningEvents } from '../db/schema.js'

/**
 * The one event writer (spec 03 §2, §3; CLAUDE.md rule 1). Validates the event against the
 * shared contract and inserts it. Nothing else in the codebase writes `learning_events`,
 * and the database refuses UPDATE and DELETE on the table (migration 0002), so the Brain's
 * evidence is append-only by construction, not by convention.
 *
 * Later briefs import this; they never touch the table directly.
 */
export async function appendEvent(db: DbOrTx, input: LearningEventInput): Promise<{ id: string; occurredAt: Date }> {
  const event = learningEventInputSchema.parse(input)
  const [row] = await db
    .insert(learningEvents)
    .values({
      learnerId: event.learnerId,
      kind: event.kind,
      attemptId: event.attemptId,
      itemId: event.itemId,
      skillTag: event.skillTag,
      basis: event.basis,
      payload: event.payload,
      ...(event.occurredAt ? { occurredAt: event.occurredAt } : {}),
    })
    .returning({ id: learningEvents.id, occurredAt: learningEvents.occurredAt })
  if (!row) throw new Error('appendEvent: insert returned no row')
  return row
}
