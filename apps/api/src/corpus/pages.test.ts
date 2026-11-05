import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { RASTER_DPI, listPages, pdftoppmAvailable, rasterise, savePdf, type Spawner } from './pages.js'

let dir: string | null = null
afterEach(() => {
  if (dir) rmSync(dir, { recursive: true, force: true })
  dir = null
})

describe('rasterising', () => {
  it('lists page images in page order, whatever the padding', () => {
    dir = mkdtempSync(path.join(os.tmpdir(), 'b17a-pages-'))
    for (const name of ['page-10.png', 'page-2.png', 'page-01.png', 'cover.png', 'page-3.jpg']) writeFileSync(path.join(dir, name), '')
    expect(listPages(dir).map((file) => path.basename(file))).toEqual(['page-01.png', 'page-2.png', 'page-10.png'])
    expect(listPages(path.join(dir, 'missing'))).toEqual([])
  })

  it('calls pdftoppm once at the set resolution and leaves a rasterised PDF alone', async () => {
    dir = mkdtempSync(path.join(os.tmpdir(), 'b17a-pages-'))
    const calls: string[][] = []
    const spawner: Spawner = async (command, args) => {
      calls.push([command, ...args])
      const prefix = args.at(-1) ?? ''
      writeFileSync(`${prefix}-1.png`, '')
      writeFileSync(`${prefix}-2.png`, '')
      return { code: 0, stderr: '' }
    }
    const out = path.join(dir, 'pages')
    const pdf = path.join(dir, 'raw', 'paper.pdf')
    savePdf(Buffer.from('%PDF-synthetic'), pdf)
    expect(existsSync(pdf)).toBe(true)
    expect((await rasterise(pdf, out, spawner)).map((file) => path.basename(file))).toEqual(['page-1.png', 'page-2.png'])
    expect(calls[0]?.slice(0, 4)).toEqual(['pdftoppm', '-r', String(RASTER_DPI), '-png'])
    await rasterise(pdf, out, spawner)
    expect(calls).toHaveLength(1)
  })

  it('says when pdftoppm fails or is missing', async () => {
    dir = mkdtempSync(path.join(os.tmpdir(), 'b17a-pages-'))
    const failing: Spawner = async () => ({ code: 1, stderr: 'Syntax Error' })
    await expect(rasterise(path.join(dir, 'x.pdf'), path.join(dir, 'out'), failing)).rejects.toThrow(/pdftoppm failed \(1\): Syntax Error/)
    expect(await pdftoppmAvailable(async () => Promise.reject(new Error('ENOENT')))).toBe(false)
    expect(await pdftoppmAvailable(async () => ({ code: 0, stderr: '' }))).toBe(true)
  })
})
