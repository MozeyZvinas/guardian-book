import { describe, expect, it } from 'vitest'
import { GUARDIAN_LANGUAGES, LANGUAGE_NAMES, languageSchema, setLanguageBodySchema, shareText, whatsappShareUrl } from './language.js'

describe('the home language contract (B12)', () => {
  it('names six languages with codes en af zu xh tn st', () => {
    expect(GUARDIAN_LANGUAGES).toEqual(['en', 'af', 'zu', 'xh', 'tn', 'st'])
    expect(Object.values(LANGUAGE_NAMES)).toEqual(['English', 'Afrikaans', 'isiZulu', 'isiXhosa', 'Setswana', 'Sesotho'])
    expect(languageSchema.safeParse('fr').success).toBe(false)
    expect(setLanguageBodySchema.safeParse({ language: 'zu', other: 1 }).success).toBe(false)
  })

  it('share text is the nickname and the message as shown, nothing else; the link is wa.me with the text only', () => {
    const message = 'Vra haar om stap 2 vir jou te verduidelik. Tien minute is genoeg.'
    const text = shareText('Lerato', message)
    expect(text).toBe(`Lerato: ${message}`)
    expect(text).not.toMatch(/https?:|guardian/i)
    const url = whatsappShareUrl(text)
    expect(url.startsWith('https://wa.me/?text=')).toBe(true)
    expect(decodeURIComponent(url.slice('https://wa.me/?text='.length))).toBe(text)
    expect(new URL(url).searchParams.get('text')).toBe(text)
  })
})
