import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { z } from 'zod'
import { loadConfig } from '../config.js'
import { createGateway } from '../gateway/gateway.js'
import { WORK_CHECK_MAX_TOKENS, WORK_CHECK_PROMPT_VERSION, WORK_CHECK_TIMEOUT_MS, buildWorkCheckSystem, buildWorkCheckUser, workCheckContext, type WorkCheckPromptInput } from '../gateway/prompts/workCheck.v1.js'
import { verifiedCall } from '../gateway/verifiedCall.js'
import { logger } from '../logger.js'

/**
 * `pnpm smoke:live`: the manual live smoke test (B03 item 7). Two original seed items,
 * each with a correct typed answer and a wrong one: four verified calls. Prints model ID,
 * request IDs, tokens, cost and latency. Never prints the key. Not run in CI.
 */

const here = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(here, '../../../..')
const itemsDir = path.resolve(here, '../../seed/items')

const seedItemSchema = z.looseObject({
  slug: z.string(),
  prompt_md: z.string(),
  max_marks: z.number().int(),
  final_answer: z.string().nullable(),
  guideline: z.array(
    z.looseObject({
      step_id: z.string(),
      step_no: z.number().int(),
      kind: z.enum(['M', 'A', 'CA']),
      criterion: z.string(),
      marks: z.number().int(),
      notes: z.string().nullable(),
      expected: z.string().nullable(),
    }),
  ),
})

/** Synthetic answers written for this test; no learner wrote them. */
const SAMPLE_ANSWERS: Record<string, { correct: string; wrong: string }> = {
  'alg-quad-01': {
    correct: 'x² − 5x + 6 = 0\n(x − 2)(x − 3) = 0\nx − 2 = 0 or x − 3 = 0\nx = 2 or x = 3',
    wrong: 'x² − 5x + 6 = 0\n(x + 2)(x + 3) = 0\nx = −2 or x = −3',
  },
  'alg-lin-01': {
    correct: '3(x − 2) = 2x + 5\n3x − 6 = 2x + 5\n3x − 2x = 5 + 6\nx = 11',
    wrong: '3(x − 2) = 2x + 5\n3x − 2 = 2x + 5\n3x − 2x = 5 + 2\nx = 7',
  },
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
    console.error('smoke:live: META_API_KEY is not set (or the model was refused); nothing to run.')
    process.exit(2)
  }

  let totalCost = 0
  const summary: Array<Record<string, unknown>> = []
  for (const [slug, answers] of Object.entries(SAMPLE_ANSWERS)) {
    const raw: unknown = JSON.parse(await readFile(path.join(itemsDir, `${slug}.json`), 'utf8'))
    const item = seedItemSchema.parse(raw)
    for (const [label, text] of [
      ['correct', answers.correct],
      ['wrong', answers.wrong],
    ] as const) {
      const input: WorkCheckPromptInput = {
        item: { slug: item.slug, prompt_md: item.prompt_md, max_marks: item.max_marks },
        guideline: item.guideline,
        answer: { kind: 'typed', text },
        mode: 'assisted',
        final_answer: item.final_answer,
      }
      const user = buildWorkCheckUser(input)
      const result = await verifiedCall({
        gateway,
        purpose: 'assess',
        promptVersion: WORK_CHECK_PROMPT_VERSION,
        system: buildWorkCheckSystem(),
        user: user.text,
        images: user.images,
        context: workCheckContext(input),
        maxTokens: WORK_CHECK_MAX_TOKENS,
        timeoutMs: WORK_CHECK_TIMEOUT_MS,
      })
      totalCost += result.totalCostUsd
      const row = {
        item: slug,
        answer: label,
        status: result.status,
        model: result.runs.map((run) => run.model).find(Boolean) ?? gateway.model,
        requestIds: result.runs.map((run) => run.requestId),
        calls: result.runs.length,
        tokens: result.runs.map((run) => (run.usage ? `${run.usage.inputTokens}in/${run.usage.cachedInputTokens}cached/${run.usage.outputTokens}out` : '-')),
        costUsd: result.totalCostUsd,
        latencyMs: result.totalLatencyMs,
        total: result.output?.total ?? null,
        steps: result.output?.steps.map((step) => `${step.step_id}:${step.awarded}/${step.available}:${step.confidence}${step.hint ? ':hint' : ''}`) ?? null,
        failedChecks: result.runs.map((run) => run.checks.filter((check) => !check.passed).map((check) => check.code)),
        error: result.error ? result.error.code : null,
      }
      summary.push(row)
      console.log(JSON.stringify(row))
      if (result.status !== 'accepted') {
        for (const run of result.runs) {
          for (const check of run.checks.filter((c) => !c.passed)) console.log(`    run ${run.attemptNo} ${check.code}: ${check.detail}`)
        }
      }
      if (result.output) {
        for (const step of result.output.steps) {
          console.log(`    ${step.step_id} ${step.awarded}/${step.available} ${step.confidence} · evidence: ${JSON.stringify(step.evidence)} · feedback: ${JSON.stringify(step.feedback)}${step.hint ? ` · hint: ${JSON.stringify(step.hint)}` : ''}`)
        }
      }
    }
  }
  console.log(`smoke:live: ${summary.length} verified call(s), model ${gateway.model}, total cost $${totalCost.toFixed(5)}`)
}

main().catch((err: unknown) => {
  console.error('smoke:live failed:', err instanceof Error ? `${err.name}: ${err.message}` : err)
  process.exit(1)
})
