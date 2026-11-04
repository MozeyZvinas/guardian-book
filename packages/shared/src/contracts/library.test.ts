import { describe, expect, it } from 'vitest'
import { itemFileSchema } from './items.js'
import {
  DBE_PAST_PAPERS_URL,
  comesUpSentence,
  comparePapersNewestFirst,
  compareQuestionNumbers,
  createClassPracticeBodySchema,
  paperPath,
  paperTitle,
  pastPapersSentence,
  subjectSlug,
} from './library.js'

const file = {
  slug: 'nsc-maths-p1-2023-nov-q3-2',
  topic: 'Algebra: equations',
  skill_tags: ['algebra.factorising'],
  prompt_md: 'Solve for $x$: $x^2 - 7x + 12 = 0$',
  max_marks: 3,
  author: 'test',
  reviewer: 'pending',
  provenance: 'licensed_content',
  guideline_steps: [{ step_no: 1, step_type: 'A', criterion: '$x = 3$ or $x = 4$', marks: 3, skill_tag: 'algebra.factorising' }],
}

describe('the loader format for a real NSC question (B17; D40)', () => {
  it('accepts dbe_nsc only with a source_ref, an attribution and licensed_content provenance', () => {
    const ref = { subject: 'Mathematics', grade: 12, year: 2023, session: 'november', paper: 1, question: '3.2' }
    const ok = itemFileSchema.safeParse({ ...file, source: 'dbe_nsc', source_ref: ref, attribution: 'NSC Mathematics P1, November 2023, Q3.2 · Department of Basic Education' })
    expect(ok.success).toBe(true)
    expect(ok.success && ok.data.held_out).toBe(false)

    const noRef = itemFileSchema.safeParse({ ...file, source: 'dbe_nsc', attribution: 'x' })
    expect(noRef.success).toBe(false)
    expect(noRef.success ? [] : noRef.error.issues.map((i) => i.path.join('.'))).toContain('source_ref')

    const noAttribution = itemFileSchema.safeParse({ ...file, source: 'dbe_nsc', source_ref: ref })
    expect(noAttribution.success).toBe(false)
    expect(noAttribution.success ? [] : noAttribution.error.issues.map((i) => i.path.join('.'))).toContain('attribution')

    const wrongProvenance = itemFileSchema.safeParse({ ...file, source: 'dbe_nsc', source_ref: ref, attribution: 'x', provenance: 'original_human' })
    expect(wrongProvenance.success).toBe(false)

    const badQuestion = itemFileSchema.safeParse({ ...file, source: 'dbe_nsc', source_ref: { ...ref, question: 'Q3' }, attribution: 'x' })
    expect(badQuestion.success).toBe(false)
  })

  it('keeps original items as they were, and refuses a source_ref on one', () => {
    const original = itemFileSchema.safeParse({ ...file, provenance: 'original_human', source: 'original' })
    expect(original.success).toBe(true)
    expect(original.success && original.data.source_ref).toBeNull()
    const unsourced = itemFileSchema.safeParse({ ...file, provenance: 'original_human' })
    expect(unsourced.success && unsourced.data.source).toBe('original')
    const withRef = itemFileSchema.safeParse({ ...file, provenance: 'original_human', source_ref: { subject: 'Mathematics', grade: 12, year: 2023, session: 'november', paper: 1, question: '1' } })
    expect(withRef.success).toBe(false)
  })
})

describe('paper naming', () => {
  const ref = { subject: 'Mathematics', grade: 12, year: 2023, session: 'november' as const, paper: 1 }
  it('titles and paths a paper, and slugs a subject', () => {
    expect(paperTitle(ref)).toBe('NSC Mathematics P1, November 2023')
    expect(paperPath(ref)).toBe('mathematics/12/2023/november/p1')
    expect(subjectSlug('Physical Sciences')).toBe('physical-sciences')
  })
  it('orders questions by part and papers newest first', () => {
    expect(['2', '1.10', '1.2', '1.1'].sort(compareQuestionNumbers)).toEqual(['1.1', '1.2', '1.10', '2'])
    const papers = [
      { ...ref, year: 2022 },
      { ...ref, session: 'may_june' as const },
      { ...ref, paper: 2 },
      ref,
    ]
    expect(papers.sort(comparePapersNewestFirst).map((p) => `${p.year}-${p.session}-${p.paper}`)).toEqual(['2023-november-1', '2023-november-2', '2023-may_june-1', '2022-november-1'])
  })
  it('never offers a download that is not DBE’s own page', () => {
    expect(DBE_PAST_PAPERS_URL.startsWith('https://www.education.gov.za/')).toBe(true)
  })
})

describe('wording', () => {
  it('says how often a skill comes up', () => {
    expect(comesUpSentence({ papers: 3, ofPapers: 3, paperNo: 1, since: 2022, marks: 6.4 })).toBe('In every Paper 1 since 2022, about 6 marks')
    expect(comesUpSentence({ papers: 2, ofPapers: 4, paperNo: 2, since: 2021, marks: 3 })).toBe('In 2 of 4 Paper 2s since 2021, about 3 marks')
    expect(comesUpSentence({ papers: 1, ofPapers: 1, paperNo: 1, since: 2023, marks: 1 })).toBe('In Paper 1 2023, about 1 mark')
  })
  it('tells the parent about past-paper practice in plain words', () => {
    expect(pastPapersSentence('Lerato', { questions: 3, alone: 2, topics: ['Factorising'] })).toBe('Lerato did 3 past exam questions on factorising; 2 without help.')
    expect(pastPapersSentence('Lerato', { questions: 1, alone: 0, topics: ['Factorising', 'Number patterns'] })).toBe('Lerato did 1 past exam question on factorising and number patterns.')
    expect(pastPapersSentence('Lerato', { questions: 2, alone: 0, topics: [] })).toBe('Lerato did 2 past exam questions.')
  })
  it('accepts a paper or a topic as class practice, with a date', () => {
    expect(createClassPracticeBodySchema.safeParse({ kind: 'topic', skillTag: 'algebra.factorising', dueOn: '2026-11-20' }).success).toBe(true)
    expect(createClassPracticeBodySchema.safeParse({ kind: 'paper', paper: { subject: 'Mathematics', grade: 12, year: 2023, session: 'november', paper: 1 }, dueOn: '2026-11-20' }).success).toBe(true)
    expect(createClassPracticeBodySchema.safeParse({ kind: 'paper', dueOn: '2026-11-20' }).success).toBe(false)
  })
})
