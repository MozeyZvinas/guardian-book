import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { ResourceValidationError, readResourceFile } from './loader.js'

/** The vetted list is validated whole: one bad entry, nothing loads. */
const good = { title: 'Factorising, step by step', url: 'https://example.org/factorising', licence: 'CC BY 3.0', attribution: 'From example.org', free: true, skill_tags: ['factorise-trinomial'] }

let dir: string | null = null
afterEach(() => {
  if (dir) rmSync(dir, { recursive: true, force: true })
  dir = null
})

function fileWith(content: unknown): string {
  dir = mkdtempSync(path.join(tmpdir(), 'gb-b06-res-'))
  const file = path.join(dir, 'resources.json')
  writeFileSync(file, JSON.stringify(content))
  return file
}

describe('readResourceFile', () => {
  it('reads a valid list with defaults applied', () => {
    const entries = readResourceFile(fileWith({ resources: [good] }))
    expect(entries).toHaveLength(1)
    expect(entries[0]).toMatchObject({ approved: true, free: true, licence: 'CC BY 3.0' })
  })
  it('refuses http links, missing licences and duplicate urls', () => {
    expect(() => readResourceFile(fileWith({ resources: [{ ...good, url: 'http://example.org/x' }] }))).toThrow(ResourceValidationError)
    expect(() => readResourceFile(fileWith({ resources: [{ ...good, licence: '' }] }))).toThrow(ResourceValidationError)
    let problems: string[] = []
    try {
      readResourceFile(fileWith({ resources: [good, { ...good, title: 'Again' }] }))
    } catch (err) {
      problems = err instanceof ResourceValidationError ? err.problems : []
    }
    expect(problems[0]).toMatch(/duplicate url/)
    expect(() => readResourceFile(fileWith({ resources: [] }))).toThrow(ResourceValidationError)
  })
})
