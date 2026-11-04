import { readFileSync } from 'node:fs'
import path from 'node:path'
import { KNOWN_SKILL_TAGS, type PaperRef } from '@guardian-book/shared'
import { describe, expect, it } from 'vitest'
import { EXTRACT_PROMPT_VERSION, buildExtractSystem, buildExtractUser, extractContext } from './prompt.v2.js'

const ref: PaperRef = { subject: 'Mathematics', grade: 12, year: 2024, session: 'november', paper: 2 }
const image = { kind: 'base64' as const, mediaType: 'image/png' as const, data: 'AAAA' }

describe('the extraction prompt', () => {
  it('offers the model the whole taxonomy and nothing about any person', () => {
    const system = buildExtractSystem()
    for (const tag of KNOWN_SKILL_TAGS) expect(system).toContain(tag)
    expect(system).toContain('Never invent a tick')
    expect(EXTRACT_PROMPT_VERSION).toBe('extract-v2')
  })

  it('names the paper, the document and the page, and carries the image', () => {
    const user = buildExtractUser({ ref, document: 'memo', page: 3, pages: 20, image })
    expect(user.text).toContain('NSC Mathematics P2, November 2024')
    expect(user.text).toContain('marking guideline')
    expect(user.text).toContain('Page 3 of 20')
    expect(user.images).toEqual([image])
    expect(extractContext({ document: 'memo' })).toEqual({ document: 'memo', onlyNumbers: [] })
  })

  it('narrows a targeted re-read to the numbers asked for, with the failures', () => {
    const user = buildExtractUser({ ref, document: 'paper', page: 5, pages: 14, image, onlyNumbers: ['4.2'], failures: ['the memo steps carry 3'] })
    expect(user.text).toContain('Return only the entries numbered 4.2')
    expect(user.text).toContain('- the memo steps carry 3')
    expect(extractContext({ document: 'paper', onlyNumbers: ['4.2'] })).toEqual({ document: 'paper', onlyNumbers: ['4.2'] })
  })

  it('opens the corpus bucket read-only: no put, delete or presign anywhere in the client', () => {
    const source = readFileSync(path.join(import.meta.dirname, 'r2.ts'), 'utf8')
    expect(source).toContain('GetObjectCommand')
    for (const forbidden of ['PutObject', 'DeleteObject', 'CopyObject', 'getSignedUrl', 'presign', 'CreateMultipartUpload']) {
      expect(source.replace(/^\s*(\*|\/\/).*$/gm, '')).not.toContain(forbidden)
    }
  })
})
