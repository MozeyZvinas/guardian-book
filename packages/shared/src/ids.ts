/**
 * UUID v7 (RFC 9562): a 48-bit millisecond timestamp, the version nibble, 12 random bits,
 * the variant bits and 62 random bits. Time-ordered, so primary keys index well. Pure:
 * takes its randomness and clock as arguments so tests are deterministic.
 */

export type RandomBytes = (length: number) => Uint8Array

function defaultRandom(length: number): Uint8Array {
  return globalThis.crypto.getRandomValues(new Uint8Array(length))
}

const HEX: string[] = Array.from({ length: 256 }, (_, i) => i.toString(16).padStart(2, '0'))

export function uuidv7(now: number = Date.now(), random: RandomBytes = defaultRandom): string {
  const bytes = new Uint8Array(16)
  const ms = Math.max(0, Math.floor(now))
  // 48-bit big-endian timestamp.
  bytes[0] = Math.floor(ms / 2 ** 40) & 0xff
  bytes[1] = Math.floor(ms / 2 ** 32) & 0xff
  bytes[2] = (ms >>> 24) & 0xff
  bytes[3] = (ms >>> 16) & 0xff
  bytes[4] = (ms >>> 8) & 0xff
  bytes[5] = ms & 0xff
  const rand = random(10)
  if (rand.length !== 10) throw new Error('random source must return 10 bytes')
  bytes.set(rand, 6)
  bytes[6] = (0x70 | ((bytes[6] ?? 0) & 0x0f)) & 0xff // version 7
  bytes[8] = (0x80 | ((bytes[8] ?? 0) & 0x3f)) & 0xff // variant 10xx

  let out = ''
  for (let i = 0; i < 16; i += 1) {
    if (i === 4 || i === 6 || i === 8 || i === 10) out += '-'
    out += HEX[bytes[i] ?? 0]
  }
  return out
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_PATTERN.test(value)
}

/** The millisecond timestamp embedded in a UUID v7, or null for any other UUID. */
export function uuidv7Time(id: string): number | null {
  if (!UUID_PATTERN.test(id) || id[14] !== '7') return null
  return Number.parseInt(id.slice(0, 8) + id.slice(9, 13), 16)
}
