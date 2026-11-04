import { describe, expect, it } from 'vitest'
import { scriptIdempotencyKey, scriptObjectKey, uploadScriptFieldsSchema } from './scripts.js'

describe('B11 · teacher script upload (pure parts)', () => {
  it('takes exactly learnerId, itemId and idempotencyKey', () => {
    const ok = uploadScriptFieldsSchema.safeParse({ learnerId: '019a0b02-0000-7000-8000-000000000101', itemId: '019a0b02-0000-7000-8000-00000000f001', idempotencyKey: ' k1 ' })
    expect(ok.success).toBe(true)
    expect(ok.success && ok.data.idempotencyKey).toBe('k1')
    expect(uploadScriptFieldsSchema.safeParse({ learnerId: 'nope', itemId: '019a0b02-0000-7000-8000-00000000f001', idempotencyKey: 'k' }).success).toBe(false)
    expect(uploadScriptFieldsSchema.safeParse({ learnerId: '019a0b02-0000-7000-8000-000000000101', itemId: '019a0b02-0000-7000-8000-00000000f001', idempotencyKey: 'k', mode: 'assisted' }).success).toBe(false)
  })

  it('keys live in the teacher’s namespace and objects under the class, never the learner', () => {
    expect(scriptIdempotencyKey('abc')).toBe('script:abc')
    const key = scriptObjectKey('019a0b02-0000-7000-8000-00000000c001', 'jpg')
    expect(key).toMatch(/^scripts\/019a0b02-0000-7000-8000-00000000c001\/[0-9a-f-]{36}\.jpg$/)
    expect(key).not.toContain('000000000101')
  })
})
