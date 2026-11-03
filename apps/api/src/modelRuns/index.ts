import type { ModelOutputOf, ModelPurpose } from '@guardian-book/shared'
import type { Db } from '../db/client.js'
import type { Gateway } from '../gateway/gateway.js'
import type { ImageInput } from '../gateway/transport.js'
import { MAX_VERIFIED_CALLS, verifiedCall, type VerifiedCallResult } from '../gateway/verifiedCall.js'
import type { CheckContexts } from '../verify/index.js'
import type { Logger } from '../logger.js'
import { budgetExhausted, checkCaps, recordUsage, type CapLimits } from './caps.js'
import { recordModelRuns } from './record.js'

export { DEFAULT_DAILY_BUDGET_USD, DEFAULT_USER_DAILY_CALLS, budgetExhausted, capLimits, checkCaps, decideCaps, recordUsage, sastDay, usageToday, type CapCheck, type CapLimits, type CapReason } from './caps.js'
export { recordModelRuns, wasACall, type RecordRunsInput } from './record.js'
export { JobRegistry } from './jobs.js'

/**
 * The one way the app makes a model call (brief B04 §3; B05 and B06 call this too):
 *
 *   caps check → `verifiedCall` (B03: call → checks → re-ask, ≤ 3 calls) → one
 *   `model_runs` row per call → today's usage updated.
 *
 * The per-user cap bounds the calls inside one verified call too: with 2 calls left, the
 * re-ask budget is 2. A cap that is already reached throws 429 `budget_exhausted` before
 * anything is sent.
 */

export interface ModelRunDeps {
  db: Db
  gateway: Gateway
  logger: Logger
  limits: CapLimits
  now?: () => Date
}

export interface RunModelParams<P extends ModelPurpose> {
  /** Whose daily cap this counts against. */
  userId: string
  purpose: P
  subjectType: string
  subjectId: string
  promptVersion: string
  system: string
  user: string
  images?: ImageInput[]
  context: CheckContexts[P]
  maxTokens: number
  timeoutMs?: number
  signal?: AbortSignal
  maxCalls?: number
}

export interface RunModelResult<T> {
  result: VerifiedCallResult<T>
  /** `model_runs.id` per run, in order; empty string where no call was made. */
  runIds: string[]
  /** The row of the last run that was a real call, or null. */
  lastRunId: string | null
}

export async function runModel<P extends ModelPurpose>(deps: ModelRunDeps, params: RunModelParams<P>): Promise<RunModelResult<ModelOutputOf<P>>> {
  const now = deps.now ?? (() => new Date())
  const cap = await checkCaps(deps.db, params.userId, deps.limits, now())
  if (!cap.ok) {
    deps.logger.warn('model call refused by cap', { purpose: params.purpose, reason: cap.reason, subjectType: params.subjectType, subjectId: params.subjectId })
    throw budgetExhausted(cap.reason)
  }
  const maxCalls = Math.max(1, Math.min(params.maxCalls ?? MAX_VERIFIED_CALLS, cap.remainingCalls))

  const result = await verifiedCall({
    gateway: deps.gateway,
    purpose: params.purpose,
    promptVersion: params.promptVersion,
    system: params.system,
    user: params.user,
    images: params.images ?? [],
    context: params.context,
    maxTokens: params.maxTokens,
    maxCalls,
    ...(params.timeoutMs !== undefined ? { timeoutMs: params.timeoutMs } : {}),
    ...(params.signal ? { signal: params.signal } : {}),
  })

  const runIds = await recordModelRuns(deps.db, {
    purpose: params.purpose,
    subjectType: params.subjectType,
    subjectId: params.subjectId,
    promptVersion: params.promptVersion,
    fallbackModel: deps.gateway.model,
    runs: result.runs,
  })
  const calls = runIds.filter((id) => id !== '').length
  await recordUsage(deps.db, { userId: params.userId, calls, costUsd: result.totalCostUsd, now: now() })

  const lastRunId = [...runIds].reverse().find((id) => id !== '') ?? null
  return { result, runIds, lastRunId }
}
