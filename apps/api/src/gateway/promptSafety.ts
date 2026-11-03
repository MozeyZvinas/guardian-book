/**
 * No personal data in prompts (D24, CLAUDE.md rule 4): prompts carry the item, the
 * guideline and the answer, and nothing about the person. This guard runs inside every
 * prompt builder (on the structured input, keys and strings) and again in the gateway (on
 * the final user text), and it throws rather than filters: a prompt that needs scrubbing
 * is a bug upstream.
 */

export const FORBIDDEN_PROMPT_KEYS: readonly string[] = ['name', 'email', 'guardian', 'phone']

const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9-]+(?:\.[A-Z0-9-]+)*\.[A-Z]{2,}/i
/**
 * A phone number: "+" or a leading 0, then 9 or more digits with optional spaces, dashes
 * or brackets. Dots and commas are not separators, so decimals such as 0.333333333 pass.
 */
const PHONE = /(?:\+|\b0)\d(?:[\s().-]*\d){8,}\b/

export type PromptSafetyReason = 'email' | 'phone' | 'forbidden_key'

export class PromptSafetyError extends Error {
  override readonly name = 'PromptSafetyError'
  constructor(
    readonly reason: PromptSafetyReason,
    readonly path: string,
  ) {
    // The message names the path and the reason only, never the offending value.
    super(`prompt content is not allowed: ${reason} at ${path}`)
  }
}

/** Splits `guardianEmail`, `guardian_email` and `GuardianEmail` into words. */
function keyWords(key: string): string[] {
  return key
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)
    .map((word) => word.toLowerCase())
}

export function findUnsafeText(text: string): PromptSafetyReason | null {
  if (EMAIL.test(text)) return 'email'
  if (PHONE.test(text)) return 'phone'
  return null
}

/**
 * Throws `PromptSafetyError` when any string (at any depth) holds an email address or a
 * phone number, or any object key (at any depth) is, or contains as a word, one of
 * `FORBIDDEN_PROMPT_KEYS`.
 */
export function assertPromptSafe(content: unknown, path = '$'): void {
  if (typeof content === 'string') {
    const reason = findUnsafeText(content)
    if (reason) throw new PromptSafetyError(reason, path)
    return
  }
  if (Array.isArray(content)) {
    content.forEach((item, index) => assertPromptSafe(item, `${path}[${index}]`))
    return
  }
  if (content !== null && typeof content === 'object') {
    for (const [key, value] of Object.entries(content)) {
      const words = keyWords(key)
      if (words.some((word) => FORBIDDEN_PROMPT_KEYS.includes(word))) {
        throw new PromptSafetyError('forbidden_key', `${path}.${key}`)
      }
      assertPromptSafe(value, `${path}.${key}`)
    }
  }
}
