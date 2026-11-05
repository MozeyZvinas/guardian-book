import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { catalogueMathsPapers, type CorpusPaper } from './catalogue.js'
import { assertOutsideRepo, corpusConfig, corpusDirs, type CorpusDirs } from './env.js'
import { rasterise, savePdf } from './pages.js'
import { createCorpusBucket, type CorpusBucket } from './r2.js'

/**
 * Download and rasterise (brief B17 phase A §1): the paper and its memo go to
 * `<CORPUS_DIR>/raw/<paper id>/{paper,memo}.pdf` and their pages to
 * `<CORPUS_DIR>/pages/<paper id>/{paper,memo}/page-NN.png`. Nothing is fetched twice.
 *
 *   pnpm corpus:download                      # every Mathematics Grade 12 paper with a memo
 *   pnpm corpus:download 2026-may_june 2025-november
 */

export interface LocalPaper extends CorpusPaper {
  paperPdf: string
  memoPdf: string
  paperPages: string[]
  memoPages: string[]
}

export async function fetchPaper(bucket: CorpusBucket, dirs: CorpusDirs, paper: CorpusPaper): Promise<LocalPaper> {
  const rawDir = path.join(dirs.raw, paper.id)
  const paperPdf = path.join(rawDir, 'paper.pdf')
  const memoPdf = path.join(rawDir, 'memo.pdf')
  for (const [key, target] of [
    [paper.paperKey, paperPdf],
    [paper.memoKey, memoPdf],
  ] as const) {
    if (existsSync(target)) continue
    const bytes = await bucket.get(key)
    if (!bytes) throw new Error(`missing in the bucket: ${key}`)
    savePdf(bytes, target)
  }
  const paperPages = await rasterise(paperPdf, path.join(dirs.pages, paper.id, 'paper'))
  const memoPages = await rasterise(memoPdf, path.join(dirs.pages, paper.id, 'memo'))
  return { ...paper, paperPdf, memoPdf, paperPages, memoPages }
}

/** The bucket's catalogue, cached at `<CORPUS_DIR>/catalogue-maths.json` so a re-run lists nothing. */
export async function mathsCatalogue(bucket: CorpusBucket, dirs: CorpusDirs, refresh = false): Promise<CorpusPaper[]> {
  const file = path.join(dirs.root, 'catalogue-maths.json')
  if (!refresh && existsSync(file)) return JSON.parse(readFileSync(file, 'utf8')) as CorpusPaper[]
  const papers = catalogueMathsPapers(await bucket.list('dbe/raw/nsc/g12/'))
  writeFileSync(file, `${JSON.stringify(papers, null, 2)}\n`)
  return papers
}

async function main(): Promise<void> {
  const config = corpusConfig()
  const bucket = createCorpusBucket(config.corpus)
  if (!bucket) {
    console.error('corpus:download: DBE_R2_* is not set.')
    process.exit(2)
  }
  const dirs = corpusDirs()
  assertOutsideRepo(dirs.root)
  const wanted = new Set(process.argv.slice(2))
  const papers = (await mathsCatalogue(bucket, dirs)).filter((paper) => wanted.size === 0 || wanted.has(`${paper.ref.year}-${paper.ref.session}`))
  console.log(`corpus:download: ${papers.length} paper(s)`)
  for (const paper of papers) {
    const local = await fetchPaper(bucket, dirs, paper)
    console.log(`  ${paper.id}: paper ${local.paperPages.length} page(s), memo ${local.memoPages.length} page(s)`)
  }
}

if (process.argv[1] && /download\.(ts|js)$/.test(process.argv[1])) {
  main().catch((err: unknown) => {
    console.error('corpus:download failed:', err instanceof Error ? err.message : err)
    process.exit(1)
  })
}
