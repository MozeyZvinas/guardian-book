import { describe, expect, it } from 'vitest'
import { loadConfig } from '../config.js'
import { goodOutput, quadraticContext, step } from '../verify/fixtures.js'
import { createGateway } from './gateway.js'
import { capturingLogger, httpError, okResponse, scriptedTransport } from './testing.js'
import type { TransportResult } from './transport.js'
import { MAX_VERIFIED_CALLS, appendFailures, verifiedCall } from './verifiedCall.js'

function setup(script: TransportResult[]) {
  const config = loadConfig({ META_API_KEY: 'test-key-not-real' }).meta
  const scripted = scriptedTransport(script)
  const gateway = createGateway({ config, logger: capturingLogger().logger, transport: scripted.transport, sleep: async () => {}, random: () => 0 })
  return { gateway, scripted }
}

const context = quadraticContext()
const base = {
  purpose: 'assess' as const,
  promptVersion: 'work-check-v1',
  system: 'Mark it.',
  user: 'Question and answer here.',
  context,
  maxTokens: 500,
}

const unknownStep = () => goodOutput({ steps: [...goodOutput().steps, step({ step_id: 'S9', awarded: 0 })] })

describe('verifiedCall', () => {
  it('accepts a good output on the first call and returns it typed', async () => {
    const { gateway, scripted } = setup([okResponse(goodOutput())])
    const result = await verifiedCall({ ...base, gateway })
    expect(result.status).toBe('accepted')
    expect(result.output?.total).toBe(3)
    expect(result.runs).toHaveLength(1)
    expect(result.runs[0]?.status).toBe('accepted')
    expect(result.runs[0]?.checks.every((check) => check.passed)).toBe(true)
    expect(result.provenance).toEqual({ provider: 'meta', model: 'muse-spark-1.3', version: 'work-check-v1' })
    expect(result.error).toBeNull()
    expect(scripted.requests).toHaveLength(1)
  })

  it('re-asks with the failed codes and details, and accepts on the second call', async () => {
    const { gateway, scripted } = setup([okResponse(unknownStep()), okResponse(goodOutput())])
    const result = await verifiedCall({ ...base, gateway })
    expect(result.status).toBe('accepted')
    expect(result.runs.map((run) => run.status)).toEqual(['retried', 'accepted'])
    expect(result.runs[0]?.checks.find((check) => check.code === 'STEP_UNKNOWN')?.passed).toBe(false)

    const secondUser = scripted.requests[1]?.request.messages[1].content
    expect(typeof secondUser).toBe('string')
    expect(secondUser).toContain(base.user)
    expect(secondUser).toContain('failed these checks')
    expect(secondUser).toContain('- STEP_UNKNOWN: step_id "S9" not in the guideline')
    // The system message is unchanged between calls.
    expect(scripted.requests[1]?.request.messages[0].content).toBe(base.system)
  })

  it('three failures → exhausted after exactly 3 calls', async () => {
    const { gateway, scripted } = setup([okResponse(unknownStep()), okResponse(unknownStep()), okResponse(unknownStep()), okResponse(goodOutput())])
    const result = await verifiedCall({ ...base, gateway })
    expect(result.status).toBe('exhausted')
    expect(result.output).toBeNull()
    expect(scripted.requests).toHaveLength(3)
    expect(MAX_VERIFIED_CALLS).toBe(3)
    expect(result.runs.map((run) => run.status)).toEqual(['retried', 'retried', 'exhausted'])
    expect(result.runs.map((run) => run.attemptNo)).toEqual([1, 2, 3])
    expect(result.totalCostUsd).toBeCloseTo(result.runs.reduce((acc, run) => acc + run.costUsd, 0), 8)
  })

  it('re-asks from the original user text each time, with only the latest failures', async () => {
    const { gateway, scripted } = setup([okResponse(unknownStep()), okResponse(goodOutput({ total: 99 })), okResponse(goodOutput())])
    const result = await verifiedCall({ ...base, gateway })
    expect(result.status).toBe('accepted')
    const third = scripted.requests[2]?.request.messages[1].content as string
    expect(third).toContain('TOTAL_MISMATCH')
    expect(third).not.toContain('STEP_UNKNOWN')
    expect(third.indexOf(base.user)).toBe(0)
  })

  it('abstains on a non-retryable failure: exhausted after one call, no re-ask', async () => {
    const low = goodOutput({ steps: [step({ step_id: 'S1', confidence: 'low' }), ...goodOutput().steps.slice(1)] })
    const { gateway, scripted } = setup([okResponse(low), okResponse(goodOutput())])
    const result = await verifiedCall({ ...base, gateway })
    expect(result.status).toBe('exhausted')
    expect(scripted.requests).toHaveLength(1)
    expect(result.runs[0]?.status).toBe('exhausted')
    expect(result.runs[0]?.checks.find((check) => check.code === 'CONFIDENCE_LOW')?.passed).toBe(false)
  })

  it('treats a malformed output as a retryable schema failure', async () => {
    const { gateway, scripted } = setup([okResponse({ nonsense: true }), okResponse(goodOutput())])
    const result = await verifiedCall({ ...base, gateway })
    expect(result.status).toBe('accepted')
    expect(scripted.requests).toHaveLength(2)
    expect(result.runs[0]?.checks).toEqual([expect.objectContaining({ code: 'SCHEMA_INVALID', passed: false })])
    expect(scripted.requests[1]?.request.messages[1].content).toContain('SCHEMA_INVALID')
  })

  it('returns failed with the gateway error when the provider cannot answer', async () => {
    const { gateway, scripted } = setup([okResponse(unknownStep()), httpError(401)])
    const result = await verifiedCall({ ...base, gateway })
    expect(result.status).toBe('failed')
    expect(result.error?.code).toBe('auth')
    expect(result.runs.map((run) => run.status)).toEqual(['retried', 'failed'])
    expect(result.runs[1]?.error).toEqual({ code: 'auth', message: 'The model provider answered 401.' })
    expect(scripted.requests).toHaveLength(2)
  })

  it('records the spend of a truncated (unusable) answer on the failed run', async () => {
    const { gateway } = setup([okResponse('', { finishReason: 'length', promptTokens: 1000, completionTokens: 2500, requestId: 'req_cut' })])
    const result = await verifiedCall({ ...base, gateway })
    expect(result.status).toBe('failed')
    expect(result.error?.code).toBe('invalid_output')
    expect(result.runs[0]?.usage).toEqual({ inputTokens: 1000, cachedInputTokens: 0, outputTokens: 2500 })
    expect(result.runs[0]?.costUsd).toBeCloseTo(0.011875, 8)
    expect(result.runs[0]?.requestId).toBe('req_cut')
    expect(result.totalCostUsd).toBeCloseTo(0.011875, 8)
  })

  it('returns failed on a timeout with no mark invented', async () => {
    const { gateway } = setup([{ ok: false, kind: 'timeout' }])
    const result = await verifiedCall({ ...base, gateway })
    expect(result.status).toBe('failed')
    expect(result.output).toBeNull()
    expect(result.error?.code).toBe('timeout')
    expect(result.runs[0]?.checks).toEqual([])
  })

  it('never exceeds MAX_VERIFIED_CALLS even if asked to', async () => {
    const { gateway, scripted } = setup(Array.from({ length: 6 }, () => okResponse(unknownStep())))
    const result = await verifiedCall({ ...base, gateway, maxCalls: 6 })
    expect(result.status).toBe('exhausted')
    expect(scripted.requests).toHaveLength(3)
  })

  it('appendFailures lists each failure on its own line after the original text', () => {
    const text = appendFailures('ORIGINAL', [
      { code: 'STEP_UNKNOWN', passed: false, detail: 'S9 is unknown' },
      { code: 'TOTAL_MISMATCH', passed: false, detail: 'total is 5' },
    ])
    expect(text.startsWith('ORIGINAL\n')).toBe(true)
    expect(text).toContain('- STEP_UNKNOWN: S9 is unknown\n- TOTAL_MISMATCH: total is 5')
  })

  it('propagates non-gateway errors (a prompt-safety bug upstream) instead of swallowing them', async () => {
    const { gateway } = setup([okResponse(goodOutput())])
    await expect(verifiedCall({ ...base, gateway, user: 'mail me at someone@example.com' })).rejects.toThrow(/prompt content is not allowed/)
  })
})
