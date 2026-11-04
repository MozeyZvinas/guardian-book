import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { uuidv7 } from '@guardian-book/shared'
import { loadConfig, type AppConfig } from '../config.js'

/**
 * What every corpus CLI shares: the repo's `.env` (never printed), the config, and the
 * corpus directory OUTSIDE the repo (`CORPUS_DIR`, default `~/guardian-book-corpus`), where
 * every PDF, page image, crop and extracted question lives (D40: none of it enters git).
 */

const here = path.dirname(fileURLToPath(import.meta.url))
export const repoRoot = path.resolve(here, '../../../..')

export function loadDotEnv(): void {
  try {
    process.loadEnvFile(path.join(repoRoot, '.env'))
  } catch {
    // No .env: the environment may already be set.
  }
}

export interface CorpusDirs {
  root: string
  /** The PDFs as downloaded. */
  raw: string
  /** Page images, one folder per PDF. */
  pages: string
  /** The model's reads and the merged questions, one folder per paper. */
  extracted: string
  /** Loader-format items (`pnpm content:load <dir>`). */
  items: string
  /** Questions that failed the checks three times, with their reason; never loaded. */
  drafts: string
  /** Diagram crops, keyed like the item's `diagram_key`. */
  diagrams: string
  /** Evaluation cases for phase C (`EVAL_DIR`). */
  evals: string
}

export function corpusDirs(root = process.env['CORPUS_DIR'] ?? path.join(os.homedir(), 'guardian-book-corpus')): CorpusDirs {
  const dirs: CorpusDirs = {
    root,
    raw: path.join(root, 'raw'),
    pages: path.join(root, 'pages'),
    extracted: path.join(root, 'extracted'),
    items: path.join(root, 'items'),
    drafts: path.join(root, 'drafts'),
    diagrams: path.join(root, 'diagrams'),
    evals: path.join(root, 'evals'),
  }
  for (const dir of Object.values(dirs)) mkdirSync(dir, { recursive: true })
  return dirs
}

/** The config with `.env` loaded; the corpus CLIs refuse to run inside the repo tree. */
export function corpusConfig(): AppConfig {
  loadDotEnv()
  return loadConfig()
}

export function assertOutsideRepo(dir: string): void {
  const resolved = path.resolve(dir)
  if (resolved === repoRoot || resolved.startsWith(`${repoRoot}${path.sep}`)) {
    throw new Error(`the corpus directory must be outside the repo (D40): ${resolved}`)
  }
}

/**
 * The paper's stable `model_runs.subject_id`: made once, kept in `<extracted>/<paper>/subject-id`,
 * the same on every run, so `sum(cost_usd) … group by subject_id` is the cost per paper.
 * (Runs before 5 Nov 2026 used one ID per process; their cost per paper comes from the logs.)
 */
export function paperSubjectId(dirs: CorpusDirs, paperId: string): string {
  const file = path.join(dirs.extracted, paperId, 'subject-id')
  if (existsSync(file)) return readFileSync(file, 'utf8').trim()
  const id = uuidv7()
  mkdirSync(path.dirname(file), { recursive: true })
  writeFileSync(file, `${id}\n`)
  return id
}

/** The underlying error behind a driver's "Failed query" wrapper, in one line. */
export function causeOf(err: unknown): string {
  const parts: string[] = []
  let current: unknown = err
  for (let depth = 0; current && depth < 4; depth += 1) {
    const { message, code } = current as { message?: unknown; code?: unknown }
    if (typeof message === 'string') parts.push(`${typeof code === 'string' ? `${code}: ` : ''}${message.split('\n')[0]?.slice(0, 200) ?? ''}`)
    current = (current as { cause?: unknown }).cause
  }
  return parts.join(' <- ') || String(err)
}
