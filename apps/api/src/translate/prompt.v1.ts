import { LANGUAGE_NAMES, type Language } from '@guardian-book/shared'
import { assertPromptSafe } from '../gateway/promptSafety.js'

/**
 * The translation prompt, version 1 (brief B12 §3; `purpose = translate`). Immutable: a
 * change of wording is `translate-v2` in a new file, because the version is stored on every
 * run and on the translation's provenance.
 *
 * What the prompt carries: the target language and one short parent-facing text whose
 * names, numbers, dates and links are already placeholders (`placeholders.ts`). Nothing
 * about the person (D24): no name, no number, no email. Neither prompt holds a digit, so a
 * test can assert "no digit outside a placeholder" over the recorded prompt.
 */

export const TRANSLATE_PROMPT_VERSION = 'translate-v1' as const
/** Muse Spark reasons before it writes the JSON (B03); a translation's JSON is short. */
export const TRANSLATE_MAX_TOKENS = 2_000
export const TRANSLATE_TIMEOUT_MS = 45_000

export const TRANSLATE_SYSTEM = `You translate short messages written in English for a learner's parent or guardian by the learner's high-school teacher, or by the school's planning assistant that the teacher reviews. Translate into the language named in the input.

Rules:
- Keep the meaning, the tone and the sentences. Use plain, warm, everyday words a parent reads easily, as a teacher in South Africa would write them. Keep about the same length.
- The text holds placeholders: two curly braces around capital letters and sometimes a number, such as {{L}}, {{T}}, {{N...}}, {{D...}} or {{U...}}. Each stands for a name, a number, a date or a link. Copy every placeholder exactly as written, once each, in its natural place in the sentence. Never translate, drop, repeat or invent one.
- Add nothing: no number, no date, no link, no advice, no greeting and no sign-off that is not in the English.
- Leave nothing in English except the placeholders. Where a word has no common translation, use the everyday loanword people use when they speak the language.
- Reply with one JSON object matching the schema you are given: the translation in "text", and nothing else.`

export interface TranslatePromptInput {
  language: Language
  /** The source with placeholders already in place. */
  text: string
}

export function buildTranslateSystem(): string {
  return TRANSLATE_SYSTEM
}

export function buildTranslateUser(input: TranslatePromptInput): string {
  assertPromptSafe(input, 'translate')
  return [`Translate into ${LANGUAGE_NAMES[input.language]} (${input.language}).`, '<<<TEXT', input.text, 'TEXT>>>'].join('\n')
}
