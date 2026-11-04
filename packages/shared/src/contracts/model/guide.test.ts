import { describe, expect, it } from 'vitest'
import { GUIDE_MAX_STEPS, createGuideFieldsSchema, guideOutputSchema, guideViewSchema, normaliseMathDelimiters } from './guide.js'
import { modelJsonSchema } from './index.js'

const step = { goal: 'Write the fractions with the same denominator.', hint: 'Find a number both 4 and 8 divide into.', worked: '$\\frac{1}{4} = \\frac{2}{8}$, so the fractions are $\\frac{2}{8}$ and $\\frac{7}{8}$.' }
const output = {
  question_md: 'Find two rational numbers between $\\frac{1}{4}$ and $\\frac{7}{8}$.',
  subject: 'Mathematics',
  topic: 'Rational numbers',
  steps: [step, { ...step, goal: 'Pick two fractions between them.' }],
  final_answer: '$\\frac{1}{2}$ and $\\frac{3}{4}$',
  confidence: 'high',
}

describe('GuideOutput (B15)', () => {
  it('fits the strict subset and is a plain object at the root', () => {
    const json = modelJsonSchema('guide')
    expect(json.strict).toBe(true)
    expect(json.schema['type']).toBe('object')
    expect(JSON.stringify(json.schema)).not.toContain('$ref')
  })
  it('accepts a sound guide and refuses unknown keys, extra steps and a missing answer', () => {
    expect(guideOutputSchema.safeParse(output).success).toBe(true)
    expect(guideOutputSchema.safeParse({ ...output, marks: 4 }).success).toBe(false)
    expect(guideOutputSchema.safeParse({ ...output, steps: Array.from({ length: GUIDE_MAX_STEPS + 1 }, () => step) }).success).toBe(false)
    expect(guideOutputSchema.safeParse({ ...output, final_answer: undefined }).success).toBe(false)
    expect(guideOutputSchema.safeParse({ ...output, confidence: 'sure' }).success).toBe(false)
  })
})

describe('normaliseMathDelimiters', () => {
  it('turns \\( … \\) into $…$ and \\[ … \\] into $$…$$', () => {
    expect(normaliseMathDelimiters('between \\(\\frac{1}{4}\\) and \\(\\frac{7}{8}\\)')).toBe('between $\\frac{1}{4}$ and $\\frac{7}{8}$')
    expect(normaliseMathDelimiters('Solve \\[ x^2 - 5x + 6 = 0 \\] for x')).toBe('Solve $$x^2 - 5x + 6 = 0$$ for x')
  })
  it('leaves $…$ text and plain text alone', () => {
    expect(normaliseMathDelimiters('Solve $x^2 = 4$.')).toBe('Solve $x^2 = 4$.')
    expect(normaliseMathDelimiters('no maths here')).toBe('no maths here')
    expect(normaliseMathDelimiters('(x - 2)(x - 3)')).toBe('(x - 2)(x - 3)')
  })
})

describe('the guide API contracts', () => {
  it('takes text, an input ID or an edit, always with an idempotency key', () => {
    expect(createGuideFieldsSchema.safeParse({ text: 'x', idempotencyKey: 'k' }).success).toBe(true)
    expect(createGuideFieldsSchema.safeParse({ inputId: '019a0b02-0000-7000-8000-000000000001', idempotencyKey: 'k' }).success).toBe(true)
    expect(createGuideFieldsSchema.safeParse({ text: 'x' }).success).toBe(false)
    expect(createGuideFieldsSchema.safeParse({ text: '', idempotencyKey: 'k' }).success).toBe(false)
    expect(createGuideFieldsSchema.safeParse({ text: 'x', idempotencyKey: 'k', kind: 'work' }).success).toBe(false)
  })
  it('serves steps with a nullable worked line, so an unsure read never carries one', () => {
    const view = {
      id: '019a0b02-0000-7000-8000-000000000001',
      status: 'unsure',
      inputId: '019a0b02-0000-7000-8000-000000000002',
      hasImage: false,
      sourceText: 'x',
      question: { questionMd: 'x', subject: 'Mathematics', topic: 'Algebra' },
      steps: [{ stepNo: 1, goal: 'g', hint: 'h', worked: null }],
      finalAnswer: null,
      confidence: 'low',
      agreement: 'disagree',
      message: 'unsure',
      matchedItemId: null,
      canEdit: true,
      editedFromId: null,
      createdAt: '2026-11-04T00:00:00.000Z',
    }
    expect(guideViewSchema.safeParse(view).success).toBe(true)
    expect(guideViewSchema.safeParse({ ...view, status: 'marked' }).success).toBe(false)
  })
})
