import { MODEL_OUTPUT_SCHEMAS, type ModelOutputOf, type ModelProvenance, type ModelPurpose } from '@guardian-book/shared'
import type { z } from 'zod'
import { runChecks, type CheckContexts, type CheckResult } from '../verify/index.js'
import { GatewayError, isGatewayError } from './errors.js'
import type { Gateway } from './gateway.js'
import type { TokenUsage } from './pricing.js'
import type { ImageInput } from './transport.js'

/**
 * The retry runner (P0-11, spec 03 §8.4): call → checks → on failure re-ask with the failed
 * codes and details appended to the user message, at most `MAX_VERIFIED_CALLS` calls in
 * total. Every call becomes one run record (one `model_runs` row in B04).
 *
 * Status of the whole call:
 * - `accepted`: every check passed; `output` is typed and safe to use.
 * - `exhausted`: checks still failed after the budget, or a non-retryable check failed
 *   (abstain). The subject becomes `uncertain` and goes to the teacher.
 * - `failed`: the gateway could not get an answer (timeout, provider, config). The subject
 *   becomes `failed`; the learner can retry. No mark is shown.
 */

export const MAX_VERIFIED_CALLS = 3

export type VerifiedRunStatus = 'accepted' | 'retried' | 'exhausted' | 'failed'

export interface VerifiedRun {
  /** 1-based call number within this verified call. */
  attemptNo: number
  status: VerifiedRunStatus
  /** The raw parsed output of this call (untrusted), or null when the call failed. */
  output: unknown
  checks: CheckResult[]
  usage: TokenUsage | null
  costUsd: number
  latencyMs: number
  requestId: string | null
  model: string | null
  error: { code: string; message: string } | null
}

export interface VerifiedCallParams<P extends ModelPurpose> {
  gateway: Gateway
  purpose: P
  promptVersion: string
  system: string
  user: string
  images?: ImageInput[]
  context: CheckContexts[P]
  maxTokens: number
  timeoutMs?: number
  signal?: AbortSignal
  /** Defaults to `MAX_VERIFIED_CALLS`; never more than it. */
  maxCalls?: number
}

export interface VerifiedCallResult<T> {
  status: 'accepted' | 'exhausted' | 'failed'
  /** Typed output when `accepted`; null otherwise. */
  output: T | null
  runs: VerifiedRun[]
  totalCostUsd: number
  totalLatencyMs: number
  provenance: ModelProvenance | null
  error: GatewayError | null
}

/** The re-ask text: the original user message, then the failed checks in plain words. */
export function appendFailures(user: string, failed: CheckResult[]): string {
  const lines = failed.map((check) => `- ${check.code}: ${check.detail}`)
  return `${user}\n\n---\nYour previous answer failed these checks. Fix every one and reply again with the complete JSON object:\n${lines.join('\n')}`
}

export async function verifiedCall<P extends ModelPurpose>(params: VerifiedCallParams<P>): Promise<VerifiedCallResult<ModelOutputOf<P>>> {
  const maxCalls = Math.max(1, Math.min(MAX_VERIFIED_CALLS, params.maxCalls ?? MAX_VERIFIED_CALLS))
  const runs: VerifiedRun[] = []
  let user = params.user
  let provenance: ModelProvenance | null = null
  const totals = (): { totalCostUsd: number; totalLatencyMs: number } => ({
    totalCostUsd: Math.round(runs.reduce((acc, run) => acc + run.costUsd, 0) * 1e8) / 1e8,
    totalLatencyMs: runs.reduce((acc, run) => acc + run.latencyMs, 0),
  })

  for (let attemptNo = 1; attemptNo <= maxCalls; attemptNo += 1) {
    let call
    try {
      call = await params.gateway.callStructured({
        purpose: params.purpose,
        promptVersion: params.promptVersion,
        system: params.system,
        user,
        images: params.images ?? [],
        // The union over purposes collapses to the base type; the output is `unknown` anyway.
        schema: MODEL_OUTPUT_SCHEMAS[params.purpose] as z.ZodType,
        maxTokens: params.maxTokens,
        ...(params.timeoutMs !== undefined ? { timeoutMs: params.timeoutMs } : {}),
        ...(params.signal ? { signal: params.signal } : {}),
      })
    } catch (err: unknown) {
      if (!isGatewayError(err)) throw err
      runs.push({
        attemptNo,
        status: 'failed',
        output: null,
        checks: [],
        usage: null,
        costUsd: 0,
        latencyMs: 0,
        requestId: err.requestId,
        model: params.gateway.model,
        error: { code: err.code, message: err.message },
      })
      return { status: 'failed', output: null, runs, ...totals(), provenance, error: err }
    }

    provenance = call.provenance
    const checks = runChecks(params.purpose, call.output, params.context)
    const base = {
      attemptNo,
      output: call.output,
      checks: checks.checks,
      usage: call.usage,
      costUsd: call.costUsd,
      latencyMs: call.latencyMs,
      requestId: call.requestId,
      model: call.model,
      error: null,
    }

    if (checks.passed && checks.data !== null) {
      runs.push({ ...base, status: 'accepted' })
      return { status: 'accepted', output: checks.data, runs, ...totals(), provenance, error: null }
    }
    if (checks.abstain || attemptNo === maxCalls) {
      runs.push({ ...base, status: 'exhausted' })
      return { status: 'exhausted', output: null, runs, ...totals(), provenance, error: null }
    }
    runs.push({ ...base, status: 'retried' })
    user = appendFailures(params.user, checks.failed)
  }

  // Unreachable: the loop returns on its last iteration. Kept for the type checker.
  throw new GatewayError('invalid_output', 'verifiedCall ended without a result')
}
