import type { ModelPurpose } from '@guardian-book/shared'
import type { DbOrTx } from '../../db/client.js'
import { modelRuns } from '../../db/schema.js'
import type { VerifiedRun } from '../../gateway/verifiedCall.js'

/**
 * One `model_runs` row per call (spec 03 §8.1: "Every model call in the app has a row").
 *
 * B04 owns the shared `apps/api/src/modelRuns/` helper (with the daily spend caps); it is
 * not on `main` yet, so this file does the one insert the profile route needs. Once B04
 * merges, the profile route should call B04's helper and this file goes.
 */

export interface RecordRunsParams {
  purpose: ModelPurpose
  subjectType: string
  subjectId: string
  promptVersion: string
  /** The gateway's model ID, used when a failed run has none of its own. */
  fallbackModel: string
}

/** Inserts every run and returns the row IDs in order (the accepted run is the last one when accepted). */
export async function recordRuns(db: DbOrTx, params: RecordRunsParams, runs: readonly VerifiedRun[]): Promise<string[]> {
  const ids: string[] = []
  for (const run of runs) {
    const [row] = await db
      .insert(modelRuns)
      .values({
        purpose: params.purpose,
        subjectType: params.subjectType,
        subjectId: params.subjectId,
        modelId: run.model ?? params.fallbackModel,
        tier: 'standard',
        promptVersion: params.promptVersion,
        requestId: run.requestId ?? 'none',
        inputTokens: run.usage?.inputTokens ?? 0,
        outputTokens: run.usage?.outputTokens ?? 0,
        costUsd: run.costUsd.toFixed(6),
        latencyMs: run.latencyMs,
        output: run.output,
        checks: run.checks,
        attemptNo: run.attemptNo,
        status: run.status,
      })
      .returning({ id: modelRuns.id })
    if (!row) throw new Error('model_runs insert returned no row')
    ids.push(row.id)
  }
  return ids
}
