import { describe, expect, it } from 'vitest'
import { FORBIDDEN_PROMPT_KEYS, PromptSafetyError, assertPromptSafe, findUnsafeText } from './promptSafety.js'

describe('assertPromptSafe', () => {
  it('has the forbidden key list from the brief', () => {
    expect(FORBIDDEN_PROMPT_KEYS).toEqual(['name', 'email', 'guardian', 'phone'])
  })

  it('passes an item, a guideline and an answer', () => {
    expect(() =>
      assertPromptSafe({
        item: { slug: 'quad-01', prompt_md: 'Solve $x^2 - 5x + 6 = 0$.', max_marks: 3 },
        guideline: [{ step_id: 'S1', criterion: 'Factorise', marks: 1, notes: null }],
        answer: { kind: 'typed', text: '(x-2)(x-3)=0 so x=2 or x=3. Check: 0.333333333 is not a root.' },
      }),
    ).not.toThrow()
  })

  it('throws on an email address in any string, naming the path and not the value', () => {
    let caught: unknown
    try {
      assertPromptSafe({ answer: { text: 'send it to lerato.m@example.co.za please' } })
    } catch (err) {
      caught = err
    }
    expect(caught).toBeInstanceOf(PromptSafetyError)
    const error = caught as PromptSafetyError
    expect(error.reason).toBe('email')
    expect(error.path).toBe('$.answer.text')
    expect(error.message).not.toContain('example')
  })

  it('throws on phone numbers in local and international forms', () => {
    for (const text of ['call 082 123 4567', 'tel: 0821234567', '+27 82 123 4567', '+27821234567', '(011) 123-4567 x']) {
      expect(() => assertPromptSafe(text), text).toThrow(PromptSafetyError)
    }
  })

  it('does not mistake maths for a phone number', () => {
    for (const text of ['0.123456789', '1234567890 is 1.23 × 10^9', 'x = 0,5', '2^10 = 1024', '100 000 000', '0 1 2 3 4 5 6 7 8 9 10']) {
      expect(() => assertPromptSafe(text), text).not.toThrow()
    }
  })

  it('throws on a forbidden key at any depth, in any casing or word form', () => {
    for (const key of ['name', 'Name', 'email', 'guardian', 'phone', 'learner_name', 'guardianEmail', 'phone_number', 'GUARDIAN_ID']) {
      let caught: unknown
      try {
        assertPromptSafe({ ok: { nested: [{ [key]: 'x' }] } })
      } catch (err) {
        caught = err
      }
      expect(caught, key).toBeInstanceOf(PromptSafetyError)
      expect((caught as PromptSafetyError).reason).toBe('forbidden_key')
    }
  })

  it('allows keys that merely resemble the forbidden words', () => {
    expect(() => assertPromptSafe({ filename: 'x', rename: 'y', emailed: 'z', phonetic: 'w', misconception_tag: null })).not.toThrow()
  })

  it('findUnsafeText returns the reason or null', () => {
    expect(findUnsafeText('nothing here')).toBeNull()
    expect(findUnsafeText('a@b.co')).toBe('email')
    expect(findUnsafeText('+27 11 555 0000')).toBe('phone')
  })
})
