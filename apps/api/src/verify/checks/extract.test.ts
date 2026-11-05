import type { ExtractEntry, ExtractOutput } from '@guardian-book/shared'
import { describe, expect, it } from 'vitest'
import { runChecks } from '../runChecks.js'
import { extractEntryInvalid, extractMathUnbalanced, extractStepSum } from './extract.js'

/** Synthetic entries only (never DBE text). */
const entry = (over: Partial<ExtractEntry> = {}): ExtractEntry => ({
  number: '1.1',
  kind: 'question',
  continues: false,
  continues_on_next_page: false,
  text_md: 'Solve for $x$: $x^2 - 64 = 0$',
  marks: 2,
  diagram: null,
  topic: 'Quadratic equations',
  skill_tag: 'algebra.factorising',
  steps: [],
  final_answer: null,
  ...over,
})
const page = (entries: ExtractEntry[], page_kind: ExtractOutput['page_kind'] = 'questions'): ExtractOutput => ({ page_kind, entries, notes: '' })
const step = (marks: number, working = '$x = 2$') => ({ criterion: `Answer: ${working}`, working, step_type: 'A' as const, marks, skill_tag: 'algebra.zero_product', notes: null })

describe('extract checks', () => {
  it('passes a clean question page and a clean memo page through every rule', () => {
    const paper = runChecks('extract', page([entry({ number: '1', kind: 'stem', marks: null, text_md: 'Solve for $x$:' }), entry()]), { document: 'paper', onlyNumbers: [] })
    expect(paper.passed).toBe(true)
    const memo = runChecks('extract', page([entry({ text_md: '', steps: [step(1, '$(x-8)(x+8)=0$'), step(1, '$x = 8$ or $x = -8$')], final_answer: '$x = 8$ or $x = -8$' })], 'memo'), {
      document: 'memo',
      onlyNumbers: [],
    })
    expect(memo.passed).toBe(true)
    expect(memo.checks.map((check) => check.code)).toEqual(['SCHEMA_INVALID', 'MATH_UNBALANCED', 'EXTRACT_ENTRY_INVALID', 'EXTRACT_STEP_SUM'])
  })

  it('fails unbalanced maths anywhere in the page, naming the path', () => {
    const outcome = extractMathUnbalanced(page([entry({ text_md: 'Solve $x^2 - 64 = 0' })]))
    expect(outcome.passed).toBe(false)
    expect(outcome.detail).toContain('entries[0].text_md')
    const memo = extractMathUnbalanced(page([entry({ steps: [step(1, '$\\frac{1}{2$')] })], 'memo'))
    expect(memo.detail).toContain('steps[0].working')
  })

  it('wants text and marks on a paper question, steps and a final answer on a memo answer', () => {
    const paper = extractEntryInvalid(page([entry({ text_md: '  ' }), entry({ number: '1.2', marks: null })]), { document: 'paper', onlyNumbers: [] })
    expect(paper.passed).toBe(false)
    expect(paper.detail).toContain('entries[0] (1.1): a question needs its text')
    expect(paper.detail).toContain('entries[1] (1.2): a question carries its bracketed marks')
    const memo = extractEntryInvalid(page([entry({ text_md: '' })], 'memo'), { document: 'memo', onlyNumbers: [] })
    expect(memo.detail).toContain('at least one step')
    expect(memo.detail).toContain('final answer')
  })

  it('allows a continued question without text or marks, but not the same number twice', () => {
    const ok = extractEntryInvalid(page([entry({ continues: true, text_md: '', marks: null })]), { document: 'paper', onlyNumbers: [] })
    expect(ok.passed).toBe(true)
    const cut = extractEntryInvalid(page([entry({ continues_on_next_page: true, marks: null })]), { document: 'paper', onlyNumbers: [] })
    expect(cut.passed).toBe(true)
    const twice = extractEntryInvalid(page([entry(), entry()]), { document: 'paper', onlyNumbers: [] })
    expect(twice.detail).toContain('appears twice')
  })

  it('keeps a targeted re-read to the numbers asked for', () => {
    const outcome = extractEntryInvalid(page([entry({ number: '2.1' })]), { document: 'paper', onlyNumbers: ['1.1'] })
    expect(outcome.passed).toBe(false)
    expect(outcome.detail).toContain('only 1.1 was asked for')
  })

  it('checks that a complete memo answer sums to its marks, and skips partial ones', () => {
    const wrong = extractStepSum(page([entry({ marks: 3, steps: [step(1), step(1)], final_answer: '$x = 2$' })], 'memo'), { document: 'memo', onlyNumbers: [] })
    expect(wrong.passed).toBe(false)
    expect(wrong.detail).toContain('1.1: the steps carry 2 marks but the memo shows (3)')
    const partial = extractStepSum(page([entry({ marks: 3, continues_on_next_page: true, steps: [step(1)] })], 'memo'), { document: 'memo', onlyNumbers: [] })
    expect(partial.passed).toBe(true)
    expect(extractStepSum(page([entry({ marks: 3, steps: [step(1)] })]), { document: 'paper', onlyNumbers: [] }).passed).toBe(true)
  })

  it('refuses a tag outside the taxonomy at the schema', () => {
    const result = runChecks('extract', page([entry({ skill_tag: 'made.up' })]), { document: 'paper', onlyNumbers: [] })
    expect(result.passed).toBe(false)
    expect(result.checks[0]?.code).toBe('SCHEMA_INVALID')
  })
})
