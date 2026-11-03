import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import request from 'supertest'
import type { EvidenceFile } from '@guardian-book/shared'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createApp } from '../app.js'
import { loadConfig } from '../config.js'
import { capturingLogger } from '../gateway/testing.js'

/** A minimal valid results file; `n` drives every denominator so the test can prove the file is the source. */
function evidenceWith(n: number): EvidenceFile {
  const ratio = { n: n - 1, d: n, rate: (n - 1) / n, ci95: [0.5, 0.99] as [number, number] }
  const metric = (key: string) => ({ key, label: key, definition: `${key} ÷ cases`, ratio })
  return {
    schema_version: 1,
    generated_at: '2026-11-03T12:00:00.000Z',
    models: [{ id: 'muse-spark-1.3', tier: 'standard', used_for: 'work check' }],
    prompt_versions: ['work-check-v1'],
    dataset: { label: 'development set, synthetic', mocked: false, held_out: false },
    suites: [
      {
        key: 'work_check',
        label: 'Work check',
        source: 'test',
        n,
        metric: metric('exact_total'),
        metrics: [],
        confidently_wrong: { n: 0, d: n, rate: 0, ci95: [0, 0.3] },
        abstained: null,
        checks_blocked_by_code: {},
        latency_ms: { p50: 1, p95: 2 },
        cost: null,
      },
    ],
    not_yet: [],
    built: { from: '2026-10-26', to: '2026-11-04', steps: [] },
  }
}

describe('GET /api/evidence', () => {
  let dir: string
  let filePath: string
  const { logger, lines } = capturingLogger()
  const app = () => createApp({ config: loadConfig({}), logger, webDistDir: path.join(os.tmpdir(), 'no-dist'), version: 'v', evidenceFilePath: filePath })

  beforeEach(async () => {
    dir = await mkdtemp(path.join(os.tmpdir(), 'gb-evidence-route-'))
    filePath = path.join(dir, 'latest.json')
    lines.length = 0
  })
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  it('answers the empty state when no file is committed, with no error', async () => {
    const res = await request(app()).get('/api/evidence')
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ evidence: null })
    expect(res.headers['cache-control']).toBe('no-store')
    expect(lines.filter((line) => line.includes('evidence'))).toEqual([])
  })

  it('serves exactly the file, and changing the file changes the answer', async () => {
    await writeFile(filePath, JSON.stringify(evidenceWith(12)))
    const twelve = await request(app()).get('/api/evidence')
    expect(twelve.status).toBe(200)
    expect(twelve.body).toEqual({ evidence: evidenceWith(12) })
    expect(twelve.body.evidence.suites[0].n).toBe(12)
    expect(twelve.body.evidence.suites[0].metric.ratio).toMatchObject({ n: 11, d: 12 })

    await writeFile(filePath, JSON.stringify(evidenceWith(31)))
    const thirtyOne = await request(app()).get('/api/evidence')
    expect(thirtyOne.body).toEqual({ evidence: evidenceWith(31) })
  })

  it('publishes nothing from a file that is not JSON or fails the schema, and says so in the log', async () => {
    await writeFile(filePath, '{not json')
    expect((await request(app()).get('/api/evidence')).body).toEqual({ evidence: null })
    expect(lines.join('\n')).toContain('not JSON')

    await writeFile(filePath, JSON.stringify({ ...evidenceWith(3), models: [{ id: 'x', tier: 'contributor', used_for: 'y' }] }))
    expect((await request(app()).get('/api/evidence')).body).toEqual({ evidence: null })
    expect(lines.join('\n')).toContain('failed the schema')
  })

  it('the route and the page hold no numerals of their own: every number is read from the file', async () => {
    const webPublic = path.resolve(import.meta.dirname, '../../../web/src/routes/public')
    const componentsDir = path.join(webPublic, 'evidence')
    const files = [
      path.resolve(import.meta.dirname, 'evidence.ts'),
      path.resolve(import.meta.dirname, '../../../web/src/api/evidence.ts'),
      path.join(webPublic, 'Evidence.tsx'),
      ...(await readdir(componentsDir)).map((name) => path.join(componentsDir, name)),
    ]
    expect(files.length).toBeGreaterThan(3)
    for (const file of files) {
      const prose = (await readFile(file, 'utf8'))
        .replace(/\/\*[\s\S]*?\*\//g, '') // block and JSX comments
        .replace(/^\s*\/\/.*$/gm, '') // line comments
        .replace(/^\s*import[\s\S]*?from\s+'[^']*'\s*$/gm, '') // import paths
        .replace(/className=(?:"[^"]*"|\{[^}]*\})/g, '') // Tailwind scales carry digits
        .replace(/<\/?h[1-6]\b/g, '<h') // heading tags
      const digits = prose.match(/.*\d.*/g) ?? []
      expect(digits, `${path.relative(process.cwd(), file)} holds a number`).toEqual([])
    }
  })
})
