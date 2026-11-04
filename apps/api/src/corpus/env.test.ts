import { mkdtempSync, rmSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { assertOutsideRepo, causeOf, corpusDirs, paperSubjectId, repoRoot } from './env.js'

let dir: string | null = null
afterEach(() => {
  if (dir) rmSync(dir, { recursive: true, force: true })
  dir = null
})

describe('corpus CLI helpers', () => {
  it('keeps one model_runs subject per paper, the same on every run', () => {
    dir = mkdtempSync(path.join(os.tmpdir(), 'b17a-env-'))
    const dirs = corpusDirs(dir)
    const first = paperSubjectId(dirs, 'mathematics/12/2024/november/p1')
    expect(first).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-/)
    expect(paperSubjectId(dirs, 'mathematics/12/2024/november/p1')).toBe(first)
    expect(paperSubjectId(dirs, 'mathematics/12/2024/november/p2')).not.toBe(first)
  })

  it('refuses a corpus directory inside the repo', () => {
    expect(() => assertOutsideRepo(path.join(repoRoot, 'corpus'))).toThrow(/outside the repo/)
    expect(() => assertOutsideRepo(repoRoot)).toThrow(/outside the repo/)
    expect(() => assertOutsideRepo(os.tmpdir())).not.toThrow()
  })

  it('names the cause behind a wrapped driver error, first lines only', () => {
    const inner = Object.assign(new Error('Connection terminated unexpectedly'), { code: 'ECONNRESET' })
    const outer = new Error('Failed query: insert into "model_runs"\nparams: a long list', { cause: inner })
    expect(causeOf(outer)).toBe('Failed query: insert into "model_runs" <- ECONNRESET: Connection terminated unexpectedly')
    expect(causeOf('plain')).toBe('plain')
  })
})
