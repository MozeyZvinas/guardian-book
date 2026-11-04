import { describe, expect, it } from 'vitest'
import { stripPlaceholders } from '../verify/checks/translate.js'
import { protectText, restoreText } from './placeholders.js'

const names = { learner: 'Lerato', teacher: 'Ms Dlamini' }

describe('protectText', () => {
  it('replaces the learner, the teacher, numbers, dates and links; nothing personal or numeric remains', () => {
    const source = 'Ms Dlamini is working on factorising with Lerato this week. Check-in on Thursday 6 November 2026-11-06 at 09:30, see https://example.org/help?x=1 and www.siyavula.com.'
    const protectedText = protectText(source, names)
    expect(protectedText.text).toBe('{{T}} is working on factorising with {{L}} this week. Check-in on Thursday {{N1}} November {{D1}} at {{N2}}, see {{U1}} and {{U2}}.')
    expect(protectedText.placeholders).toEqual(['{{T}}', '{{L}}', '{{N1}}', '{{D1}}', '{{N2}}', '{{U1}}', '{{U2}}'])
    expect(stripPlaceholders(protectedText.text)).not.toMatch(/\d/)
    expect(protectedText.text).not.toMatch(/lerato|dlamini/i)
    expect(protectedText.originals).toMatchObject({ '{{L}}': 'Lerato', '{{T}}': 'Ms Dlamini', '{{N1}}': '6', '{{D1}}': '2026-11-06', '{{N2}}': '09:30', '{{U1}}': 'https://example.org/help?x=1', '{{U2}}': 'www.siyavula.com' })
  })

  it('round-trips: restoring the placeholders gives the source back', () => {
    const source = 'Lerato brought 3 pieces of work; ask Lerato to teach you step 2 (ten minutes, 2.5 marks). Ms Dlamini, 2026-11-20.'
    const protectedText = protectText(source, names)
    expect(restoreText(protectedText.text, protectedText)).toBe(source)
    // A second occurrence of a name is its own placeholder, so each appears exactly once.
    expect(protectedText.text).toBe('{{L}} brought {{N1}} pieces of work; ask {{L2}} to teach you step {{N2}} (ten minutes, {{N3}} marks). {{T}}, {{D1}}.')
    expect(new Set(protectedText.placeholders).size).toBe(protectedText.placeholders.length)
    for (const placeholder of protectedText.placeholders) expect(protectedText.text.split(placeholder).length - 1).toBe(1)
  })

  it('matches names as whole words, any case, and survives a reordered translation', () => {
    const protectedText = protectText("LERATO's teacher. Leratoville is a place, not her.", { learner: 'Lerato', teacher: null })
    expect(protectedText.text).toBe("{{L}}'s teacher. Leratoville is a place, not her.")
    expect(restoreText('Teacher ya {{L}}.', protectedText)).toBe('Teacher ya LERATO.')
  })

  it('handles missing names, regex characters in names and a text with nothing to protect', () => {
    expect(protectText('Nothing to hide here.', { learner: null, teacher: null })).toEqual({ text: 'Nothing to hide here.', placeholders: [], originals: {} })
    const tricky = protectText('Ask T. (Jr) about it.', { learner: 'T. (Jr)', teacher: null })
    expect(tricky.text).toBe('Ask {{L}} about it.')
    expect(restoreText(tricky.text, tricky)).toBe('Ask T. (Jr) about it.')
  })

  it('leaves an unknown placeholder as written when restoring (the verifier refuses them before this)', () => {
    const protectedText = protectText('Step 2.', { learner: null, teacher: null })
    expect(restoreText('Stap {{N1}} en {{N9}}.', protectedText)).toBe('Stap 2 en {{N9}}.')
  })
})
