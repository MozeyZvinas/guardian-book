import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Language } from '@guardian-book/shared'
import { loadConfig } from '../config.js'
import { createGateway } from '../gateway/gateway.js'
import { verifiedCall } from '../gateway/verifiedCall.js'
import { logger } from '../logger.js'
import { protectText, restoreText } from './placeholders.js'
import { TRANSLATE_MAX_TOKENS, TRANSLATE_PROMPT_VERSION, TRANSLATE_TIMEOUT_MS, buildTranslateSystem, buildTranslateUser } from './prompt.v1.js'

/**
 * The B12 live check (brief §7): one plan's guardian view and one note, translated into
 * isiZulu and Afrikaans for real through the gateway and the verifier (under $0.10), so
 * a fluent speaker can check the four outputs recorded in `docs/TASKS.md`. Prints the
 * verifier result, tokens and cost per call; never the key. Not run in CI.
 *
 *   pnpm --filter @guardian-book/api exec tsx src/translate/live.ts
 */

const here = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(here, '../../../..')

/** Fictional texts in the shape the screens show: a plan's guardian view and a sent note. */
const SAMPLES: Array<{ label: string; text: string }> = [
  {
    label: 'plan (gap · action · celebrate)',
    text: 'One step slipped this week: factorising. Ask Lerato to teach you step 2 tonight. Ten minutes is enough; you do not need to know the maths. Lerato brought 3 pieces of work this week and had every one checked.',
  },
  {
    label: 'note',
    text: 'This week Lerato worked on algebra. One step slipped: writing the final answers after factorising. Please ask Lerato to explain that step to you tonight; 10 minutes is enough. Ms Dlamini',
  },
]
const LANGUAGES: Language[] = ['zu', 'af']
const names = { learner: 'Lerato', teacher: 'Ms Dlamini' }

async function main(): Promise<void> {
  try {
    process.loadEnvFile(path.join(repoRoot, '.env'))
  } catch {
    // Environment may already be set.
  }
  const config = loadConfig()
  const gateway = createGateway({ config: config.meta, logger })
  if (!gateway.configured) {
    console.error('translate:live: META_API_KEY is not set (or the model was refused); nothing to run.')
    process.exit(2)
  }

  let totalCost = 0
  for (const sample of SAMPLES) {
    const protectedText = protectText(sample.text, names)
    for (const language of LANGUAGES) {
      const result = await verifiedCall({
        gateway,
        purpose: 'translate',
        promptVersion: TRANSLATE_PROMPT_VERSION,
        system: buildTranslateSystem(),
        user: buildTranslateUser({ language, text: protectedText.text }),
        context: { sourceText: protectedText.text, placeholders: protectedText.placeholders, language },
        maxTokens: TRANSLATE_MAX_TOKENS,
        timeoutMs: TRANSLATE_TIMEOUT_MS,
      })
      totalCost += result.totalCostUsd
      const output = result.output ? restoreText(result.output.text, protectedText) : null
      console.log(
        JSON.stringify({
          sample: sample.label,
          language,
          status: result.status,
          model: result.runs.map((run) => run.model).find(Boolean) ?? gateway.model,
          calls: result.runs.length,
          requestIds: result.runs.map((run) => run.requestId),
          tokens: result.runs.map((run) => (run.usage ? `${run.usage.inputTokens}in/${run.usage.outputTokens}out` : '-')),
          costUsd: result.totalCostUsd,
          latencyMs: result.totalLatencyMs,
          failedChecks: result.runs.map((run) => run.checks.filter((check) => !check.passed).map((check) => `${check.code}: ${check.detail}`)),
          error: result.error ? result.error.code : null,
        }),
      )
      console.log(`    EN: ${sample.text}`)
      console.log(`    ${language.toUpperCase()}: ${output ?? '(no accepted output; the English would stand)'}`)
    }
  }
  console.log(JSON.stringify({ totalCostUsd: Math.round(totalCost * 1e6) / 1e6 }))
}

main().catch((err: unknown) => {
  console.error('translate:live failed:', err instanceof Error ? err.message : err)
  process.exit(1)
})
