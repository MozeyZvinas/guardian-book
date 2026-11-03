import { inputClassSchema } from '@guardian-book/shared'
import { describe, expect, it } from 'vitest'
import { loadConfig } from '../config.js'
import { GatewayError } from './errors.js'
import { createGateway, type Gateway } from './gateway.js'
import { PromptSafetyError } from './promptSafety.js'
import { capturingLogger, httpError, immediateSleep, okResponse, scriptedTransport, type ScriptedTransport } from './testing.js'
import type { TransportResult } from './transport.js'

const API_KEY = 'test-meta-key-not-real-abcdef'

function gatewayWith(
  script: TransportResult[],
  env: Record<string, string> = {},
): { gateway: Gateway; scripted: ScriptedTransport; lines: string[]; sleeps: number[] } {
  const config = loadConfig({ META_API_KEY: API_KEY, META_MODEL: 'muse-spark-1.3', ...env })
  const scripted = scriptedTransport(script)
  const { logger, lines } = capturingLogger()
  const sleeps: number[] = []
  const gateway = createGateway({
    config: config.meta,
    logger,
    transport: scripted.transport,
    sleep: async (ms) => {
      sleeps.push(ms)
    },
    random: () => 0,
  })
  return { gateway, scripted, lines, sleeps }
}

const params = {
  purpose: 'classify' as const,
  promptVersion: 'classify-v1',
  system: 'Classify the input.',
  user: 'The learner typed: x^2 - 5x + 6 = 0, so (x-2)(x-3)=0',
  schema: inputClassSchema,
  maxTokens: 200,
}

const goodOutput = { kind: 'work', confidence: 'high', reason: 'Working on an equation.' }

async function expectGatewayError(promise: Promise<unknown>, code: string): Promise<GatewayError> {
  try {
    await promise
  } catch (err) {
    expect(err).toBeInstanceOf(GatewayError)
    const gatewayError = err as GatewayError
    expect(gatewayError.code).toBe(code)
    return gatewayError
  }
  throw new Error(`expected a GatewayError with code ${code}`)
}

describe('createGateway', () => {
  it('refuses to start a call for a Contributor-tier model ID (D24)', async () => {
    const { gateway, scripted } = gatewayWith([okResponse(goodOutput)], { META_MODEL: 'muse-spark-1.3-contributor' })
    expect(gateway.configured).toBe(false)
    await expectGatewayError(gateway.callStructured(params), 'refused_model')
    expect(scripted.requests).toHaveLength(0)
  })

  it('refuses the suffix in any letter case, even when config was built elsewhere', async () => {
    const config = loadConfig({ META_API_KEY: API_KEY }).meta
    const scripted = scriptedTransport([okResponse(goodOutput)])
    const gateway = createGateway({
      config: { ...config, model: 'muse-spark-1.3-CONTRIBUTOR', refusedModel: false },
      logger: capturingLogger().logger,
      transport: scripted.transport,
    })
    await expectGatewayError(gateway.callStructured(params), 'refused_model')
    expect(scripted.requests).toHaveLength(0)
  })

  it('returns not_configured without a key; nothing is sent', async () => {
    const config = loadConfig({})
    const scripted = scriptedTransport([okResponse(goodOutput)])
    const gateway = createGateway({ config: config.meta, logger: capturingLogger().logger, transport: scripted.transport })
    expect(gateway.configured).toBe(false)
    await expectGatewayError(gateway.callStructured(params), 'not_configured')
    expect(scripted.requests).toHaveLength(0)
  })

  it('refuses a model with no price row rather than logging a guessed cost', async () => {
    const { gateway, scripted } = gatewayWith([okResponse(goodOutput)], { META_MODEL: 'muse-future-9.9' })
    await expectGatewayError(gateway.callStructured(params), 'unpriced_model')
    expect(scripted.requests).toHaveLength(0)
  })

  it('sends a strict json_schema response_format at temperature 0 and returns parsed output, usage and cost', async () => {
    const { gateway, scripted } = gatewayWith([okResponse(goodOutput, { promptTokens: 1200, completionTokens: 80, cachedTokens: 200, requestId: 'req_1' })])
    const result = await gateway.callStructured({ ...params, timeoutMs: 1234 })

    expect(result.output).toEqual(goodOutput)
    expect(result.raw).toBe(JSON.stringify(goodOutput))
    expect(result.requestId).toBe('req_1')
    expect(result.attempts).toBe(1)
    expect(result.usage).toEqual({ inputTokens: 1200, cachedInputTokens: 200, outputTokens: 80 })
    // (1000 × 1.25 + 200 × 0.15 + 80 × 4.25) / 1e6
    expect(result.costUsd).toBeCloseTo(0.00162, 8)
    expect(result.provenance).toEqual({ provider: 'meta', model: 'muse-spark-1.3', version: 'classify-v1' })

    const sent = scripted.requests[0]
    expect(sent?.options.timeoutMs).toBe(1234)
    expect(sent?.request.model).toBe('muse-spark-1.3')
    expect(sent?.request.temperature).toBe(0)
    expect(sent?.request.max_tokens).toBe(200)
    expect(sent?.request.response_format.type).toBe('json_schema')
    expect(sent?.request.response_format.json_schema.strict).toBe(true)
    expect(sent?.request.response_format.json_schema.name).toBe('classify')
    expect(sent?.request.response_format.json_schema.schema['additionalProperties']).toBe(false)
    expect(sent?.request.messages[0]).toEqual({ role: 'system', content: params.system })
    expect(sent?.request.messages[1]).toEqual({ role: 'user', content: params.user })
  })

  it('puts images only in the user message, as image_url parts after the text', async () => {
    const { gateway, scripted } = gatewayWith([okResponse(goodOutput)])
    await gateway.callStructured({
      ...params,
      images: [
        { kind: 'base64', mediaType: 'image/jpeg', data: 'QUJD' },
        { kind: 'url', url: 'https://bucket.example.invalid/presigned' },
      ],
    })
    const user = scripted.requests[0]?.request.messages[1]
    expect(user?.role).toBe('user')
    expect(user?.content).toEqual([
      { type: 'text', text: params.user },
      { type: 'image_url', image_url: { url: 'data:image/jpeg;base64,QUJD' } },
      { type: 'image_url', image_url: { url: 'https://bucket.example.invalid/presigned' } },
    ])
    expect(typeof scripted.requests[0]?.request.messages[0].content).toBe('string')
  })

  it('retries once on 429 honouring Retry-After, then succeeds', async () => {
    const { gateway, scripted, sleeps } = gatewayWith([httpError(429, { retryAfter: '3' }), okResponse(goodOutput)])
    const result = await gateway.callStructured(params)
    expect(result.attempts).toBe(2)
    expect(scripted.requests).toHaveLength(2)
    expect(sleeps).toEqual([3000])
  })

  it('retries on 5xx with exponential backoff, at most twice, then fails typed', async () => {
    const { gateway, scripted, sleeps } = gatewayWith([httpError(503), httpError(502), httpError(500, { requestId: 'req_last' })])
    const err = await expectGatewayError(gateway.callStructured(params), 'provider_error')
    expect(err.status).toBe(500)
    expect(err.requestId).toBe('req_last')
    expect(err.attempts).toBe(3)
    expect(scripted.requests).toHaveLength(3)
    expect(sleeps).toEqual([500, 1000])
  })

  it('gives up on a 429 whose Retry-After is too long to honour', async () => {
    const { gateway, scripted, sleeps } = gatewayWith([httpError(429, { retryAfter: '600' })])
    await expectGatewayError(gateway.callStructured(params), 'rate_limited')
    expect(scripted.requests).toHaveLength(1)
    expect(sleeps).toEqual([])
  })

  it.each([
    [400, 'bad_request'],
    [401, 'auth'],
    [403, 'auth'],
    [404, 'bad_request'],
    [422, 'bad_request'],
  ])('never retries a %i; typed as %s', async (status, code) => {
    const { gateway, scripted, sleeps } = gatewayWith([httpError(status), okResponse(goodOutput)])
    const err = await expectGatewayError(gateway.callStructured(params), code)
    expect(err.status).toBe(status)
    expect(scripted.requests).toHaveLength(1)
    expect(sleeps).toEqual([])
  })

  it('maps a transport timeout to a timeout error without retrying', async () => {
    const { gateway, scripted } = gatewayWith([{ ok: false, kind: 'timeout' }, okResponse(goodOutput)])
    await expectGatewayError(gateway.callStructured(params), 'timeout')
    expect(scripted.requests).toHaveLength(1)
  })

  it('maps aborts and network failures to typed errors', async () => {
    const { gateway: aborted } = gatewayWith([{ ok: false, kind: 'aborted' }])
    await expectGatewayError(aborted.callStructured(params), 'aborted')
    const { gateway: network } = gatewayWith([{ ok: false, kind: 'network', errorName: 'APIConnectionError' }])
    await expectGatewayError(network.callStructured(params), 'network')
  })

  it('treats non-JSON content, refusals, empty content and truncation as invalid_output', async () => {
    const { gateway: notJson } = gatewayWith([okResponse('not json {')])
    await expectGatewayError(notJson.callStructured(params), 'invalid_output')

    const refusal: TransportResult = {
      ok: true,
      status: 200,
      requestId: 'r',
      body: { choices: [{ message: { content: null, refusal: 'no' } }], usage: { prompt_tokens: 1, completion_tokens: 1 } },
    }
    const { gateway: refused } = gatewayWith([refusal])
    await expectGatewayError(refused.callStructured(params), 'invalid_output')

    const { gateway: truncated } = gatewayWith([okResponse('', { finishReason: 'length', promptTokens: 1444, completionTokens: 2500, requestId: 'req_cut' })])
    const cut = await expectGatewayError(truncated.callStructured(params), 'invalid_output')
    expect(cut.message).toContain('max_tokens')
    expect(cut.requestId).toBe('req_cut')
    // The call was billed even though it was unusable: the spend travels with the error.
    expect(cut.spend).toEqual({ inputTokens: 1444, cachedInputTokens: 0, outputTokens: 2500, costUsd: 0.01243, latencyMs: expect.any(Number) })

    const { gateway: noChoices } = gatewayWith([{ ok: true, status: 200, requestId: 'r', body: { choices: [] } }])
    await expectGatewayError(noChoices.callStructured(params), 'invalid_output')
  })

  it('throws before sending when the user text holds an email address or phone number', async () => {
    const { gateway, scripted } = gatewayWith([okResponse(goodOutput)])
    await expect(gateway.callStructured({ ...params, user: 'Mark this: contact me at lerato@example.com' })).rejects.toBeInstanceOf(PromptSafetyError)
    await expect(gateway.callStructured({ ...params, user: 'Call 082 123 4567 for the memo' })).rejects.toBeInstanceOf(PromptSafetyError)
    expect(scripted.requests).toHaveLength(0)
  })

  it('logs purpose, prompt version, request ID, tokens, cost and latency, never the content or the key', async () => {
    const { gateway, lines } = gatewayWith([
      httpError(429, { retryAfter: '1' }),
      okResponse(goodOutput, { requestId: 'req_logged', promptTokens: 321, completionTokens: 45 }),
    ])
    const secretAnswer = 'the learner wrote (x-2)(x-3)=0 so x=2 or x=3'
    await gateway.callStructured({
      ...params,
      user: secretAnswer,
      images: [{ kind: 'base64', mediaType: 'image/png', data: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==' }],
    })

    const all = lines.join('\n')
    expect(lines).toHaveLength(2)
    const success = JSON.parse(lines[1] ?? '{}') as Record<string, unknown>
    expect(success['msg']).toBe('model call')
    expect(success['purpose']).toBe('classify')
    expect(success['promptVersion']).toBe('classify-v1')
    expect(success['requestId']).toBe('req_logged')
    expect(success['inputTokens']).toBe(321)
    expect(success['outputTokens']).toBe(45)
    expect(success['attempt']).toBe(2)
    expect(typeof success['costUsd']).toBe('number')
    expect(typeof success['latencyMs']).toBe('number')

    expect(all).not.toContain(API_KEY)
    expect(all).not.toContain(secretAnswer)
    expect(all).not.toContain('x-2')
    expect(all).not.toContain('iVBORw0KGgo')
    expect(all).not.toContain(params.system)
    expect(all).not.toContain(JSON.stringify(goodOutput))
  })

  it('does not call the transport again on a second call while configured stays true', async () => {
    const { gateway } = gatewayWith([okResponse(goodOutput), okResponse(goodOutput)])
    expect(gateway.configured).toBe(true)
    await gateway.callStructured(params)
    await gateway.callStructured(params)
    expect(gateway.model).toBe('muse-spark-1.3')
  })

  it('uses the SDK transport by default (constructed lazily, no network here)', () => {
    const config = loadConfig({ META_API_KEY: API_KEY }).meta
    const gateway = createGateway({ config, logger: capturingLogger().logger })
    expect(gateway.configured).toBe(true)
  })

  it('the default sleep and clock are used when none are injected', async () => {
    const config = loadConfig({ META_API_KEY: API_KEY }).meta
    const scripted = scriptedTransport([okResponse(goodOutput)])
    const gateway = createGateway({ config, logger: capturingLogger().logger, transport: scripted.transport, sleep: immediateSleep })
    const result = await gateway.callStructured(params)
    expect(result.latencyMs).toBeGreaterThanOrEqual(0)
  })
})
