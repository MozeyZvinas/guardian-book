import { z } from 'zod'

/**
 * The parent's home language (brief B12; D38). A guardian reads This week and Notes in
 * one of six languages. Only text that was already safe for the parent in English is
 * translated (the guardian view of the issued Help Plan, sent notes, guardian-audience
 * feedback, the intervention sentence); never the learner's work, and never anything
 * unreleased. Every translation is model text, verified, cached, and labelled as such.
 */

export const GUARDIAN_LANGUAGES = ['en', 'af', 'zu', 'xh', 'tn', 'st'] as const
export const languageSchema = z.enum(GUARDIAN_LANGUAGES)
export type Language = z.infer<typeof languageSchema>

export const DEFAULT_LANGUAGE: Language = 'en'

/** The language's own name, as the picker shows it. */
export const LANGUAGE_NAMES: Record<Language, string> = {
  en: 'English',
  af: 'Afrikaans',
  zu: 'isiZulu',
  xh: 'isiXhosa',
  tn: 'Setswana',
  st: 'Sesotho',
}

/** The quiet label under every translated text (spec: brief B12 §4). Teacher-reviewed labels stay as they are. */
export const TRANSLATED_BY_AI_LABEL = 'Translated by AI from the teacher-reviewed English'
export const TRANSLATION_PENDING_LABEL = 'Translation on its way'

export const TRANSLATION_STATUSES = ['ready', 'pending', 'unavailable'] as const
export const translationStatusSchema = z.enum(TRANSLATION_STATUSES)
export type TranslationStatus = z.infer<typeof translationStatusSchema>

/**
 * What the guardian screens receive beside each English text. `ready` carries the
 * translation; `pending` means it is being written in the background (the English stands,
 * with "Translation on its way"); `unavailable` means the model could not do it after
 * three verified calls, or the gateway is off (the English stands, nothing else is said).
 */
export const translationViewSchema = z.object({
  language: languageSchema,
  status: translationStatusSchema,
  text: z.string().nullable(),
})
export type TranslationView = z.infer<typeof translationViewSchema>

export const setLanguageBodySchema = z.object({ language: languageSchema }).strict()
export type SetLanguageBody = z.infer<typeof setLanguageBodySchema>

export const languageResponseSchema = z.object({ language: languageSchema })
export type LanguageResponse = z.infer<typeof languageResponseSchema>

// ── share to WhatsApp (P1-e) ───────────────────────────────────────────────────────────────

/**
 * The share text: the learner's nickname and the message exactly as This week or Notes
 * shows it, in the parent's chosen language. Nothing else: no link to a private page, no
 * attempt or answer text (the message never carried one).
 */
export function shareText(nickname: string, message: string): string {
  return `${nickname.trim()}: ${message.trim()}`
}

/** `https://wa.me/?text=` with the message; WhatsApp opens with it ready to send. */
export function whatsappShareUrl(text: string): string {
  return `https://wa.me/?text=${encodeURIComponent(text)}`
}
