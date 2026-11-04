import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import { REFUSED_MODEL_SUFFIX, type MetaConfig } from '../config.js'
import type { Logger } from '../logger.js'
import { GatewayError } from './errors.js'
import { MAX_RETRIES, isRetryableStatus, retryDelayMs } from './retry.js'

/**
 * Muse Voice Transcribe through the gateway (brief B13; spec 02 P1-a). Speech to text is
 * not a chat completion: one multipart POST, audio in, words out. Everything else is the
 * same as `gateway.ts`: Standard tier only (D24), the retry policy from `retry.ts`, typed
 * failures, and nothing personal in the logs (the transcript is never logged).
 *
 * Meta, "Transcribe a recording" (https://dev.meta.ai/docs/api-reference/voice/transcribe),
 * read 4 Nov 2026:
 * - "POST /asr/transcribe" (the example uses `https://api.meta.ai/v1/asr/transcribe`).
 * - "Send `multipart/form-data` with two parts: `request`, the transcription settings as
 *   JSON, and `audio`, the clip."
 * - `sessionId` (query, optional): "a correlation id used in server logs and echoed in the
 *   response. The server generates one if omitted."
 * - "Maximum length of 10 minutes." "Maximum request body of 32 MB."
 * - 400: "The audio isn't a supported WAV file, exceeds 10 minutes, or the body isn't
 *   `multipart/form-data`." 413: body over 32 MB. 429: "Concurrency or hourly session limit
 *   reached. Retry with exponential backoff." 500: "Transcription failed or exceeded the
 *   server budget."
 * Meta, "Voice schemas" (https://dev.meta.ai/docs/api-reference/voice/schemas), same date:
 * - request: `model` (required), `audioEncoding: 'WAV'` (required; "a RIFF/WAVE container
 *   holding mono integer PCM at 16 kHz or 24 kHz"), `mode` default `PUSH_TO_TALK`
 *   ("single-turn and the uploaded clip is the turn"), `languageBias` ("Omit it to let the
 *   model detect the language.").
 * - response: `sessionId`, `transcript` ("Final transcript for the whole clip"),
 *   `audioDurationMs` ("Total audio duration processed, in milliseconds."), `turns`
 *   ("Empty in `PUSH_TO_TALK`").
 * Meta, "Speech to text" (https://dev.meta.ai/docs/speech-to-text), same date, Quickstart:
 *   `-F 'request={"mode":"DIARIZATION","model":"muse-voice-transcribe-1.0","audioEncoding":"WAV"};type=application/json'`
 *   `-F 'audio=@meeting_audio.wav'`
 */

export const DEFAULT_TRANSCRIBE_MODEL = 'muse-voice-transcribe-1.0'
export const TRANSCRIBE_TIMEOUT_MS = 30_000
/** Stored as the run's prompt version: there is no prompt, the settings are the version. */
export const TRANSCRIBE_VERSION = 'asr-push-to-talk-v1'

/**
 * Meta, "Pricing and rate limits" (https://dev.meta.ai/docs/pricing-rate-limits), read
 * 4 Nov 2026: "Muse Voice Transcribe is billed by audio processed, metered in whole
 * seconds." Audio processed: "$0.18 per hour". "Audio time is billed as a separate line
 * item from token usage, rounded down to whole seconds". "Contributor mode isn't available
 * for Muse Voice Transcribe." Rate limits for `muse-voice-transcribe-1.0`: "256 concurrent
 * streams; 16,000 streams per hour".
 */
export const AUDIO_PRICE_USD_PER_HOUR = 0.18
export const AUDIO_PRICE_TABLE_DATE = '2026-11-04'

/** Cost in USD of a clip, rounded down to whole seconds as Meta bills it; 8 decimal places. */
export function audioCostUsd(audioDurationMs: number): number {
  const seconds = Math.max(0, Math.floor(audioDurationMs / 1000))
  return Math.round(((seconds * AUDIO_PRICE_USD_PER_HOUR) / 3600) * 1e8) / 1e8
}

export interface TranscribeRequest {
  model: string
  /** A WAV clip (the caller has already checked the container). Never logged, never stored. */
  audio: Buffer
  sessionId: string
}

export type TranscribeTransportResult =
  | { ok: true; status: number; requestId: string | null; body: unknown }
  | { ok: false; kind: 'http'; status: number; requestId: string | null; retryAfter: string | null; errorCode: string | null }
  | { ok: false; kind: 'timeout' }
  | { ok: false; kind: 'network'; errorName: string }

export type TranscribeTransport = (request: TranscribeRequest, options: { timeoutMs: number }) => Promise<TranscribeTransportResult>

/** The parts of the buffered JSON response the gateway reads. Unknown keys are kept. */
export const transcribeBodySchema = z.looseObject({
  sessionId: z.string().optional(),
  transcript: z.string(),
  audioDurationMs: z.number().int().nonnegative(),
})

export interface TranscribeResult {
  transcript: string
  audioDurationMs: number
  costUsd: number
  latencyMs: number
  requestId: string | null
  model: string
  attempts: number
}

export interface Transcriber {
  readonly configured: boolean
  readonly model: string
  transcribe(audio: Buffer): Promise<TranscribeResult>
}

/** The multipart body, built by hand so the `request` part carries `application/json` with no filename, as Meta's curl example does. */
export function multipartBody(request: TranscribeRequest, boundary: string): Buffer {
  const settings = JSON.stringify({ model: request.model, audioEncoding: 'WAV', mode: 'PUSH_TO_TALK' })
  const head = [
    `--${boundary}`,
    'Content-Disposition: form-data; name="request"',
    'Content-Type: application/json',
    '',
    settings,
    `--${boundary}`,
    'Content-Disposition: form-data; name="audio"; filename="question.wav"',
    'Content-Type: audio/wav',
    '',
    '',
  ].join('\r\n')
  return Buffer.concat([Buffer.from(head, 'utf8'), request.audio, Buffer.from(`\r\n--${boundary}--\r\n`, 'utf8')])
}

/** The real transport: one `fetch` to `${baseUrl}/asr/transcribe` with a bearer token. */
export function createFetchTranscribeTransport(options: { apiKey: string; baseUrl: string }): TranscribeTransport {
  const base = options.baseUrl.replace(/\/+$/, '')
  return async (request, { timeoutMs }) => {
    const boundary = `----guardian-book-${randomUUID()}`
    const url = `${base}/asr/transcribe?sessionId=${encodeURIComponent(request.sessionId)}`
    let res: Response
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${options.apiKey}`,
          accept: 'application/json',
          'content-type': `multipart/form-data; boundary=${boundary}`,
        },
        body: new Uint8Array(multipartBody(request, boundary)),
        signal: AbortSignal.timeout(timeoutMs),
      })
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'TimeoutError') return { ok: false, kind: 'timeout' }
      return { ok: false, kind: 'network', errorName: err instanceof Error ? err.name : 'Error' }
    }
    const requestId = res.headers.get('x-request-id')
    if (res.ok) {
      const body: unknown = await res.json().catch(() => null)
      return { ok: true, status: res.status, requestId, body }
    }
    // The provider's error type or code only, never its message (it may echo input).
    let errorCode: string | null = null
    try {
      const body = (await res.json()) as { error?: { type?: string; code?: string }; type?: string; code?: string } | null
      errorCode = body?.error?.type ?? body?.error?.code ?? body?.type ?? body?.code ?? null
    } catch {
      // no readable body
    }
    return { ok: false, kind: 'http', status: res.status, requestId, retryAfter: res.headers.get('retry-after'), errorCode }
  }
}

export interface TranscriberOptions {
  config: MetaConfig
  logger: Logger
  /** Injected in tests; defaults to the fetch transport. */
  transport?: TranscribeTransport
  sleep?: (ms: number) => Promise<void>
  now?: () => number
  random?: () => number
}

const defaultSleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

export function createTranscriber(options: TranscriberOptions): Transcriber {
  const { config, logger } = options
  const sleep = options.sleep ?? defaultSleep
  const now = options.now ?? Date.now
  const random = options.random ?? Math.random
  const model = config.transcribeModel
  const refused = model.toLowerCase().endsWith(REFUSED_MODEL_SUFFIX)
  const apiKey = config.apiKey
  const configured = !refused && Boolean(apiKey)

  let transport: TranscribeTransport | null = options.transport ?? null
  const getTransport = (): TranscribeTransport => {
    if (transport) return transport
    transport = createFetchTranscribeTransport({ apiKey: apiKey ?? '', baseUrl: config.baseUrl })
    return transport
  }

  async function transcribe(audio: Buffer): Promise<TranscribeResult> {
    if (refused) throw new GatewayError('refused_model', 'Contributor-tier model IDs are refused (D24).')
    if (!configured) throw new GatewayError('not_configured', 'META_API_KEY is not set; voice is off.')
    const sessionId = randomUUID()
    const timeoutMs = TRANSCRIBE_TIMEOUT_MS
    const logBase = { purpose: 'transcribe', model, audioBytes: audio.length }

    for (let attempt = 1; ; attempt += 1) {
      const attemptStart = now()
      const result = await getTransport()({ model, audio, sessionId }, { timeoutMs })
      const latencyMs = now() - attemptStart

      if (result.ok) {
        const parsed = transcribeBodySchema.safeParse(result.body)
        if (!parsed.success) {
          logger.warn('transcription: unreadable response body', { ...logBase, attempt, latencyMs, requestId: result.requestId })
          throw new GatewayError('invalid_output', 'The transcription response had no readable transcript.', { status: result.status, requestId: result.requestId, attempts: attempt })
        }
        const costUsd = audioCostUsd(parsed.data.audioDurationMs)
        const requestId = parsed.data.sessionId ?? result.requestId ?? sessionId
        // The transcript itself is never logged: it is the learner's own words.
        logger.info('transcription', { ...logBase, attempt, latencyMs, requestId, audioDurationMs: parsed.data.audioDurationMs, costUsd, chars: parsed.data.transcript.length })
        return { transcript: parsed.data.transcript, audioDurationMs: parsed.data.audioDurationMs, costUsd, latencyMs, requestId, model, attempts: attempt }
      }

      if (result.kind === 'timeout') {
        logger.warn('transcription: timeout', { ...logBase, attempt, latencyMs, timeoutMs })
        throw new GatewayError('timeout', `The transcription ran past ${timeoutMs} ms.`, { attempts: attempt })
      }
      if (result.kind === 'network') {
        logger.warn('transcription: network error', { ...logBase, attempt, latencyMs, errorName: result.errorName })
        throw new GatewayError('network', 'Could not reach the model provider.', { attempts: attempt })
      }

      const { status, requestId, retryAfter, errorCode } = result
      const retryIndex = attempt - 1
      const canRetry = isRetryableStatus(status) && retryIndex < MAX_RETRIES
      const delay = canRetry ? retryDelayMs({ retryIndex, retryAfterHeader: retryAfter, nowMs: now(), random }) : null
      logger.warn('transcription: http error', { ...logBase, attempt, latencyMs, status, requestId, errorCode, retryInMs: delay })
      if (delay !== null) {
        await sleep(delay)
        continue
      }
      const code =
        status === 401 || status === 403 ? 'auth' : status === 429 ? 'rate_limited' : status >= 500 ? 'provider_error' : 'bad_request'
      throw new GatewayError(code, `The model provider answered ${status}.`, { status, requestId, attempts: attempt })
    }
  }

  return { configured, model, transcribe }
}
