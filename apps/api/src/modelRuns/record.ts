import type { ModelPurpose } from '@guardian-book/shared'
import type { DbOrTx } from '../db/client.js'
import { modelRuns } from '../db/schema.js'
import type { VerifiedRun } from '../gateway/verifiedCall.js'

/**
 * One `model_runs` row per model call (spec 03 §8.1): purpose, subject, model, prompt
 * version, request ID, tokens, cost, latency, the raw output, the checks with pass/fail,
 * the attempt number (1–3) and the run status. Written once; the table is append-only.
 *
 * A run whose error says no request was made (gateway off, model refused, unpriced) has
 * no row: "every model call has a row", and that was not a call.
 */

const NOT_A_CALL = new Set(['not_configured', 'refused_model', 'unpriced_model'])

export function wasACall(run: VerifiedRun): boolean {
  return run.status !== 'failed' || run.error === null || !NOT_A_CALL.has(run.error.code)
}

export interface RecordRunsInput {
  purpose: ModelPurpose
  subjectType: string
  subjectId: string
  promptVersion: string
  /** The configured model, for runs that failed before the provider named one. */
  fallbackModel: string
  runs: VerifiedRun[]
}

/** Inserts the rows and returns their IDs in run order (an empty string where no row was written). */
export async function recordModelRuns(db: DbOrTx, input: RecordRunsInput): Promise<string[]> {
  const ids: string[] = []
  for (const run of input.runs) {
    if (!wasACall(run)) {
      ids.push('')
      continue
    }
    const [row] = await db
      .insert(modelRuns)
      .values({
        purpose: input.purpose,
        subjectType: input.subjectType,
        subjectId: input.subjectId,
        modelId: run.model ?? input.fallbackModel,
        tier: 'standard',
        promptVersion: input.promptVersion,
        requestId: run.requestId ?? 'none',
        inputTokens: run.usage?.inputTokens ?? 0,
        outputTokens: run.usage?.outputTokens ?? 0,
        costUsd: run.costUsd.toFixed(6),
        latencyMs: Math.max(0, Math.round(run.latencyMs)),
        output: run.output === null ? (run.error ? { error: run.error } : null) : run.output,
        checks: run.checks,
        attemptNo: Math.min(3, Math.max(1, run.attemptNo)),
        status: run.status,
      })
      .returning({ id: modelRuns.id })
    if (!row) throw new Error('model_runs insert returned no row')
    ids.push(row.id)
  }
  return ids
}
