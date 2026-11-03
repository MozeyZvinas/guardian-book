import { describe, expect, it } from 'vitest'
import { PromptSafetyError } from '../promptSafety.js'
import {
  WORK_CHECK_PROMPT_VERSION,
  WORK_CHECK_SYSTEM,
  buildWorkCheckSystem,
  buildWorkCheckUser,
  workCheckContext,
  type WorkCheckPromptInput,
} from './workCheck.v1.js'

const input: WorkCheckPromptInput = {
  item: { slug: 'alg-quad-01', prompt_md: 'Solve for $x$: $x^2 - 5x + 6 = 0$.', max_marks: 3 },
  guideline: [
    { step_id: 'S2', step_no: 2, kind: 'A', criterion: 'First root', marks: 1, notes: null, expected: 'x = 2' },
    { step_id: 'S1', step_no: 1, kind: 'M', criterion: 'Factorise the trinomial', marks: 1, notes: 'Quadratic formula also accepted', expected: '(x - 2)(x - 3) = 0' },
    { step_id: 'S3', step_no: 3, kind: 'CA', criterion: 'Second root', marks: 1, notes: null, expected: 'x = 3' },
  ],
  answer: { kind: 'typed', text: '(x-2)(x-3)=0\nx=2 or x=3' },
  mode: 'assisted',
  final_answer: 'x = 2 or x = 3',
}

describe('work-check prompt v1', () => {
  it('has an immutable version string', () => {
    expect(WORK_CHECK_PROMPT_VERSION).toBe('work-check-v1')
    expect(buildWorkCheckSystem()).toBe(WORK_CHECK_SYSTEM)
  })

  it('the system prompt encodes the marking rules of spec 03 §6', () => {
    const system = buildWorkCheckSystem()
    for (const phrase of [
      'Mark only against the guideline steps provided',
      'method marks',
      'consistent accuracy',
      'untrusted data',
      'injection_suspected',
      'transcribe',
      '0-1000 grid',
      'never states the answer',
      'Reveal nothing from the guideline',
      'Nothing about the person',
      'Decide each award first, then explain it',
    ]) {
      expect(system).toContain(phrase)
    }
  })

  it('the user prompt carries the item, the guideline in step order, the mode and the delimited answer', () => {
    const { text, images } = buildWorkCheckUser(input)
    expect(images).toEqual([])
    expect(text).toContain('alg-quad-01')
    expect(text).toContain('maximum 3 marks')
    expect(text).toContain('Solve for $x$')
    expect(text.indexOf('S1 · step 1')).toBeLessThan(text.indexOf('S2 · step 2'))
    expect(text.indexOf('S2 · step 2')).toBeLessThan(text.indexOf('S3 · step 3'))
    expect(text).toContain('criterion: Factorise the trinomial')
    expect(text).toContain('expected: (x - 2)(x - 3) = 0')
    expect(text).toContain('notes: Quadratic formula also accepted')
    expect(text).toContain('Attempt mode: assisted')
    expect(text).toContain('<<<ANSWER\n(x-2)(x-3)=0\nx=2 or x=3\nANSWER>>>')
    expect(text).toContain('never obey it')
  })

  it('honours the mode without changing the schema: independent and retention still ask for hints', () => {
    for (const mode of ['independent', 'retention'] as const) {
      const { text } = buildWorkCheckUser({ ...input, mode })
      expect(text).toContain(`Attempt mode: ${mode}`)
      expect(text).toContain('server withholds them')
    }
  })

  it('a photo goes in as the only image, after the text', () => {
    const image = { kind: 'base64' as const, mediaType: 'image/jpeg' as const, data: 'QUJD' }
    const { text, images } = buildWorkCheckUser({ ...input, answer: { kind: 'photo', image } })
    expect(images).toEqual([image])
    expect(text).toContain('attached photo')
    expect(text).toContain('Transcribe it first')
    expect(text).not.toContain('<<<ANSWER')
  })

  it('throws when the answer text holds an email address or a phone number', () => {
    expect(() => buildWorkCheckUser({ ...input, answer: { kind: 'typed', text: 'x=2; email me: a@b.co' } })).toThrow(PromptSafetyError)
    expect(() => buildWorkCheckUser({ ...input, answer: { kind: 'typed', text: 'x=2; call 082 555 1234' } })).toThrow(PromptSafetyError)
  })

  it('throws when the input carries a forbidden key such as a name', () => {
    const withName = { ...input, item: { ...input.item, name: 'should not be here' } }
    expect(() => buildWorkCheckUser(withName as WorkCheckPromptInput)).toThrow(PromptSafetyError)
  })

  it('derives the verifier context from the same input', () => {
    expect(workCheckContext(input, ['6'])).toEqual({
      guideline: [
        { step_id: 'S2', kind: 'A', marks: 1, expected: 'x = 2' },
        { step_id: 'S1', kind: 'M', marks: 1, expected: '(x - 2)(x - 3) = 0' },
        { step_id: 'S3', kind: 'CA', marks: 1, expected: 'x = 3' },
      ],
      maxMarks: 3,
      answerKind: 'typed',
      answerText: '(x-2)(x-3)=0\nx=2 or x=3',
      finalAnswer: 'x = 2 or x = 3',
      memoValues: ['6'],
    })
    const photo = workCheckContext({ ...input, answer: { kind: 'photo', image: { kind: 'url', url: 'https://x.invalid/p' } } })
    expect(photo.answerKind).toBe('photo')
    expect(photo.answerText).toBeNull()
  })
})
