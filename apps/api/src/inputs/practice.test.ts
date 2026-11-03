import sharp from 'sharp'
import { describe, expect, it } from 'vitest'
import { attemptStatusOf, hintsVisible, redactHints } from '../assessment/service.js'
import { dedupeEvents } from '../calendar/service.js'
import { decideCaps, sastDay } from '../modelRuns/caps.js'
import { wasACall } from '../modelRuns/record.js'
import { hasExif, prepareImage, sniffMediaType } from '../storage/images.js'
import { memoryStorage, PRESIGN_MAX_SECONDS, virtualHostedOrigin } from '../storage/index.js'
import { mediaTypeOfKey } from './service.js'
import { scrubContacts, stillUnsafe } from './text.js'

describe('spend caps (spec 03 §5)', () => {
  const limits = { userDailyCalls: 2, dailyBudgetUsd: 1 }

  it('refuses a learner at their daily call cap', () => {
    expect(decideCaps({ userCalls: 1, globalCostUsd: 0 }, limits)).toEqual({ ok: true, remainingCalls: 1 })
    expect(decideCaps({ userCalls: 2, globalCostUsd: 0 }, limits)).toEqual({ ok: false, reason: 'user_calls' })
  })

  it('refuses everyone once the global budget is spent', () => {
    expect(decideCaps({ userCalls: 0, globalCostUsd: 0.99 }, limits).ok).toBe(true)
    expect(decideCaps({ userCalls: 0, globalCostUsd: 1 }, limits)).toEqual({ ok: false, reason: 'global_budget' })
  })

  it('counts days in South African time', () => {
    expect(sastDay(new Date('2026-11-03T22:30:00Z'))).toBe('2026-11-04')
    expect(sastDay(new Date('2026-11-03T21:59:00Z'))).toBe('2026-11-03')
  })
})

describe('hint withholding (spec 03 §9.1 attempts.mode)', () => {
  const steps = [
    { stepId: '019a0b02-0000-7000-8000-000000000001', stepNo: 1, skillTag: 'a', awarded: 0, available: 1, confidence: 'high' as const, evidence: 'e', feedback: 'f', misconceptionTag: null, hint: 'try again', box: null },
  ]

  it('serves hints for assisted attempts, and for independent or retention ones only once assessed', () => {
    expect(hintsVisible('assisted', false)).toBe(true)
    expect(hintsVisible('independent', false)).toBe(false)
    expect(hintsVisible('retention', false)).toBe(false)
    expect(hintsVisible('independent', true)).toBe(true)
  })

  it('redacts the hint and nothing else', () => {
    expect(redactHints(steps, false)[0]).toMatchObject({ hint: null, feedback: 'f', awarded: 0 })
    expect(redactHints(steps, true)[0]?.hint).toBe('try again')
  })

  it('derives the attempt status from the assessment row and the in-progress flag', () => {
    expect(attemptStatusOf({ assessingStartedAt: null }, null)).toBe('submitted')
    expect(attemptStatusOf({ assessingStartedAt: new Date() }, null)).toBe('assessing')
    expect(attemptStatusOf({ assessingStartedAt: new Date() }, { status: 'uncertain' })).toBe('uncertain')
  })
})

describe('uploads', () => {
  it('reads the media type from the bytes, not the header', () => {
    expect(sniffMediaType(Buffer.from([0xff, 0xd8, 0xff, 0xe0]))).toBe('image/jpeg')
    expect(sniffMediaType(Buffer.from('%PDF-1.7 rest'))).toBe('application/pdf')
    expect(sniffMediaType(Buffer.from('RIFF....WEBPVP8 '))).toBe('image/webp')
    expect(sniffMediaType(Buffer.from('<svg onload=alert(1)>'))).toBeNull()
    expect(mediaTypeOfKey('inputs/x/y.jpg')).toBe('image/jpeg')
    expect(mediaTypeOfKey(null)).toBeNull()
  })

  it('re-encodes an image without its EXIF block and within 2,000 px', async () => {
    const withExif = await sharp({ create: { width: 2600, height: 1200, channels: 3, background: { r: 200, g: 20, b: 60 } } })
      .jpeg()
      .withMetadata({ exif: { IFD0: { ImageDescription: 'taken at home', Copyright: 'a learner' } } })
      .toBuffer()
    expect(await hasExif(withExif)).toBe(true)
    const prepared = await prepareImage(withExif, 'image/jpeg')
    expect(prepared.width).toBe(2000)
    expect(prepared.height).toBe(923)
    expect(await hasExif(prepared.buffer)).toBe(false)
    expect(prepared.buffer.toString('latin1')).not.toContain('taken at home')
  })

  it('refuses bytes that are not an image', async () => {
    await expect(prepareImage(Buffer.from('not an image at all'), 'image/jpeg')).rejects.toMatchObject({ code: 'unreadable_image' })
  })

  it('presigns for at most five minutes and points at the virtual-hosted bucket origin', async () => {
    const storage = memoryStorage()
    const url = new URL(await storage.presignGet('inputs/a/b.jpg', 3600))
    expect(Number(url.searchParams.get('X-Amz-Expires'))).toBeLessThanOrEqual(PRESIGN_MAX_SECONDS)
    expect(url.searchParams.get('X-Amz-Signature')).toBeTruthy()
    expect(virtualHostedOrigin('https://storage.railway.app', 'gb-media')).toBe('https://gb-media.storage.railway.app')
  })
})

describe('prompts carry no contact details', () => {
  it('scrubs emails and phone numbers from typed notices', () => {
    const notice = 'Maths P1 on 2026-11-20. Queries: office@school.example or 011 555 1234 56 or +27 82 123 4567.'
    const scrubbed = scrubContacts(notice)
    expect(scrubbed).not.toContain('@')
    expect(scrubbed).not.toContain('123 4567')
    expect(scrubbed).toContain('Maths P1 on 2026-11-20')
    expect(stillUnsafe(scrubbed)).toBe(false)
  })

  it('leaves decimals and short numbers alone', () => {
    expect(scrubContacts('x = 0.333333333 and 12 marks')).toBe('x = 0.333333333 and 12 marks')
  })
})

describe('model runs', () => {
  it('writes no row for a call that was never sent', () => {
    const base = { attemptNo: 1, output: null, checks: [], usage: null, costUsd: 0, latencyMs: 0, requestId: null, model: null }
    expect(wasACall({ ...base, status: 'failed', error: { code: 'not_configured', message: '' } })).toBe(false)
    expect(wasACall({ ...base, status: 'failed', error: { code: 'timeout', message: '' } })).toBe(true)
    expect(wasACall({ ...base, status: 'accepted', error: null })).toBe(true)
  })
})

describe('notice events', () => {
  it('merges duplicates by date and normalised title', () => {
    const event = { subject: null, paper: null, source_line: 'l', confidence: 'high' as const }
    const out = dedupeEvents([
      { ...event, title: 'Maths Paper 1', on_date: '2026-11-20' },
      { ...event, title: 'maths  paper 1', on_date: '2026-11-20' },
      { ...event, title: 'Maths Paper 1', on_date: '2026-11-21' },
    ])
    expect(out).toHaveLength(2)
  })
})
