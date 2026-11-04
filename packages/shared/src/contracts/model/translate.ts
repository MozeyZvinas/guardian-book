import { z } from 'zod'
import { shortText } from './common.js'

/**
 * A translation of one parent-facing text (brief B12; `purpose = translate`). The source
 * reaches the model with every name, number, date and link replaced by a placeholder
 * (`{{L}}`, `{{T}}`, `{{N1}}`…); the verifier demands each placeholder back exactly once,
 * a length within 0.5–2.5× the source, no digit or link introduced, and a text that is
 * not still English. The service restores the placeholders after the checks pass.
 */

export const MAX_TRANSLATION_CHARS = 2000

export const translationOutputSchema = z.strictObject({
  text: shortText(MAX_TRANSLATION_CHARS),
})
export type TranslationOutput = z.infer<typeof translationOutputSchema>
