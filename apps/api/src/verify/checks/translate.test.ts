import { describe, expect, it } from 'vitest'
import { runChecks } from '../runChecks.js'
import type { TranslateContext } from '../types.js'
import { lengthOutOfRange, notTranslated, numberAdded, placeholderMissing, translationWords, urlAdded } from './translate.js'

const context: TranslateContext = {
  sourceText: '{{T}} is working on factorising with {{L}} this week. Check-in on Thursday {{N1}} November.',
  placeholders: ['{{T}}', '{{L}}', '{{N1}}'],
  language: 'zu',
}
const good = { text: '{{T}} usebenza ne-{{L}} ekuhlukaniseni ngezinto kuleli sonto. Ukuhlola ngoLwesine {{N1}} kuNovemba.' }

describe('PLACEHOLDER_MISSING', () => {
  it('passes when every placeholder is back exactly once', () => {
    expect(placeholderMissing(good, context).passed).toBe(true)
  })
  it('fails on a dropped, repeated or invented placeholder', () => {
    const dropped = placeholderMissing({ text: '{{T}} usebenza ne-{{L}} kuleli sonto.' }, context)
    expect(dropped.passed).toBe(false)
    expect(dropped.detail).toContain('{{N1}} is missing')
    const repeated = placeholderMissing({ text: '{{T}} {{T}} usebenza ne-{{L}} {{N1}}.' }, context)
    expect(repeated.detail).toContain('{{T}} appears 2 times')
    const invented = placeholderMissing({ text: '{{T}} ne-{{L}} {{N1}} {{N2}}.' }, context)
    expect(invented.detail).toContain('{{N2}} is not in the source')
  })
})

describe('LENGTH_OUT_OF_RANGE', () => {
  it('passes within 0.5–2.5× the source and fails outside it', () => {
    expect(lengthOutOfRange(good, context).passed).toBe(true)
    const short = lengthOutOfRange({ text: '{{T}} {{L}} {{N1}}.' }, context)
    expect(short.passed).toBe(false)
    expect(short.detail).toContain('at least 0.5×')
    const long = lengthOutOfRange({ text: `${good.text} ${'Futhi nokunye okuningi. '.repeat(12)}` }, context)
    expect(long.passed).toBe(false)
    expect(long.detail).toContain('at most 2.5×')
  })
})

describe('NUMBER_ADDED', () => {
  it('ignores the digits inside placeholders and fails on any other digit', () => {
    expect(numberAdded(good).passed).toBe(true)
    const added = numberAdded({ text: '{{T}} usebenza ne-{{L}} amaminithi angu-10 {{N1}}.' })
    expect(added.passed).toBe(false)
    expect(added.detail).toContain('10')
  })
})

describe('URL_ADDED', () => {
  it('fails on a link the source did not have', () => {
    expect(urlAdded(good).passed).toBe(true)
    expect(urlAdded({ text: 'Bheka ku-https://example.org {{T}} {{L}} {{N1}}.' }).passed).toBe(false)
    expect(urlAdded({ text: 'Bheka ku-www.example.org {{T}} {{L}} {{N1}}.' }).passed).toBe(false)
    expect(urlAdded({ text: 'Bheka ku-siyavula.co.za {{T}} {{L}} {{N1}}.' }).passed).toBe(false)
  })
})

describe('NOT_TRANSLATED', () => {
  it('counts content words of four or more letters, placeholders excluded', () => {
    expect([...translationWords(context.sourceText)]).toEqual(['working', 'factorising', 'with', 'this', 'week', 'check', 'thursday', 'november'])
  })
  it('passes a translation and fails the English handed back, or a half-translated text', () => {
    expect(notTranslated(good, context).passed).toBe(true)
    const same = notTranslated({ text: context.sourceText }, context)
    expect(same.passed).toBe(false)
    expect(same.detail).toContain('100% of the English words are still there')
    expect(notTranslated({ text: '{{T}} is working on factorising with {{L}} this week. Ukuhlola ngoLwesine {{N1}} kuNovemba.' }, context).passed).toBe(false)
  })
  it('passes when the source has no content words to compare', () => {
    expect(notTranslated({ text: '{{N1}}' }, { sourceText: '{{N1}}', placeholders: ['{{N1}}'], language: 'af' }).passed).toBe(true)
  })
})

describe('runChecks(translate)', () => {
  it('runs SCHEMA_INVALID then the five rules, all retryable', () => {
    const result = runChecks('translate', good, context)
    expect(result.passed).toBe(true)
    expect(result.checks.map((check) => check.code)).toEqual(['SCHEMA_INVALID', 'PLACEHOLDER_MISSING', 'LENGTH_OUT_OF_RANGE', 'NUMBER_ADDED', 'URL_ADDED', 'NOT_TRANSLATED'])
    const bad = runChecks('translate', { text: context.sourceText.replace('{{N1}}', '6') }, context)
    expect(bad.passed).toBe(false)
    expect(bad.abstain).toBe(false)
    expect(bad.failed.map((check) => check.code)).toEqual(['PLACEHOLDER_MISSING', 'NUMBER_ADDED', 'NOT_TRANSLATED'])
    expect(runChecks('translate', { text: 1 }, context).failed.map((check) => check.code)).toEqual(['SCHEMA_INVALID'])
  })
})
