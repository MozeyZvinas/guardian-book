import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import sharp from 'sharp'
import type { ExtractBox } from '@guardian-book/shared'
import type { Storage } from '../storage/index.js'

/**
 * Diagram crops (brief B17 phase A §2): the box the model gave on a 0–1000 grid, cut from
 * the page image with a small margin, saved as PNG under `<CORPUS_DIR>/diagrams/<key>`
 * and, when the app's private bucket is configured, put there under the same key (the
 * item's `diagram_key`; the library proxies it by item ID, never by URL).
 */

export const CROP_MARGIN = 0.015

/** The pixel rectangle for a 0–1000 box on an image of `width` × `height`, with the margin, clamped. */
export function cropRect(box: ExtractBox, width: number, height: number): { left: number; top: number; width: number; height: number } | null {
  const x0 = Math.min(box.x0, box.x1) / 1000 - CROP_MARGIN
  const x1 = Math.max(box.x0, box.x1) / 1000 + CROP_MARGIN
  const y0 = Math.min(box.y0, box.y1) / 1000 - CROP_MARGIN
  const y1 = Math.max(box.y0, box.y1) / 1000 + CROP_MARGIN
  const left = Math.max(0, Math.round(x0 * width))
  const top = Math.max(0, Math.round(y0 * height))
  const right = Math.min(width, Math.round(x1 * width))
  const bottom = Math.min(height, Math.round(y1 * height))
  if (right - left < 20 || bottom - top < 20) return null
  return { left, top, width: right - left, height: bottom - top }
}

export async function cropDiagram(pagePng: string, box: ExtractBox, target: string): Promise<boolean> {
  if (existsSync(target)) return true
  const image = sharp(pagePng)
  const { width, height } = await image.metadata()
  if (!width || !height) return false
  const rect = cropRect(box, width, height)
  if (!rect) return false
  mkdirSync(path.dirname(target), { recursive: true })
  const bytes = await image.extract(rect).png({ compressionLevel: 8 }).toBuffer()
  writeFileSync(target, bytes)
  return true
}

/** Every crop under `diagramsDir`, keyed as the item's `diagram_key`. */
export function listCrops(diagramsDir: string): Array<{ key: string; file: string }> {
  const out: Array<{ key: string; file: string }> = []
  const walk = (dir: string): void => {
    if (!existsSync(dir)) return
    for (const name of readdirSync(dir)) {
      const file = path.join(dir, name)
      if (statSync(file).isDirectory()) walk(file)
      else if (name.endsWith('.png')) out.push({ key: path.relative(diagramsDir, file).split(path.sep).join('/'), file })
    }
  }
  walk(diagramsDir)
  return out.sort((a, b) => a.key.localeCompare(b.key))
}

/** Puts every crop into the app's private bucket under its key. Returns how many went up. */
export async function uploadCrops(storage: Storage, diagramsDir: string): Promise<number> {
  let count = 0
  for (const { key, file } of listCrops(diagramsDir)) {
    await storage.putObject(key, readFileSync(file), 'image/png')
    count += 1
  }
  return count
}
