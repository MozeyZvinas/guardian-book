import { createHash, createHmac, randomInt } from 'node:crypto'
import { CODE_ALPHABET, CODE_LENGTH, normaliseCode } from '@guardian-book/shared'

/**
 * Class and guardian codes (spec 03 §8.1): 8 characters from an unambiguous alphabet,
 * generated with the CSPRNG and stored only as a SHA-256 hash. The code space is small
 * (30^8), so the hash prevents a database read from yielding usable codes; it is not a
 * password hash and does not need to be slow.
 */
export function generateCode(): string {
  let code = ''
  for (let i = 0; i < CODE_LENGTH; i += 1) {
    code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]
  }
  return code
}

export function hashCode(code: string): string {
  return createHash('sha256').update(`gb-code:${normaliseCode(code)}`).digest('hex')
}

/**
 * A deterministic code for seeds: derived from the seed secret and a label, so the demo
 * codes are stable per environment and never appear in the repo.
 */
export function deriveCode(secret: string, label: string): string {
  const digest = createHmac('sha256', secret).update(`gb-seed-code:${label}`).digest()
  let code = ''
  for (let i = 0; i < CODE_LENGTH; i += 1) {
    code += CODE_ALPHABET[(digest[i] ?? 0) % CODE_ALPHABET.length]
  }
  return code
}
