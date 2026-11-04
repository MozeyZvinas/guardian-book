import { describe, expect, it } from 'vitest'
import { PromptSafetyError } from '../gateway/promptSafety.js'
import { stripPlaceholders } from '../verify/checks/translate.js'
import { protectText } from './placeholders.js'
import { TRANSLATE_PROMPT_VERSION, buildTranslateSystem, buildTranslateUser } from './prompt.v1.js'

describe('the translate prompt (translate-v1)', () => {
  it('carries the language and the protected text, and no name or digit outside a placeholder (D24)', () => {
    const source = 'Ms Dlamini is working on factorising with Lerato this week. Check-in on Thursday 6 November. 10 minutes is enough.'
    const protectedText = protectText(source, { learner: 'Lerato', teacher: 'Ms Dlamini' })
    const user = buildTranslateUser({ language: 'zu', text: protectedText.text })
    expect(user).toContain('Translate into isiZulu (zu).')
    expect(user).toContain('<<<TEXT\n{{T}} is working on factorising with {{L}} this week.')
    expect(stripPlaceholders(user)).not.toMatch(/\d/)
    expect(user).not.toMatch(/lerato|dlamini/i)
    const system = buildTranslateSystem()
    expect(system).not.toMatch(/\d/)
    expect(system).toContain('Copy every placeholder exactly as written')
    expect(TRANSLATE_PROMPT_VERSION).toBe('translate-v1')
  })

  it('refuses a text that still holds an email or a phone number', () => {
    expect(() => buildTranslateUser({ language: 'af', text: 'Write to teacher@school.example to confirm.' })).toThrow(PromptSafetyError)
    expect(() => buildTranslateUser({ language: 'af', text: 'Call 082 123 4567 to confirm.' })).toThrow(PromptSafetyError)
  })
})
