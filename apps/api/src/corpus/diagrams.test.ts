import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import sharp from 'sharp'
import { afterEach, describe, expect, it } from 'vitest'
import { cropDiagram, cropRect, listCrops } from './diagrams.js'

/** A synthetic blank page; no DBE image is ever used in a test. */
let dir: string | null = null
afterEach(() => {
  if (dir) rmSync(dir, { recursive: true, force: true })
  dir = null
})

describe('diagram crops', () => {
  it('maps a 0–1000 box to pixels with a margin, clamped to the page', () => {
    expect(cropRect({ x0: 100, y0: 200, x1: 500, y1: 400 }, 1000, 2000)).toEqual({ left: 85, top: 370, width: 430, height: 460 })
    expect(cropRect({ x0: 900, y0: 900, x1: 0, y1: 0 }, 1000, 1000)).toEqual({ left: 0, top: 0, width: 915, height: 915 })
    expect(cropRect({ x0: 0, y0: 0, x1: 1000, y1: 1000 }, 100, 100)).toEqual({ left: 0, top: 0, width: 100, height: 100 })
    expect(cropRect({ x0: 500, y0: 500, x1: 500, y1: 500 }, 100, 100)).toBeNull()
  })

  it('cuts the crop from the page image once and lists it by its key', async () => {
    dir = mkdtempSync(path.join(os.tmpdir(), 'b17a-crops-'))
    const page = path.join(dir, 'page.png')
    writeFileSync(page, await sharp({ create: { width: 400, height: 600, channels: 3, background: '#ffffff' } }).png().toBuffer())
    const diagrams = path.join(dir, 'diagrams')
    const target = path.join(diagrams, 'library/dbe/mathematics/12/2024/november/p1/q2.png')
    expect(await cropDiagram(page, { x0: 250, y0: 250, x1: 750, y1: 500 }, target)).toBe(true)
    const meta = await sharp(readFileSync(target)).metadata()
    expect([meta.width, meta.height]).toEqual([212, 168])
    expect(await cropDiagram(page, { x0: 0, y0: 0, x1: 1, y1: 1 }, target)).toBe(true)
    mkdirSync(path.join(diagrams, 'notes'), { recursive: true })
    writeFileSync(path.join(diagrams, 'notes', 'read.txt'), 'x')
    expect(listCrops(diagrams).map((crop) => crop.key)).toEqual(['library/dbe/mathematics/12/2024/november/p1/q2.png'])
    expect(await cropDiagram(page, { x0: 10, y0: 10, x1: 11, y1: 11 }, path.join(diagrams, 'tiny.png'))).toBe(false)
  })
})
