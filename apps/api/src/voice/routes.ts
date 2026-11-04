import { Router } from 'express'
import { MAX_VOICE_BYTES, type TranscribeResponse } from '@guardian-book/shared'
import { recordAudit } from '../audit/record.js'
import { requireActor, requireRole } from '../auth/session.js'
import type { Db } from '../db/client.js'
import { isGatewayError } from '../gateway/errors.js'
import { TRANSCRIBE_VERSION, type Transcriber } from '../gateway/transcribe.js'
import { badMultipart, isMultipart, readMultipart } from '../inputs/multipart.js'
import { HttpError, requestIdOf } from '../lib/http.js'
import type { Logger } from '../logger.js'
import { budgetExhausted, checkCaps, recordModelRuns, recordUsage, type CapLimits } from '../modelRuns/index.js'
import { assertVoiceClip, audioTooLarge } from './wav.js'

/**
 * `POST /api/voice/transcribe` (brief B13 §2): a learner's hold-to-talk clip (WAV, ≤ 5 MB,
 * ≤ 60 s) goes to Muse Voice Transcribe through the gateway and the words come back for
 * the learner to see and edit before sending. The audio lives in this request only: it is
 * never written to the bucket, the database or a log line. `model_runs` records the
 * duration, cost and request ID (never the words); the call counts against the daily cap.
 * Learners only: there is no voice on any parent or teacher screen.
 */

export interface VoiceDeps {
  db: Db
  transcriber: Transcriber
  logger: Logger
  limits: CapLimits
  now: () => Date
}

export const voiceNotConfigured = () => new HttpError(503, 'voice_not_configured', 'Voice is not set up on this server. Type your question instead.')
export const transcribeFailed = () => new HttpError(503, 'transcribe_failed', 'We could not hear that. Try again, or type your question.')
export const noAudio = () => new HttpError(400, 'no_audio', 'No recording was sent. Hold the button while you speak.')

export function voiceRouter(deps: VoiceDeps): Router {
  const router = Router()

  router.post('/api/voice/transcribe', requireRole('learner'), async (req, res, next) => {
    try {
      const actor = requireActor(res)
      const requestId = requestIdOf(req) ?? null
      if (!isMultipart(req)) throw badMultipart()
      let body
      try {
        body = await readMultipart(req, MAX_VOICE_BYTES)
      } catch (err) {
        if (err instanceof HttpError && err.code === 'file_too_large') throw audioTooLarge()
        throw err
      }
      if (!body.file) throw noAudio()
      const clip = assertVoiceClip(body.file.bytes)
      if (!deps.transcriber.configured) throw voiceNotConfigured()
      const cap = await checkCaps(deps.db, actor.userId, deps.limits, deps.now())
      if (!cap.ok) {
        await recordAudit(deps.db, { actorId: actor.userId, action: 'voice.transcribe_refused', subjectType: 'user', subjectId: actor.userId, outcome: 'refused', requestId })
        throw budgetExhausted(cap.reason)
      }

      let result
      try {
        result = await deps.transcriber.transcribe(body.file.bytes)
      } catch (err) {
        if (!isGatewayError(err)) throw err
        // The provider was asked (or the call failed on the way): one run row, no words.
        if (!['not_configured', 'refused_model', 'unpriced_model'].includes(err.code)) {
          await recordModelRuns(deps.db, {
            purpose: 'transcribe',
            subjectType: 'user',
            subjectId: actor.userId,
            promptVersion: TRANSCRIBE_VERSION,
            fallbackModel: deps.transcriber.model,
            runs: [{ attemptNo: 1, status: 'failed', output: null, checks: [], usage: null, costUsd: 0, latencyMs: 0, requestId: err.requestId, model: deps.transcriber.model, error: { code: err.code, message: err.message } }],
          })
          await recordUsage(deps.db, { userId: actor.userId, calls: 1, costUsd: 0, now: deps.now() })
        }
        await recordAudit(deps.db, { actorId: actor.userId, action: 'voice.transcribe_refused', subjectType: 'user', subjectId: actor.userId, outcome: 'error', requestId })
        deps.logger.warn('transcribe: gateway failure', { code: err.code, durationMs: clip.durationMs })
        if (err.code === 'bad_request') throw new HttpError(415, 'unsupported_audio', 'That recording could not be read. Try again, or type your question.')
        if (err.code === 'rate_limited') throw new HttpError(429, 'voice_busy', 'Voice is busy right now. Try again in a moment, or type your question.')
        if (err.code === 'not_configured' || err.code === 'refused_model') throw voiceNotConfigured()
        throw transcribeFailed()
      }

      // One `model_runs` row: duration, cost, request ID and latency. Never the transcript.
      await recordModelRuns(deps.db, {
        purpose: 'transcribe',
        subjectType: 'user',
        subjectId: actor.userId,
        promptVersion: TRANSCRIBE_VERSION,
        fallbackModel: deps.transcriber.model,
        runs: [
          {
            attemptNo: 1,
            status: 'accepted',
            output: { audio_duration_ms: result.audioDurationMs, transcript_chars: result.transcript.length },
            checks: [],
            usage: { inputTokens: 0, cachedInputTokens: 0, outputTokens: 0 },
            costUsd: result.costUsd,
            latencyMs: result.latencyMs,
            requestId: result.requestId,
            model: result.model,
            error: null,
          },
        ],
      })
      await recordUsage(deps.db, { userId: actor.userId, calls: 1, costUsd: result.costUsd, now: deps.now() })
      await recordAudit(deps.db, { actorId: actor.userId, action: 'voice.transcribed', subjectType: 'user', subjectId: actor.userId, outcome: 'ok', requestId })

      const payload: TranscribeResponse = { transcript: result.transcript, durationMs: result.audioDurationMs }
      res.setHeader('Cache-Control', 'no-store')
      res.json(payload)
    } catch (err) {
      next(err)
    }
  })

  return router
}
