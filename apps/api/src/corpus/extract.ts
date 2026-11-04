import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { uuidv7, type ExtractOutput, type PaperRef } from '@guardian-book/shared'
import { createDb, type Db } from '../db/client.js'
import { createGateway, type Gateway } from '../gateway/gateway.js'
import type { ImageInput } from '../gateway/transport.js'
import { verifiedCall, type VerifiedRun } from '../gateway/verifiedCall.js'
import { logger } from '../logger.js'
import { recordModelRuns } from '../modelRuns/record.js'
import { createStorage } from '../storage/index.js'
import type { CheckResult } from '../verify/types.js'
import { guideCase, modelAnswerCase, perturbedCase } from './cases.js'
import { HELD_OUT_SESSIONS, isHeldOut, sessionKey, type CorpusPaper } from './catalogue.js'
import { cropDiagram, uploadCrops } from './diagrams.js'
import { fetchPaper, mathsCatalogue, type LocalPaper } from './download.js'
import { assertOutsideRepo, corpusConfig, corpusDirs, type CorpusDirs } from './env.js'
import { buildQuestions, countQuestions, diagramKeyFor, loaderProblem, mergeEntries, questionSlug, toItemFile, type BuiltQuestion, type MergedEntry, type PageRead } from './merge.js'
import { pdftoppmAvailable } from './pages.js'
import { EXTRACT_MAX_TOKENS, EXTRACT_PROMPT_VERSION, EXTRACT_TIMEOUT_MS, buildExtractSystem, buildExtractUser, extractContext } from './prompt.v2.js'
import { createCorpusBucket } from './r2.js'

/**
 * `pnpm corpus:extract [session...]` (brief B17 phase A): for each Mathematics Grade 12
 * paper (newest first), download and rasterise it, read every page of the paper and the
 * memo with Muse Spark (purpose `extract`, one `model_runs` row per call, the verifier on
 * every read), merge the pages into questions, line the memo up with the paper, re-read a
 * question that fails (at most three reads in all), and write:
 *
 *   <CORPUS_DIR>/extracted/<paper>/pages/*.json   every page read (cached: a re-run reads nothing twice)
 *   <CORPUS_DIR>/extracted/<paper>/questions.json the merged questions with their status and reasons
 *   <CORPUS_DIR>/items/<slug>.json                 loader files for the approved questions (`pnpm content:load`)
 *   <CORPUS_DIR>/drafts/<slug>.json                questions kept as draft with their reason, never loaded
 *   <CORPUS_DIR>/diagrams/<key>                    diagram crops, uploaded to the app bucket when BUCKET_* is set
 *   <CORPUS_DIR>/evals/held-out/                   phase C cases for the held-out session
 *
 * Options: `--papers=1,2`, `--concurrency=4`, `--held-out=<year>-<session>,…` (default: D31's
 * frozen set, 2026 May/June and 2025 November), `--max-pages=N` (a dry development run),
 * `--no-upload`.
 * Needs DATABASE_URL (the `model_runs` rows), META_API_KEY and DBE_R2_*.
 */

interface PageRecord {
  document: 'paper' | 'memo'
  page: number
  status: 'accepted' | 'exhausted' | 'failed'
  output: ExtractOutput | null
  onlyNumbers: string[]
  calls: number
  costUsd: number
  latencyMs: number
  checks: CheckResult[][]
  error: { code: string; message: string } | null
  promptVersion: string
  readAt: string
}

interface Ctx {
  db: Db
  gateway: Gateway
  dirs: CorpusDirs
  runId: string
  concurrency: number
  spent: { calls: number; costUsd: number }
}

interface QuestionRecord extends BuiltQuestion {
  slug: string
  status: 'approved' | 'draft'
  attempts: number
  diagram_key: string | null
}

const round = (value: number): number => Math.round(value * 1e6) / 1e6

function imageFor(file: string): ImageInput {
  return { kind: 'base64', mediaType: 'image/png', data: readFileSync(file).toString('base64') }
}

async function pool<T, R>(items: T[], size: number, worker: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array<R>(items.length)
  let next = 0
  const runners = Array.from({ length: Math.max(1, Math.min(size, items.length)) }, async () => {
    while (next < items.length) {
      const index = next
      next += 1
      results[index] = await worker(items[index] as T)
    }
  })
  await Promise.all(runners)
  return results
}

async function readPage(
  ctx: Ctx,
  local: LocalPaper,
  document: 'paper' | 'memo',
  page: number,
  options: { onlyNumbers?: string[]; failures?: string[]; maxCalls?: number } = {},
): Promise<PageRecord> {
  const pages = document === 'paper' ? local.paperPages : local.memoPages
  const file = pages[page - 1]
  if (!file) throw new Error(`${local.id}: ${document} has no page ${page}`)
  const input = { ref: local.ref, document, page, pages: pages.length, image: imageFor(file), ...options }
  const user = buildExtractUser(input)
  const result = await verifiedCall({
    gateway: ctx.gateway,
    purpose: 'extract',
    promptVersion: EXTRACT_PROMPT_VERSION,
    system: buildExtractSystem(),
    user: user.text,
    images: user.images,
    context: extractContext(input),
    maxTokens: EXTRACT_MAX_TOKENS,
    timeoutMs: EXTRACT_TIMEOUT_MS,
    ...(options.maxCalls !== undefined ? { maxCalls: options.maxCalls } : {}),
  })
  await recordModelRuns(ctx.db, {
    purpose: 'extract',
    subjectType: 'corpus_paper',
    subjectId: ctx.runId,
    promptVersion: EXTRACT_PROMPT_VERSION,
    fallbackModel: ctx.gateway.model,
    runs: result.runs,
  })
  ctx.spent.calls += result.runs.length
  ctx.spent.costUsd = round(ctx.spent.costUsd + result.totalCostUsd)
  const record: PageRecord = {
    document,
    page,
    status: result.status,
    output: result.output,
    onlyNumbers: options.onlyNumbers ?? [],
    calls: result.runs.length,
    costUsd: result.totalCostUsd,
    latencyMs: result.totalLatencyMs,
    checks: result.runs.map((run: VerifiedRun) => run.checks),
    error: result.error ? { code: result.error.code, message: result.error.message } : null,
    promptVersion: EXTRACT_PROMPT_VERSION,
    readAt: new Date().toISOString(),
  }
  const failed = result.runs.flatMap((run) => run.checks.filter((check) => !check.passed).map((check) => check.code))
  console.log(
    `    ${document} p${String(page).padStart(2, '0')}${options.onlyNumbers ? ` [${options.onlyNumbers.join(',')}]` : ''}: ${record.status} · ${record.output?.entries.length ?? 0} entr${record.output?.entries.length === 1 ? 'y' : 'ies'} · ${record.calls} call(s) · ${Math.round(record.latencyMs / 1000)} s · $${record.costUsd.toFixed(4)}${failed.length ? ` · blocked: ${[...new Set(failed)].join(',')}` : ''}`,
  )
  return record
}

function pageFile(dirs: CorpusDirs, paperId: string, document: string, page: number): string {
  return path.join(dirs.extracted, paperId, 'pages', `${document}-${String(page).padStart(2, '0')}.json`)
}

async function readDocument(ctx: Ctx, local: LocalPaper, document: 'paper' | 'memo', maxPages: number | null): Promise<PageRecord[]> {
  const pages = document === 'paper' ? local.paperPages : local.memoPages
  const numbers = pages.map((_, index) => index + 1).filter((page) => maxPages === null || page <= maxPages)
  return pool(numbers, ctx.concurrency, async (page) => {
    const file = pageFile(ctx.dirs, local.id, document, page)
    if (existsSync(file)) {
      const cached = JSON.parse(readFileSync(file, 'utf8')) as PageRecord
      if (cached.status === 'accepted') return cached
    }
    const record = await readPage(ctx, local, document, page)
    mkdirSync(path.dirname(file), { recursive: true })
    writeFileSync(file, `${JSON.stringify(record, null, 2)}\n`)
    return record
  })
}

const accepted = (records: PageRecord[]): PageRead[] =>
  records.filter((record): record is PageRecord & { output: ExtractOutput } => record.status === 'accepted' && record.output !== null).map((record) => ({ page: record.page, output: record.output }))

/** The memo pages worth re-reading for a question: its own, else the pages holding its parent or siblings. */
function memoPagesFor(question: BuiltQuestion, memo: MergedEntry[]): number[] {
  if (question.memoPages.length > 0) return question.memoPages
  const parent = question.number.split('.').slice(0, -1).join('.')
  const near = memo.filter((entry) => entry.number === parent || (parent.length > 0 && entry.number.startsWith(`${parent}.`)))
  return [...new Set(near.flatMap((entry) => entry.pages))].sort((a, b) => a - b).slice(0, 2)
}

const MEMO_REASONS = new Set(['memo_missing', 'memo_steps_missing', 'marks_mismatch'])
const PAPER_REASONS = new Set(['question_text_missing'])
export const MAX_QUESTION_READS = 3

async function extractPaper(ctx: Ctx, bucket: NonNullable<ReturnType<typeof createCorpusBucket>>, paper: CorpusPaper, options: { heldOut: boolean; maxPages: number | null }): Promise<QuestionRecord[]> {
  const local = await fetchPaper(bucket, ctx.dirs, paper)
  console.log(`  ${paper.id}: paper ${local.paperPages.length} page(s), memo ${local.memoPages.length} page(s)${options.heldOut ? ' · HELD OUT' : ''}`)
  const paperRecords = await readDocument(ctx, local, 'paper', options.maxPages)
  const memoRecords = await readDocument(ctx, local, 'memo', options.maxPages)

  let paperEntries = mergeEntries(accepted(paperRecords))
  let memoEntries = mergeEntries(accepted(memoRecords))
  let questions = buildQuestions(paperEntries, memoEntries)
  const attempts = new Map<string, number>(questions.map((question) => [question.number, 1]))

  // Targeted re-reads: a question whose memo (or text) failed the cross-document checks is
  // read again, alone, with the failure in the prompt; three reads in all, then a draft.
  for (let round = 1; round < MAX_QUESTION_READS; round += 1) {
    const failing = questions.filter((question) => question.reasons.some((reason) => MEMO_REASONS.has(reason) || PAPER_REASONS.has(reason) || reason === 'maths_unbalanced'))
    if (failing.length === 0) break
    console.log(`    re-read ${round}: ${failing.length} question(s)`)
    const rereads = await pool(failing, ctx.concurrency, async (question) => {
      const memoSide = question.reasons.some((reason) => MEMO_REASONS.has(reason)) || (question.reasons.includes('maths_unbalanced') && question.steps.length > 0)
      const document: 'paper' | 'memo' = memoSide ? 'memo' : 'paper'
      const pages = memoSide ? memoPagesFor(question, memoEntries) : question.paperPages
      attempts.set(question.number, (attempts.get(question.number) ?? 1) + 1)
      const records: PageRecord[] = []
      for (const page of pages) {
        const record = await readPage(ctx, local, document, page, { onlyNumbers: [question.number], failures: question.details, maxCalls: 1 })
        const file = path.join(ctx.dirs.extracted, local.id, 'rereads', `${document}-${question.number}-${round}-p${page}.json`)
        mkdirSync(path.dirname(file), { recursive: true })
        writeFileSync(file, `${JSON.stringify(record, null, 2)}\n`)
        records.push(record)
      }
      return { question, document, records }
    })
    for (const { question, document, records } of rereads) {
      const fresh = mergeEntries(accepted(records)).filter((entry) => entry.number === question.number)
      if (fresh.length === 0) continue
      if (document === 'memo') memoEntries = [...memoEntries.filter((entry) => entry.number !== question.number), ...fresh]
      else paperEntries = paperEntries.map((entry) => (entry.number === question.number ? { ...fresh[0]!, kind: entry.kind } : entry))
    }
    questions = buildQuestions(paperEntries, memoEntries)
  }

  // Diagrams: one crop per owning entry, shared by every question under it.
  const diagramKeys = new Map<string, string | null>()
  for (const question of questions) {
    if (!question.diagram || !question.diagramOwner || diagramKeys.has(question.diagramOwner)) continue
    const key = diagramKeyFor(local.ref, question.diagramOwner)
    const pagePng = local.paperPages[question.diagram.page - 1]
    const ok = pagePng ? await cropDiagram(pagePng, question.diagram.box, path.join(ctx.dirs.diagrams, key)) : false
    diagramKeys.set(question.diagramOwner, ok ? key : null)
  }

  const records: QuestionRecord[] = questions.map((question) => {
    const diagram_key = question.diagramOwner ? (diagramKeys.get(question.diagramOwner) ?? null) : null
    const problem = question.reasons.length === 0 ? loaderProblem(local.ref, question, { heldOut: options.heldOut, diagramKey: diagram_key }) : null
    if (problem) {
      question.reasons.push('loader_invalid')
      question.details.push(problem)
    }
    return {
      ...question,
      slug: questionSlug(local.ref, question.number),
      status: question.reasons.length === 0 ? 'approved' : 'draft',
      attempts: attempts.get(question.number) ?? 1,
      diagram_key,
    }
  })
  writeOutputs(ctx.dirs, local.ref, local.id, records, options.heldOut)
  return records
}

/** Items, drafts and (for the held-out session) evaluation cases; stale files for the paper go first. */
function writeOutputs(dirs: CorpusDirs, ref: PaperRef, paperId: string, records: QuestionRecord[], heldOut: boolean): void {
  const prefix = questionSlug(ref, '')
  for (const dir of [dirs.items, dirs.drafts]) {
    for (const name of readdirSync(dir)) if (name.startsWith(prefix)) rmSync(path.join(dir, name))
  }
  const evalDir = path.join(dirs.evals, 'held-out')
  const guideDir = path.join(evalDir, 'guide')
  if (heldOut) {
    mkdirSync(guideDir, { recursive: true })
    for (const dir of [evalDir, guideDir]) for (const name of readdirSync(dir)) if (name.startsWith(prefix)) rmSync(path.join(dir, name))
  }
  for (const record of records) {
    if (record.status === 'approved') {
      const item = toItemFile(ref, record, { heldOut, diagramKey: record.diagram_key })
      writeFileSync(path.join(dirs.items, `${record.slug}.json`), `${JSON.stringify(item, null, 2)}\n`)
      if (heldOut) {
        const memoCase = modelAnswerCase(ref, record)
        if (memoCase) writeFileSync(path.join(evalDir, `${memoCase.id}.json`), `${JSON.stringify(memoCase, null, 2)}\n`)
        const perturbed = perturbedCase(ref, record)
        if (perturbed) writeFileSync(path.join(evalDir, `${perturbed.id}.json`), `${JSON.stringify(perturbed, null, 2)}\n`)
        const guide = guideCase(ref, record, record.diagram_key ? path.join('..', '..', 'diagrams', record.diagram_key) : null)
        if (guide) writeFileSync(path.join(guideDir, `${guide.id}.json`), `${JSON.stringify(guide, null, 2)}\n`)
      }
    } else {
      writeFileSync(path.join(dirs.drafts, `${record.slug}.json`), `${JSON.stringify({ ...record, source_ref: { ...ref, question: record.number } }, null, 2)}\n`)
    }
  }
  writeFileSync(path.join(dirs.extracted, paperId, 'questions.json'), `${JSON.stringify(records, null, 2)}\n`)
}

function parseArgs(argv: string[]): { sessions: Set<string>; papers: Set<number>; concurrency: number; heldOut: string[]; maxPages: number | null; upload: boolean } {
  const sessions = new Set<string>()
  const papers = new Set<number>([1, 2])
  let concurrency = 4
  let heldOut: string[] = [...HELD_OUT_SESSIONS]
  let maxPages: number | null = null
  let upload = true
  for (const arg of argv) {
    if (arg.startsWith('--papers=')) {
      papers.clear()
      for (const value of arg.slice('--papers='.length).split(',')) papers.add(Number(value))
    } else if (arg.startsWith('--concurrency=')) concurrency = Math.max(1, Number(arg.slice('--concurrency='.length)) || 1)
    else if (arg.startsWith('--held-out=')) heldOut = arg.slice('--held-out='.length).split(',').filter((value) => value.length > 0)
    else if (arg.startsWith('--max-pages=')) maxPages = Math.max(1, Number(arg.slice('--max-pages='.length)) || 1)
    else if (arg === '--no-upload') upload = false
    else if (arg.startsWith('--')) throw new Error(`unknown option ${arg}`)
    else sessions.add(arg)
  }
  return { sessions, papers, concurrency, heldOut, maxPages, upload }
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2))
  const config = corpusConfig()
  const bucket = createCorpusBucket(config.corpus)
  if (!bucket) throw new Error('DBE_R2_* is not set')
  if (!(await pdftoppmAvailable())) throw new Error('pdftoppm (poppler) is not installed')
  if (!config.db.url) throw new Error('DATABASE_URL is not set (every model call is a model_runs row)')
  const gateway = createGateway({ config: config.meta, logger })
  if (!gateway.configured) throw new Error('the model gateway is not configured (META_API_KEY missing or the model refused)')
  const dirs = corpusDirs()
  assertOutsideRepo(dirs.root)

  const catalogue = await mathsCatalogue(bucket, dirs)
  const selected = catalogue.filter((paper) => (args.sessions.size === 0 || args.sessions.has(sessionKey(paper.ref))) && args.papers.has(paper.ref.paper))
  console.log(`corpus:extract: ${selected.length} paper(s) of ${catalogue.length}; held out: ${args.heldOut.join(', ') || 'none'}; model ${gateway.model}; concurrency ${args.concurrency}`)

  const handle = createDb(config.db.url, 2)
  const ctx: Ctx = { db: handle.db, gateway, dirs, runId: uuidv7(), concurrency: args.concurrency, spent: { calls: 0, costUsd: 0 } }
  const ledger = path.join(dirs.root, 'spend.json')
  const spend = existsSync(ledger) ? (JSON.parse(readFileSync(ledger, 'utf8')) as Array<{ at: string; paper: string; calls: number; costUsd: number }>) : []
  try {
    for (const paper of selected) {
      const before = { ...ctx.spent }
      const started = Date.now()
      const records = await extractPaper(ctx, bucket, paper, { heldOut: isHeldOut(paper.ref, args.heldOut), maxPages: args.maxPages })
      const counts = countQuestions(records)
      const cost = round(ctx.spent.costUsd - before.costUsd)
      spend.push({ at: new Date().toISOString(), paper: paper.id, calls: ctx.spent.calls - before.calls, costUsd: cost })
      writeFileSync(ledger, `${JSON.stringify(spend, null, 2)}\n`)
      const total = round(spend.reduce((sum, row) => sum + row.costUsd, 0))
      const report = { paper: paper.id, ...counts, calls: ctx.spent.calls - before.calls, costUsd: cost, totalCostUsd: total, seconds: Math.round((Date.now() - started) / 1000), at: new Date().toISOString() }
      writeFileSync(path.join(dirs.extracted, paper.id, 'report.json'), `${JSON.stringify(report, null, 2)}\n`)
      console.log(
        `  ${paper.id}: ${counts.questions} questions · ${counts.memoAligned} memo-aligned · ${counts.approved} approved · ${counts.draft} draft${counts.draft ? ` (${Object.entries(counts.byReason).map(([reason, n]) => `${reason} ${n}`).join(', ')})` : ''} · $${cost.toFixed(2)} this paper · $${total.toFixed(2)} so far`,
      )
    }
    if (args.upload) {
      const storage = createStorage(config.bucket, logger)
      if (storage) console.log(`  diagrams: ${await uploadCrops(storage, dirs.diagrams)} crop(s) uploaded to the app bucket`)
      else console.log('  diagrams: BUCKET_* not set; crops stay in the corpus directory (upload later with pnpm corpus:diagrams)')
    }
  } finally {
    await handle.close()
  }
}

main().catch((err: unknown) => {
  console.error('corpus:extract failed:', err instanceof Error ? err.message : err)
  process.exit(1)
})
