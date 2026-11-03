/**
 * Typed gateway failures. Callers branch on `code`, never on message text. None of these
 * ever carry prompt content, answer text, image bytes or the API key.
 */

export type GatewayErrorCode =
  /** No META_API_KEY: the app boots, the model is simply off (spec 03 §7). */
  | 'not_configured'
  /** A Contributor-tier model ID (D24). Refused before any request is made. */
  | 'refused_model'
  /** The model is not in the price table, so its cost could not be logged (fail closed). */
  | 'unpriced_model'
  /** The call ran past `timeoutMs`. Never retried. */
  | 'timeout'
  /** 429 after the retry budget, or a Retry-After too long to honour. */
  | 'rate_limited'
  /** 5xx after the retry budget. */
  | 'provider_error'
  /** 401 or 403: never retried. */
  | 'auth'
  /** 400 or 404 (or any other 4xx): never retried. */
  | 'bad_request'
  /** The provider answered, but not with a JSON object we could parse, or it refused. */
  | 'invalid_output'
  /** The caller's AbortSignal fired. */
  | 'aborted'
  /** A connection-level failure (DNS, reset) that is not a timeout. */
  | 'network'

export interface GatewayErrorSpend {
  inputTokens: number
  cachedInputTokens: number
  outputTokens: number
  costUsd: number
  latencyMs: number
}

export interface GatewayErrorOptions {
  status?: number | null
  requestId?: string | null
  attempts?: number
  /** Set when the provider answered and billed us, but the answer was unusable. */
  spend?: GatewayErrorSpend | null
  cause?: unknown
}

export class GatewayError extends Error {
  override readonly name = 'GatewayError'
  readonly code: GatewayErrorCode
  readonly status: number | null
  readonly requestId: string | null
  /** How many transport attempts were made before giving up (0 when none was started). */
  readonly attempts: number
  /** Tokens, cost and latency of the unusable answer, so the spend is still recorded. */
  readonly spend: GatewayErrorSpend | null

  constructor(code: GatewayErrorCode, message: string, options: GatewayErrorOptions = {}) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause })
    this.code = code
    this.status = options.status ?? null
    this.requestId = options.requestId ?? null
    this.attempts = options.attempts ?? 0
    this.spend = options.spend ?? null
  }
}

export const isGatewayError = (value: unknown): value is GatewayError =>
  value instanceof GatewayError
