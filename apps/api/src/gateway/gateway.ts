import {
  modelProvenanceSchema,
  toStrictJsonSchema,
  type ModelProvenance,
  type ModelPurpose,
  type StrictJsonSchema,
} from '@guardian-book/shared'
import type { z } from 'zod'
import { REFUSED_MODEL_SUFFIX, type MetaConfig } from '../config.js'
import type { Logger } from '../logger.js'
import { GatewayError } from './errors.js'
import { createOpenAiTransport } from './openaiTransport.js'
import { costUsd, priceFor, type TokenUsage } from './pricing.js'
import { assertPromptSafe } from './promptSafety.js'
import { MAX_RETRIES, isRetryableStatus, retryDelayMs } from './retry.js'
import {
  chatCompletionBodySchema,
  imageToPart,
  type ChatRequest,
  type ChatUserMessage,
  type ImageInput,
  type Transport,
} from './transport.js'

/**
 * The only door to the Meta Model API (CLAUDE.md § Stack). One function, `callStructured`,
 * returns the model's JSON as *untrusted* `unknown`: nothing downstream may use it until
 * `apps/api/src/verify` has passed it.
 *
 * Meta, "Structured output" (https://dev.meta.ai/docs/structured-output), read 3 Nov 2026:
 * "The response contains a JSON string in `choices[0].message.content`".
 */

export const DEFAULT_TIMEOUT_MS = 45_000

export interface CallStructuredParams<T> {
  purpose: ModelPurpose
  /** Immutable prompt version string, stored with the run. */
  promptVersion: string
  system: string
  user: string
  images?: ImageInput[]
  /** The Zod contract; exported as a strict JSON schema. The output is NOT parsed with it here. */
  schema: z.ZodType<T>
  maxTokens: number
  timeoutMs?: number
  signal?: AbortSignal
}

export interface CallStructuredResult {
  /** `JSON.parse` of the model's content. Untrusted until verified. */
  output: unknown
  /** The content string exactly as returned. Never logged. */
  raw: string
  usage: TokenUsage
  costUsd: number
  latencyMs: number
  requestId: string | null
  model: string
  /** Transport attempts made, including retries (1 when the first attempt succeeded). */
  attempts: number
  provenance: ModelProvenance
}

export interface Gateway {
  readonly configured: boolean
  readonly model: string
  callStructured<T>(params: CallStructuredParams<T>): Promise<CallStructuredResult>
}

export interface GatewayOptions {
  config: MetaConfig
  logger: Logger
  /** Injected in tests; defaults to the OpenAI SDK transport. */
  transport?: Transport
  sleep?: (ms: number) => Promise<void>
  now?: () => number
  random?: () => number
}

const defaultSleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

/** Memoised per schema object: the strict-subset check runs once per contract. */
const schemaCache = new WeakMap<object, StrictJsonSchema>()
function strictSchemaFor(purpose: ModelPurpose, schema: z.ZodType): StrictJsonSchema {
  const cached = schemaCache.get(schema)
  if (cached) return cached
  const built = toStrictJsonSchema(purpose, schema)
  schemaCache.set(schema, built)
  return built
}

function buildUserMessage(user: string, images: ImageInput[] | undefined): ChatUserMessage {
  if (!images || images.length === 0) return { role: 'user', content: user }
  return { role: 'user', content: [{ type: 'text', text: user }, ...images.map(imageToPart)] }
}

export function createGateway(options: GatewayOptions): Gateway {
  const { config, logger } = options
  const sleep = options.sleep ?? defaultSleep
  const now = options.now ?? Date.now
  const random = options.random ?? Math.random
  const model = config.model

  // Defence in depth: config already refuses Contributor IDs; refuse again here so a
  // gateway built from any other source is bound by the same rule (D24).
  const refused = config.refusedModel || model.toLowerCase().endsWith(REFUSED_MODEL_SUFFIX)
  const apiKey = config.apiKey
  const configured = !refused && Boolean(apiKey)

  let transport: Transport | null = options.transport ?? null
  const getTransport = (): Transport => {
    if (transport) return transport
    // Only reached when configured; `apiKey` is then a non-empty string.
    transport = createOpenAiTransport({ apiKey: apiKey ?? '', baseUrl: config.baseUrl })
    return transport
  }

  async function callStructured<T>(params: CallStructuredParams<T>): Promise<CallStructuredResult> {
    if (refused) {
      throw new GatewayError('refused_model', 'Contributor-tier model IDs are refused (D24).')
    }
    if (!configured) {
      throw new GatewayError('not_configured', 'META_API_KEY is not set; the model gateway is off.')
    }
    const price = priceFor(model)
    if (!price) {
      throw new GatewayError('unpriced_model', 'The configured model has no row in the price table.')
    }

    // Last line of the personal-data rule: the final user text must carry no email or phone.
    assertPromptSafe(params.user, 'user')

    const request: ChatRequest = {
      model,
      messages: [
        { role: 'system', content: params.system },
        buildUserMessage(params.user, params.images),
      ],
      response_format: { type: 'json_schema', json_schema: strictSchemaFor(params.purpose, params.schema) },
      max_tokens: params.maxTokens,
      temperature: 0,
    }
    const timeoutMs = params.timeoutMs ?? DEFAULT_TIMEOUT_MS
    const logBase = { purpose: params.purpose, promptVersion: params.promptVersion, model }
    const startedAt = now()

    for (let attempt = 1; ; attempt += 1) {
      const attemptStart = now()
      const result = await getTransport()(request, { timeoutMs, signal: params.signal })
      const latencyMs = now() - attemptStart

      if (result.ok) {
        const parsedBody = chatCompletionBodySchema.safeParse(result.body)
        if (!parsedBody.success) {
          logger.warn('model call: unreadable response body', { ...logBase, requestId: result.requestId, attempt, latencyMs })
          throw new GatewayError('invalid_output', 'The provider response had no readable choices.', {
            status: result.status,
            requestId: result.requestId,
            attempts: attempt,
          })
        }
        const body = parsedBody.data
        const choice = body.choices[0]
        const usage: TokenUsage = {
          inputTokens: body.usage?.prompt_tokens ?? 0,
          cachedInputTokens: body.usage?.prompt_tokens_details?.cached_tokens ?? 0,
          outputTokens: body.usage?.completion_tokens ?? 0,
        }
        const cost = costUsd(price, usage)
        const requestId = result.requestId ?? body.id ?? null
        const usageFields = {
          inputTokens: usage.inputTokens,
          cachedInputTokens: usage.cachedInputTokens,
          outputTokens: usage.outputTokens,
          costUsd: cost,
          latencyMs,
          attempt,
          requestId,
          finishReason: choice?.finish_reason ?? null,
        }

        const content = choice?.message.content
        if (!choice || choice.message.refusal || typeof content !== 'string' || content.length === 0) {
          logger.warn('model call: no content', { ...logBase, ...usageFields, refused: Boolean(choice?.message.refusal) })
          throw new GatewayError('invalid_output', 'The model returned no JSON content.', { status: result.status, requestId, attempts: attempt })
        }
        if (choice.finish_reason === 'length') {
          logger.warn('model call: truncated', { ...logBase, ...usageFields })
          throw new GatewayError('invalid_output', 'The model output was cut off by max_tokens.', { status: result.status, requestId, attempts: attempt })
        }
        let output: unknown
        try {
          output = JSON.parse(content)
        } catch {
          logger.warn('model call: content is not JSON', { ...logBase, ...usageFields })
          throw new GatewayError('invalid_output', 'The model content was not valid JSON.', { status: result.status, requestId, attempts: attempt })
        }

        logger.info('model call', { ...logBase, ...usageFields, totalLatencyMs: now() - startedAt })
        const provenance = modelProvenanceSchema.parse({ provider: 'meta', model: body.model ?? model, version: params.promptVersion })
        return { output, raw: content, usage, costUsd: cost, latencyMs, requestId, model: body.model ?? model, attempts: attempt, provenance }
      }

      // Failures that are never retried.
      if (result.kind === 'timeout') {
        logger.warn('model call: timeout', { ...logBase, attempt, latencyMs, timeoutMs })
        throw new GatewayError('timeout', `The model call ran past ${timeoutMs} ms.`, { attempts: attempt })
      }
      if (result.kind === 'aborted') {
        logger.warn('model call: aborted', { ...logBase, attempt, latencyMs })
        throw new GatewayError('aborted', 'The model call was aborted by the caller.', { attempts: attempt })
      }
      if (result.kind === 'network') {
        logger.warn('model call: network error', { ...logBase, attempt, latencyMs, errorName: result.errorName })
        throw new GatewayError('network', 'Could not reach the model provider.', { attempts: attempt })
      }

      // HTTP errors: 429 and 5xx may retry; everything else is final.
      const { status, requestId, retryAfter, errorCode } = result
      const retryIndex = attempt - 1
      const canRetry = isRetryableStatus(status) && retryIndex < MAX_RETRIES
      const delay = canRetry ? retryDelayMs({ retryIndex, retryAfterHeader: retryAfter, nowMs: now(), random }) : null
      logger.warn('model call: http error', {
        ...logBase,
        attempt,
        latencyMs,
        status,
        requestId,
        errorCode,
        retryInMs: delay,
      })
      if (delay !== null) {
        await sleep(delay)
        continue
      }
      const code =
        status === 401 || status === 403
          ? 'auth'
          : status === 429
            ? 'rate_limited'
            : status >= 500
              ? 'provider_error'
              : 'bad_request'
      throw new GatewayError(code, `The model provider answered ${status}.`, { status, requestId, attempts: attempt })
    }
  }

  return { configured, model, callStructured }
}
