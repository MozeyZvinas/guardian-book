import { describe, expect, it } from 'vitest'
import { REDACTED_KEYS, createLogger, redact } from './logger.js'

describe('redact', () => {
  it('drops answerText, email, password and image keys at any depth', () => {
    expect(REDACTED_KEYS).toEqual(['answerText', 'email', 'password', 'image'])
    const input = {
      requestId: 'abc',
      answerText: 'x = 4',
      email: 'someone@example.com',
      password: 'hunter2',
      image: 'data:image/png;base64,AAAA',
      nested: { email: 'deep@example.com', keep: 1, deeper: [{ image: Buffer.from('png') }, { ok: true }] },
      list: [{ password: 'p' }, 'plain'],
    }
    expect(redact(input)).toEqual({
      requestId: 'abc',
      nested: { keep: 1, deeper: [{}, { ok: true }] },
      list: [{}, 'plain'],
    })
  })

  it('matches keys case-insensitively', () => {
    expect(redact({ Email: 'a', ANSWERTEXT: 'b', Image: 'c', PassWord: 'd', other: 'e' })).toEqual({ other: 'e' })
  })

  it('never emits raw bytes', () => {
    expect(redact({ photo: new Uint8Array(3) })).toEqual({ photo: '[bytes:3]' })
  })

  it('survives circular structures and serialises errors', () => {
    const loop: Record<string, unknown> = { name: 'loop' }
    loop['self'] = loop
    expect(redact(loop)).toEqual({ name: 'loop', self: '[circular]' })

    const err = new Error('boom')
    const out = redact({ err }) as { err: { name: string; message: string; stack?: string } }
    expect(out.err.name).toBe('Error')
    expect(out.err.message).toBe('boom')
  })

  it('leaves primitives alone', () => {
    expect(redact('text')).toBe('text')
    expect(redact(42)).toBe(42)
    expect(redact(null)).toBeNull()
  })
})

describe('createLogger', () => {
  it('writes one JSON line per call with redacted fields', () => {
    const lines: string[] = []
    const log = createLogger((line) => lines.push(line))

    log.info('request', { requestId: 'r1', email: 'x@example.com', status: 200 })

    expect(lines).toHaveLength(1)
    const entry = JSON.parse(lines[0] ?? '{}') as Record<string, unknown>
    expect(entry['level']).toBe('info')
    expect(entry['msg']).toBe('request')
    expect(entry['requestId']).toBe('r1')
    expect(entry['status']).toBe(200)
    expect(entry).not.toHaveProperty('email')
    expect(typeof entry['time']).toBe('string')
  })

  it('does not let fields override level or msg', () => {
    const lines: string[] = []
    const log = createLogger((line) => lines.push(line))
    log.warn('real', { level: 'info', msg: 'fake' })
    const entry = JSON.parse(lines[0] ?? '{}') as Record<string, unknown>
    expect(entry['level']).toBe('warn')
    expect(entry['msg']).toBe('real')
  })
})
