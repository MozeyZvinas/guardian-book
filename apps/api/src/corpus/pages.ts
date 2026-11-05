import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'

/**
 * PDFs to page images with poppler's `pdftoppm` (brief B17 phase A §1). One PNG per page
 * at `RASTER_DPI`, named `page-01.png`, `page-02.png`, … under the paper's own folder in
 * the corpus directory (outside the repo). Idempotent: an already-rasterised PDF is left
 * alone. The spawner is injectable so the unit test never needs poppler.
 */

export const RASTER_DPI = 150

export type Spawner = (command: string, args: string[]) => Promise<{ code: number; stderr: string }>

export const defaultSpawner: Spawner = (command, args) =>
  new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ['ignore', 'ignore', 'pipe'] })
    let stderr = ''
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString()
    })
    child.on('error', reject)
    child.on('close', (code) => resolve({ code: code ?? 1, stderr }))
  })

export async function pdftoppmAvailable(spawner: Spawner = defaultSpawner): Promise<boolean> {
  try {
    const { code } = await spawner('pdftoppm', ['-v'])
    return code === 0
  } catch {
    return false
  }
}

/** Writes `pdf` to disk if needed and rasterises it; returns the page image paths in order. */
export async function rasterise(pdfPath: string, outDir: string, spawner: Spawner = defaultSpawner): Promise<string[]> {
  mkdirSync(outDir, { recursive: true })
  const existing = listPages(outDir)
  if (existing.length > 0) return existing
  const { code, stderr } = await spawner('pdftoppm', ['-r', String(RASTER_DPI), '-png', pdfPath, path.join(outDir, 'page')])
  if (code !== 0) throw new Error(`pdftoppm failed (${code}): ${stderr.trim().slice(0, 200)}`)
  const pages = listPages(outDir)
  if (pages.length === 0) throw new Error(`pdftoppm wrote no pages for ${path.basename(pdfPath)}`)
  return pages
}

/** `page-1.png`, `page-01.png` or `page-001.png` (pdftoppm pads to the page count), in page order. */
export function listPages(dir: string): string[] {
  if (!existsSync(dir)) return []
  return readdirSync(dir)
    .filter((name) => /^page-\d+\.png$/.test(name))
    .sort((a, b) => Number(/\d+/.exec(a)?.[0] ?? 0) - Number(/\d+/.exec(b)?.[0] ?? 0))
    .map((name) => path.join(dir, name))
}

export function savePdf(bytes: Buffer, target: string): void {
  mkdirSync(path.dirname(target), { recursive: true })
  if (!existsSync(target)) writeFileSync(target, bytes)
}
