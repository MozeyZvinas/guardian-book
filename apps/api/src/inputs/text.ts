import { findUnsafeText } from '../gateway/promptSafety.js'

/**
 * Typed text that goes into a prompt carries no contact details (D24; CLAUDE.md rule 4).
 * A school notice often prints a phone number or an email; a learner may type one. They
 * are replaced before the prompt is built, so the gateway's guard (which throws) never
 * sees them, and the model never does either.
 */

const EMAIL_G = /[A-Z0-9._%+-]+@[A-Z0-9-]+(?:\.[A-Z0-9-]+)*\.[A-Z]{2,}/gi
const PHONE_G = /(?:\+|\b0)\d(?:[\s().-]*\d){8,}\b/g

export const CONTACT_PLACEHOLDER = '[contact removed]'

export function scrubContacts(text: string): string {
  return text.replace(EMAIL_G, CONTACT_PLACEHOLDER).replace(PHONE_G, CONTACT_PLACEHOLDER)
}

/** True when the scrubbed text still trips the gateway guard (it should never). */
export function stillUnsafe(text: string): boolean {
  return findUnsafeText(text) !== null
}
