import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { z } from 'zod'
import { loadConfig } from '../config.js'
import { createGateway } from '../gateway/gateway.js'
import { createTranscriber } from '../gateway/transcribe.js'
import { verifiedCall } from '../gateway/verifiedCall.js'
import { STEP_HINT_MAX_TOKENS, STEP_HINT_PROMPT_VERSION, STEP_HINT_TIMEOUT_MS, buildStepHintSystem, buildStepHintUser, stepHintContext } from '../hints/prompt.v1.js'
import { logger } from '../logger.js'
import { assertVoiceClip } from './wav.js'

/**
 * The B13 live check (brief §6): one real transcription of a short recorded question and
 * one real hint, with latency and cost printed. No database. Never prints the key. Not CI.
 *
 *   say -o /tmp/q.aiff "I don't get why it's minus six"
 *   afconvert -f WAVE -d LEI16@16000 -c 1 /tmp/q.aiff /tmp/q.wav
 *   pnpm --filter @guardian-book/api exec tsx src/voice/live-smoke.ts /tmp/q.wav
 *
 * The hint uses B03's eval fixture item (`evals/fixtures/items/alg-quad-01.json`), not a
 * learner's work. Reads `.env` from the repo root (the key never enters the shell history).
 */

const here = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(here, '../../../..')

const fixtureSchema = z.looseObject({
  slug: z.string(),
  prompt_md: z.string(),
  max_marks: z.number().int(),
  final_answer: z.string().nullable(),
  guideline: z.array(
    z.looseObject({ step_id: z.string(), step_no: z.number().int(), kind: z.enum(['M', 'A', 'CA']), criterion: z.string(), marks: z.number().int(), notes: z.string().nullable(), expected: z.string().nullable() }),
  ),
})

async function main(): Promise<void> {
  try {
    process.loadEnvFile(path.join(repoRoot, '.env'))
  } catch {
    // Environment may already be set.
  }
  const config = loadConfig()
  const clipPath = process.argv[2]
  if (!clipPath) {
    console.error('usage: tsx src/voice/live-smoke.ts <question.wav>')
    process.exit(2)
  }

  // 1. Voice.
  const transcriber = createTranscriber({ config: config.meta, logger })
  if (!transcriber.configured) {
    console.error('voice live smoke: META_API_KEY is not set (or the model was refused); nothing to run.')
    process.exit(2)
  }
  const clip = await readFile(path.resolve(clipPath))
  const info = assertVoiceClip(clip)
  const voice = await transcriber.transcribe(clip)
  console.log(JSON.stringify({ step: 'transcribe', model: voice.model, clip: info, requestId: voice.requestId, audioDurationMs: voice.audioDurationMs, latencyMs: voice.latencyMs, costUsd: voice.costUsd, attempts: voice.attempts, transcript: voice.transcript }))

  // 2. One hint about the transcribed question, on the eval fixture item's step 2 (the factors).
  const gateway = createGateway({ config: config.meta, logger })
  const raw: unknown = JSON.parse(await readFile(path.join(here, '../evals/fixtures/items/alg-quad-01.json'), 'utf8'))
  const item = fixtureSchema.parse(raw)
  const step = item.guideline.find((s) => s.step_no === 2) ?? item.guideline[0]
  if (!step) throw new Error('fixture has no steps')
  const user = buildStepHintUser({
    item: { slug: item.slug, prompt_md: item.prompt_md, max_marks: item.max_marks },
    step: { step_id: step.step_id, step_no: step.step_no, kind: step.kind, criterion: step.criterion, marks: step.marks, notes: step.notes, feedback: 'The signs inside the brackets are wrong.' },
    working: 'x² − 5x + 6 = 0\n(x + 2)(x + 3) = 0\nx = −2 or x = −3',
    question: voice.transcript,
  })
  const memoValues = item.guideline.filter((s) => s.kind !== 'M').map((s) => s.criterion)
  const result = await verifiedCall({
    gateway,
    purpose: 'step_hint',
    promptVersion: STEP_HINT_PROMPT_VERSION,
    system: buildStepHintSystem(),
    user,
    context: stepHintContext(
      item.guideline.map((s) => ({ step_id: s.step_id, kind: s.kind, marks: s.marks, expected: s.expected })),
      memoValues,
      item.final_answer,
    ),
    maxTokens: STEP_HINT_MAX_TOKENS,
    timeoutMs: STEP_HINT_TIMEOUT_MS,
  })
  console.log(
    JSON.stringify({
      step: 'hint',
      status: result.status,
      model: result.runs.map((run) => run.model).find(Boolean) ?? gateway.model,
      requestIds: result.runs.map((run) => run.requestId),
      calls: result.runs.length,
      tokens: result.runs.map((run) => (run.usage ? `${run.usage.inputTokens}in/${run.usage.cachedInputTokens}cached/${run.usage.outputTokens}out` : '-')),
      costUsd: result.totalCostUsd,
      latencyMs: result.totalLatencyMs,
      failedChecks: result.runs.map((run) => run.checks.filter((check) => !check.passed).map((check) => check.code)),
      hint: result.output?.hint ?? null,
      error: result.error?.code ?? null,
    }),
  )
  console.log(`voice live smoke: total cost $${(voice.costUsd + result.totalCostUsd).toFixed(5)}`)
}

main().catch((err: unknown) => {
  console.error('voice live smoke failed:', err instanceof Error ? `${err.name}: ${err.message}` : err)
  process.exit(1)
})
