import OpenAI, { APIConnectionError, APIConnectionTimeoutError, APIError, APIUserAbortError } from 'openai'
import type { Transport } from './transport.js'

/**
 * The real transport: the OpenAI SDK pointed at the Meta Model API.
 *
 * Meta, "Image understanding" (https://dev.meta.ai/docs/image-understanding), read
 * 3 Nov 2026, example: `base_url="https://api.meta.ai/v1"` with `chat.completions.create`
 * and `model="muse-spark-1.3"`; the Chat Completions and Responses surfaces share one
 * model, "the model and its capabilities are identical".
 *
 * The SDK's own retries are off (`maxRetries: 0`): the gateway owns the retry policy so
 * the rules in `retry.ts` are the only ones that apply.
 */

export interface OpenAiTransportOptions {
  apiKey: string
  baseUrl: string
}

export function createOpenAiTransport(options: OpenAiTransportOptions): Transport {
  const client = new OpenAI({ apiKey: options.apiKey, baseURL: options.baseUrl, maxRetries: 0 })

  return async (request, { timeoutMs, signal }) => {
    try {
      const { data, response, request_id } = await client.chat.completions
        .create(
          {
            model: request.model,
            messages: request.messages,
            response_format: request.response_format,
            max_tokens: request.max_tokens,
            temperature: request.temperature,
          },
          { timeout: timeoutMs, maxRetries: 0, signal: signal ?? null },
        )
        .withResponse()
      return { ok: true, status: response.status, requestId: request_id ?? response.headers.get('x-request-id'), body: data }
    } catch (err: unknown) {
      if (err instanceof APIUserAbortError) return { ok: false, kind: 'aborted' }
      if (err instanceof APIConnectionTimeoutError) return { ok: false, kind: 'timeout' }
      if (err instanceof APIConnectionError) return { ok: false, kind: 'network', errorName: err.name }
      if (err instanceof APIError && typeof err.status === 'number') {
        return {
          ok: false,
          kind: 'http',
          status: err.status,
          requestId: err.requestID ?? null,
          retryAfter: err.headers?.get('retry-after') ?? null,
          errorCode: err.code ?? err.type ?? null,
        }
      }
      throw err
    }
  }
}
