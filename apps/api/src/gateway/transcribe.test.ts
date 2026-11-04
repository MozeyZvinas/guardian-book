import { describe, expect, it } from 'vitest'
import { loadConfig } from '../config.js'
import { GatewayError } from './errors.js'
import { capturingLogger, immediateSleep } from './testing.js'
import { AUDIO_PRICE_USD_PER_HOUR, audioCostUsd, createTranscriber, multipartBody, type TranscribeRequest, type TranscribeTransportResult } from './transcribe.js'

const clip = Buffer.from('RIFF....WAVEfmt ')
const okBody = (transcript: string, audioDurationMs = 2_000): TranscribeTransportResult => ({
  ok: true,
  status: 200,
  requestId: 'req_voice',
  body: { sessionId: 'sess_1', transcript, audioDurationMs, turns: [] },
})

function transcriberWith(script: TranscribeTransportResult[], env: Record<string, string> = { META_API_KEY: 'test-key' }) {
  const requests: TranscribeRequest[] = []
  const queue = [...script]
  const { logger, lines } = capturingLogger()
  const transcriber = createTranscriber({
    config: loadConfig(env).meta,
    logger,
    sleep: immediateSleep,
    transport: async (request) => {
      requests.push(request)
      const next = queue.shift()
      if (!next) throw new Error('no scripted result')
      return next
    },
  })
  return { transcriber, requests, lines }
}

describe('audioCostUsd', () => {
  it('bills whole seconds, rounded down, at $0.18 per hour', () => {
    expect(AUDIO_PRICE_USD_PER_HOUR).toBe(0.18)
    expect(audioCostUsd(60_000)).toBe(0.003)
    expect(audioCostUsd(59_999)).toBe(0.00295)
    expect(audioCostUsd(999)).toBe(0)
    expect(audioCostUsd(-5)).toBe(0)
  })
})

describe('createTranscriber', () => {
  it('is off without a key and refuses a Contributor model, before any request', async () => {
    const off = transcriberWith([], {})
    expect(off.transcriber.configured).toBe(false)
    await expect(off.transcriber.transcribe(clip)).rejects.toMatchObject({ code: 'not_configured' })
    const refused = transcriberWith([], { META_API_KEY: 'k', META_MODEL_TRANSCRIBE: 'muse-voice-transcribe-1.0-contributor' })
    // Config already fell back to the default model; the transcriber is configured on the Standard ID.
    expect(refused.transcriber.model).toBe('muse-voice-transcribe-1.0')
    expect(off.requests).toHaveLength(0)
  })

  it('returns the transcript, duration, cost and request ID; never logs the words', async () => {
    const { transcriber, requests, lines } = transcriberWith([okBody('why is it minus six', 4_500)])
    const result = await transcriber.transcribe(clip)
    expect(result).toMatchObject({ transcript: 'why is it minus six', audioDurationMs: 4_500, costUsd: 0.0002, requestId: 'sess_1', model: 'muse-voice-transcribe-1.0', attempts: 1 })
    expect(requests[0]).toMatchObject({ model: 'muse-voice-transcribe-1.0', audio: clip })
    expect(lines.join('\n')).not.toContain('minus six')
    expect(lines.join('\n')).toContain('"audioDurationMs":4500')
  })

  it('retries a 429 with backoff, then succeeds', async () => {
    const { transcriber } = transcriberWith([
      { ok: false, kind: 'http', status: 429, requestId: null, retryAfter: null, errorCode: 'rate_limit' },
      okBody('hello'),
    ])
    const result = await transcriber.transcribe(clip)
    expect(result.attempts).toBe(2)
  })

  it('maps provider failures to typed codes', async () => {
    const cases: Array<[TranscribeTransportResult, string]> = [
      [{ ok: false, kind: 'http', status: 400, requestId: 'r', retryAfter: null, errorCode: 'invalid_audio' }, 'bad_request'],
      [{ ok: false, kind: 'http', status: 413, requestId: 'r', retryAfter: null, errorCode: null }, 'bad_request'],
      [{ ok: false, kind: 'http', status: 401, requestId: 'r', retryAfter: null, errorCode: null }, 'auth'],
      [{ ok: false, kind: 'timeout' }, 'timeout'],
      [{ ok: false, kind: 'network', errorName: 'FetchError' }, 'network'],
      [{ ok: true, status: 200, requestId: 'r', body: { nope: true } }, 'invalid_output'],
    ]
    for (const [scripted, code] of cases) {
      const { transcriber } = transcriberWith([scripted])
      const err = await transcriber.transcribe(clip).catch((e: unknown) => e)
      expect(err).toBeInstanceOf(GatewayError)
      expect((err as GatewayError).code).toBe(code)
    }
  })

  it('gives up on a 5xx after the retry budget', async () => {
    const fail: TranscribeTransportResult = { ok: false, kind: 'http', status: 503, requestId: null, retryAfter: null, errorCode: null }
    const { transcriber, requests } = transcriberWith([fail, fail, fail, fail, fail])
    await expect(transcriber.transcribe(clip)).rejects.toMatchObject({ code: 'provider_error' })
    expect(requests.length).toBeGreaterThan(1)
  })
})

describe('multipartBody', () => {
  it('sends the settings as an application/json part with no filename, then the WAV', () => {
    const body = multipartBody({ model: 'muse-voice-transcribe-1.0', audio: clip, sessionId: 's' }, 'XYZ').toString('latin1')
    expect(body).toContain('--XYZ\r\nContent-Disposition: form-data; name="request"\r\nContent-Type: application/json\r\n\r\n{"model":"muse-voice-transcribe-1.0","audioEncoding":"WAV","mode":"PUSH_TO_TALK"}\r\n')
    expect(body).toContain('Content-Disposition: form-data; name="audio"; filename="question.wav"\r\nContent-Type: audio/wav\r\n\r\nRIFF')
    expect(body.endsWith('\r\n--XYZ--\r\n')).toBe(true)
  })
})
