import { itemFileSchema, type ExtractEntry, type ExtractOutput, type ExtractStep, type PaperRef } from '@guardian-book/shared'
import { describe, expect, it } from 'vitest'
import { ancestorNumbers, attributionLine, buildQuestions, countQuestions, diagramKeyFor, loaderProblem, mergeEntries, questionSlug, toItemFile, topicFor, type PageRead } from './merge.js'

/** Synthetic questions only (never DBE text). */
const ref: PaperRef = { subject: 'Mathematics', grade: 12, year: 2024, session: 'november', paper: 1 }

const entry = (over: Partial<ExtractEntry>): ExtractEntry => ({
  number: '1.1',
  kind: 'question',
  continues: false,
  continues_on_next_page: false,
  text_md: '',
  marks: null,
  diagram: null,
  topic: 'Quadratic equations',
  skill_tag: 'algebra.factorising',
  steps: [],
  final_answer: null,
  ...over,
})
const step = (marks: number, working: string, step_type: ExtractStep['step_type'] = 'A'): ExtractStep => ({
  criterion: `Correct: ${working}`,
  working,
  step_type,
  marks,
  skill_tag: 'algebra.factorising',
  notes: null,
})
const read = (page: number, entries: ExtractEntry[], page_kind: ExtractOutput['page_kind'] = 'questions'): PageRead => ({ page, output: { page_kind, entries, notes: '' } })

const paperReads = (): PageRead[] => [
  read(2, [
    entry({ number: '1', kind: 'stem', text_md: '' }),
    entry({ number: '1.1', kind: 'stem', text_md: 'Solve for $x$:' }),
    entry({ number: '1.1.1', text_md: '$x^2 - 49 = 0$', marks: 2 }),
    entry({ number: '1.1.2', text_md: '$x^2 = 5x$', marks: 3, continues_on_next_page: true }),
  ]),
  read(3, [
    entry({ number: '1.1.2', continues: true, text_md: 'Show your working.' }),
    entry({ number: '2', kind: 'stem', text_md: 'The graph of $f$ is sketched.', diagram: { x0: 100, y0: 200, x1: 900, y1: 600 }, skill_tag: 'functions.parabola' }),
    entry({ number: '2.1', text_md: 'Write down the turning point.', marks: 2, skill_tag: 'functions.parabola' }),
  ]),
]
const memoReads = (): PageRead[] => [
  read(
    4,
    [
      entry({ number: '1.1.1', marks: 2, steps: [step(1, '$(x-7)(x+7)=0$', 'M'), step(1, '$x = \\pm 7$')], final_answer: '$x = \\pm 7$' }),
      entry({ number: '1.1.2', marks: 3, steps: [step(1, '$x^2 - 5x = 0$', 'M'), step(1, '$x(x-5)=0$', 'M')], continues_on_next_page: true }),
    ],
    'memo',
  ),
  read(5, [entry({ number: '1.1.2', continues: true, steps: [step(1, '$x = 0$ or $x = 5$')], final_answer: '$x = 0$ or $x = 5$' }), entry({ number: '2.1', marks: 2, steps: [step(1, '$(-3; 6)$')], final_answer: '$(-3; 6)$' })], 'memo'),
]

describe('merging page reads into questions', () => {
  it('joins a continued entry onto the one it continues, in page order', () => {
    const merged = mergeEntries([...paperReads()].reverse())
    const q = merged.find((e) => e.number === '1.1.2')
    expect(q?.text_md).toBe('$x^2 = 5x$\n\nShow your working.')
    expect(q?.marks).toBe(3)
    expect(q?.pages).toEqual([2, 3])
    expect(merged.map((e) => e.number)).toEqual(['1', '1.1', '1.1.1', '1.1.2', '2', '2.1'])
  })

  it('keeps the first read when a number appears again without a continuation', () => {
    const merged = mergeEntries([read(1, [entry({ number: '3.1', text_md: 'first', marks: 2 })]), read(2, [entry({ number: '3.1', text_md: 'second', marks: 9 })])])
    expect(merged).toHaveLength(1)
    expect(merged[0]?.text_md).toBe('first')
  })

  it('composes each question from its stems and lines it up with the memo', () => {
    const questions = buildQuestions(mergeEntries(paperReads()), mergeEntries(memoReads()))
    expect(questions.map((q) => q.number)).toEqual(['1.1.1', '1.1.2', '2.1'])
    const [first, second, third] = questions
    expect(first?.prompt_md).toBe('Solve for $x$:\n\n$x^2 - 49 = 0$')
    expect(first?.reasons).toEqual([])
    expect(second?.steps).toHaveLength(3)
    expect(second?.final_answer).toBe('$x = 0$ or $x = 5$')
    expect(second?.memoPages).toEqual([4, 5])
    expect(third?.diagramOwner).toBe('2')
    expect(third?.diagram?.page).toBe(3)
    expect(third?.reasons).toEqual(['marks_mismatch'])
    expect(third?.details[0]).toContain('the paper gives (2) for 2.1 but the memo steps carry 1')
    expect(ancestorNumbers('2.2.1')).toEqual(['2.2', '2'])
  })

  it('names every reason a question becomes a draft', () => {
    const paper = mergeEntries([
      read(1, [
        entry({ number: '4.1', text_md: 'Simplify $\\frac{1}{2$', marks: 2 }),
        entry({ number: '4.2', text_md: 'Find $k$.', marks: 3 }),
        entry({ number: '4.3', text_md: 'Explain.', marks: null }),
      ]),
    ])
    const memo = mergeEntries([read(2, [entry({ number: '4.1', marks: 2, steps: [step(2, '$\\frac{1}{2}$')], final_answer: '$\\frac{1}{2}$' }), entry({ number: '4.3', steps: [], final_answer: 'because' })], 'memo')])
    const byNumber = new Map(buildQuestions(paper, memo).map((q) => [q.number, q]))
    expect(byNumber.get('4.1')?.reasons).toEqual(['maths_unbalanced'])
    expect(byNumber.get('4.2')?.reasons).toEqual(['memo_missing'])
    expect(byNumber.get('4.3')?.reasons).toEqual(['no_marks', 'memo_steps_missing'])
    const counts = countQuestions([...byNumber.values()])
    expect(counts).toEqual({ questions: 3, memoAligned: 1, approved: 0, draft: 3, byReason: { maths_unbalanced: 1, memo_missing: 1, no_marks: 1, memo_steps_missing: 1 } })
  })
})

describe('loader items', () => {
  it('writes an approved question as a dbe_nsc item the loader accepts, attribution and source kept', () => {
    const [question] = buildQuestions(mergeEntries(paperReads()), mergeEntries(memoReads()))
    if (!question) throw new Error('no question')
    const item = toItemFile(ref, question, { heldOut: false, diagramKey: null })
    expect(itemFileSchema.parse(item)).toEqual(item)
    expect(item).toMatchObject({
      slug: 'nsc-maths-p1-2024-nov-q1-1-1',
      source: 'dbe_nsc',
      provenance: 'licensed_content',
      reviewer: 'pending',
      held_out: false,
      max_marks: 2,
      source_ref: { ...ref, question: '1.1.1' },
      attribution: 'NSC Mathematics P1, November 2024, Q1.1.1 · Department of Basic Education',
    })
    expect(item.guideline_steps.map((s) => [s.step_no, s.step_type, s.marks])).toEqual([
      [1, 'M', 1],
      [2, 'A', 1],
    ])
    expect(item.topic).toBe('Algebra: quadratic equations')
  })

  it('marks a held-out item and refuses to write a draft', () => {
    const questions = buildQuestions(mergeEntries(paperReads()), mergeEntries(memoReads()))
    const held = toItemFile({ ...ref, year: 2026, session: 'may_june' }, questions[1]!, { heldOut: true, diagramKey: diagramKeyFor(ref, '1') })
    expect(held.held_out).toBe(true)
    expect(held.diagram_key).toBe('library/dbe/mathematics/12/2024/november/p1/q1.png')
    expect(() => toItemFile(ref, questions[2]!, { heldOut: false, diagramKey: null })).toThrow(/draft: marks_mismatch/)
    expect(loaderProblem(ref, questions[0]!, { heldOut: false, diagramKey: null })).toBeNull()
  })

  it('names slugs, attribution and topics in a fixed shape', () => {
    expect(questionSlug({ ...ref, session: 'may_june', paper: 2 }, '10.2.3')).toBe('nsc-maths-p2-2024-jun-q10-2-3')
    expect(questionSlug({ ...ref, session: 'feb_march' }, '1')).toBe('nsc-maths-p1-2024-mar-q1')
    expect(attributionLine(ref, '3.2')).toBe('NSC Mathematics P1, November 2024, Q3.2 · Department of Basic Education')
    expect(topicFor('euclid.proof', 'Euclidean geometry')).toBe('Euclidean geometry')
    expect(topicFor('trig.equations', '')).toBe('Trigonometry')
  })
})
