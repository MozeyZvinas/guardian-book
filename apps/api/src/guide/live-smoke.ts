import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { GuideOutput } from '@guardian-book/shared'
import { loadConfig } from '../config.js'
import { createGateway } from '../gateway/gateway.js'
import { verifiedCall, type VerifiedCallResult } from '../gateway/verifiedCall.js'
import { logger } from '../logger.js'
import { answersDisagree } from '../verify/checks/guide.js'
import { chooseRead, decideGuide } from './service.js'
import { GUIDE_CHECK_PROMPT_VERSION, GUIDE_MAX_TOKENS, GUIDE_PROMPT_VERSION, GUIDE_TIMEOUT_MS, buildGuideSystem, buildGuideUser } from './prompt.v1.js'

/**
 * The B15 live check (brief §7): the founder's textbook case typed with `\( … \)` maths,
 * plus one Grade 12 quadratic, each read twice by Muse Spark exactly as the app does it
 * (two independent reads in parallel, verified, compared). Prints both reads, the
 * agreement, latency and cost per case. No database. Never prints the key. Not CI.
 *
 *   pnpm --filter @guardian-book/api exec tsx src/guide/live-smoke.ts
 *
 * Reads `.env` from the repo root (the key never enters the shell history). Both
 * questions are original (D20): nothing from a DBE paper.
 */

const here = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(here, '../../../..')

const CASES = [
  { id: 'rationals', text: 'Find two rational numbers between \\(\\frac{1}{4}\\) and \\(\\frac{7}{8}\\).' },
  { id: 'quadratic', text: 'Solve for $x$: $$2x^2 - 7x + 3 = 0$$' },
]

function summary(read: VerifiedCallResult<GuideOutput>, version: string) {
  return {
    version,
    status: read.status,
    calls: read.runs.length,
    requestIds: read.runs.map((run) => run.requestId),
    tokens: read.runs.map((run) => (run.usage ? `${run.usage.inputTokens}in/${run.usage.cachedInputTokens}cached/${run.usage.outputTokens}out` : '-')),
    latencyMs: read.totalLatencyMs,
    costUsd: read.totalCostUsd,
    failedChecks: read.runs.map((run) => run.checks.filter((check) => !check.passed).map((check) => check.code)),
    error: read.error?.code ?? null,
    confidence: read.output?.confidence ?? null,
    question: read.output?.question_md ?? null,
    steps: read.output?.steps.map((step) => step.goal) ?? null,
    finalAnswer: read.output?.final_answer ?? null,
  }
}

async function main(): Promise<void> {
  try {
    process.loadEnvFile(path.join(repoRoot, '.env'))
  } catch {
    // Environment may already be set.
  }
  const config = loadConfig()
  const gateway = createGateway({ config: config.meta, logger })
  if (!gateway.configured) {
    console.error('guide live smoke: META_API_KEY is not set (or the model was refused); nothing to run.')
    process.exit(2)
  }
  let total = 0
  for (const item of CASES) {
    const started = Date.now()
    const [first, check] = await Promise.all(
      (['first', 'check'] as const).map((read) =>
        verifiedCall({
          gateway,
          purpose: 'guide',
          promptVersion: read === 'first' ? GUIDE_PROMPT_VERSION : GUIDE_CHECK_PROMPT_VERSION,
          system: buildGuideSystem(),
          user: buildGuideUser({ kind: 'text', text: item.text }, read).text,
          context: { otherFinalAnswer: null },
          maxTokens: GUIDE_MAX_TOKENS,
          timeoutMs: GUIDE_TIMEOUT_MS,
        }),
      ),
    )
    if (!first || !check) throw new Error('a read is missing')
    const wallMs = Date.now() - started
    const reads = [first, check]
    const chosen = chooseRead(reads)
    const decision = decideGuide(
      reads.map((read) => read.output),
      chosen?.output ?? null,
    )
    const agreement =
      first.output && check.output ? answersDisagree(first.output, { otherFinalAnswer: check.output.final_answer }) : { passed: false, detail: 'a read is missing' }
    const cost = first.totalCostUsd + check.totalCostUsd
    total += cost
    console.log(
      JSON.stringify({
        case: item.id,
        model: gateway.model,
        status: decision.status,
        agreement: decision.agreement,
        agreementDetail: agreement.detail,
        wallMs,
        costUsd: Math.round(cost * 1e6) / 1e6,
        reads: [summary(first, GUIDE_PROMPT_VERSION), summary(check, GUIDE_CHECK_PROMPT_VERSION)],
      }),
    )
  }
  console.log(`guide live smoke: total cost $${total.toFixed(5)} over ${CASES.length} cases`)
}

main().catch((err: unknown) => {
  console.error('guide live smoke failed:', err instanceof Error ? `${err.name}: ${err.message}` : err)
  process.exit(1)
})
