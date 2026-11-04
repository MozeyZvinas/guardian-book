import { describe, expect, it } from 'vitest'
import { HELD_OUT_SESSIONS, catalogueMathsPapers, isHeldOut, newestSession, sessionKey } from './catalogue.js'

/** Synthetic key names only (made-up hashes); the catalogue reads names, never content. */
const key = (folder: string, kind: 'Paper' | 'Memo', no: 1 | 2, language = 'English', hash = 'abc123') =>
  `dbe/raw/nsc/g12/${folder}/Mathematics/${hash}__${kind}_${no}__${language}.pdf`
const objects = (keys: string[]) => keys.map((k) => ({ key: k, size: 1 }))

describe('the maths catalogue', () => {
  it('pairs each English question paper with its memo, newest session first', () => {
    const papers = catalogueMathsPapers(
      objects([
        key('2023_November', 'Paper', 1),
        key('2023_November', 'Memo', 1, 'Afrikaans_English'),
        key('2024_May_June', 'Paper', 2),
        key('2024_May_June', 'Memo', 2),
        key('2024_May_June', 'Paper', 1),
        key('2024_May_June', 'Memo', 1),
        key('2024_November', 'Paper', 1),
        key('2024_November', 'Memo', 1),
      ]),
    )
    expect(papers.map((paper) => paper.id)).toEqual([
      'mathematics/12/2024/november/p1',
      'mathematics/12/2024/may_june/p1',
      'mathematics/12/2024/may_june/p2',
      'mathematics/12/2023/november/p1',
    ])
    expect(papers[3]?.memoKey).toContain('Memo_1')
    expect(papers[0]?.ref).toEqual({ subject: 'Mathematics', grade: 12, year: 2024, session: 'november', paper: 1 })
  })

  it('leaves out unpaired papers, Afrikaans question papers and other subjects', () => {
    const papers = catalogueMathsPapers(
      objects([
        key('2022_November', 'Paper', 1),
        key('2022_November', 'Paper', 2, 'Afrikaans'),
        key('2022_November', 'Memo', 2),
        'dbe/raw/nsc/g12/2022_November/Physical_Sciences/abc__Paper_1__English.pdf',
        'dbe/raw/nsc/g12/2022_November/Physical_Sciences/abc__Memo_1__English.pdf',
        'notes/readme.txt',
      ]),
    )
    expect(papers).toEqual([])
  })

  it('reads Feb/March folders under either spelling', () => {
    const papers = catalogueMathsPapers(objects([key('2021_Feb_March', 'Paper', 1), key('2021_Feb_March', 'Memo', 1), key('2020_February_March', 'Paper', 2), key('2020_February_March', 'Memo', 2)]))
    expect(papers.map((paper) => sessionKey(paper.ref))).toEqual(['2021-feb_march', '2020-feb_march'])
  })

  it('holds out D31’s frozen sessions by name, and names the newest session for phase C', () => {
    expect(HELD_OUT_SESSIONS).toEqual(['2026-may_june', '2025-november'])
    expect(isHeldOut({ year: 2026, session: 'may_june' })).toBe(true)
    expect(isHeldOut({ year: 2025, session: 'november' })).toBe(true)
    expect(isHeldOut({ year: 2025, session: 'may_june' })).toBe(false)
    expect(isHeldOut({ year: 2024, session: 'november' }, ['2024-november'])).toBe(true)
    const papers = catalogueMathsPapers(objects([key('2025_November', 'Paper', 1), key('2025_November', 'Memo', 1), key('2026_May_June', 'Paper', 2), key('2026_May_June', 'Memo', 2)]))
    expect(newestSession(papers)).toBe('2026-may_june')
    expect(newestSession([])).toBeNull()
  })
})
