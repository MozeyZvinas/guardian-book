import { MAX_VOICE_SECONDS, VOICE_BITS_PER_SAMPLE, VOICE_SAMPLE_RATES } from '@guardian-book/shared'
import { HttpError } from '../lib/http.js'

/**
 * The one audio container the clip may be (brief B13 §2 as Meta's endpoint constrains it):
 * a RIFF/WAVE file holding mono 16-bit integer PCM at 16 kHz or 24 kHz, at most 60 s.
 * Meta, "Voice schemas" (https://dev.meta.ai/docs/api-reference/voice/schemas), read
 * 4 Nov 2026: "`WAV` is a RIFF/WAVE container holding mono integer PCM at 16 kHz or
 * 24 kHz." The browser encodes exactly that (no server-side decoding, no dependency);
 * anything else is refused here before a byte is sent anywhere.
 */

export interface WavInfo {
  sampleRate: number
  channels: number
  bitsPerSample: number
  /** Bytes of PCM in the data chunk (clamped to what was actually uploaded). */
  dataBytes: number
  durationMs: number
}

export const unsupportedAudio = () =>
  new HttpError(415, 'unsupported_audio', 'That recording is not in a format we can hear. Try again, or type your question.')
export const audioTooLong = () =>
  new HttpError(400, 'audio_too_long', `That recording is over ${MAX_VOICE_SECONDS} seconds. Ask in one shorter go.`)
export const audioTooLarge = () => new HttpError(413, 'audio_too_large', 'That recording is too big. Ask in one shorter go.')
export const audioEmpty = () => new HttpError(400, 'audio_empty', 'We did not hear anything. Hold the button while you speak.')

/** Reads the RIFF/WAVE header. Null when the bytes are not a PCM WAV file at all. */
export function parseWav(bytes: Buffer): WavInfo | null {
  if (bytes.length < 12) return null
  if (bytes.toString('latin1', 0, 4) !== 'RIFF' || bytes.toString('latin1', 8, 12) !== 'WAVE') return null
  let offset = 12
  let format: { audioFormat: number; channels: number; sampleRate: number; bitsPerSample: number } | null = null
  while (offset + 8 <= bytes.length) {
    const id = bytes.toString('latin1', offset, offset + 4)
    const size = bytes.readUInt32LE(offset + 4)
    const start = offset + 8
    if (id === 'fmt ') {
      if (start + 16 > bytes.length) return null
      format = {
        audioFormat: bytes.readUInt16LE(start),
        channels: bytes.readUInt16LE(start + 2),
        sampleRate: bytes.readUInt32LE(start + 4),
        bitsPerSample: bytes.readUInt16LE(start + 14),
      }
    } else if (id === 'data') {
      if (!format) return null
      // A streaming encoder may write 0 or 0xFFFFFFFF here: trust the bytes we have.
      const available = bytes.length - start
      const dataBytes = size === 0 || size > available ? available : size
      if (format.audioFormat !== 1) return null // PCM only
      const bytesPerSecond = format.sampleRate * format.channels * (format.bitsPerSample / 8)
      const durationMs = bytesPerSecond > 0 ? Math.round((dataBytes / bytesPerSecond) * 1000) : 0
      return { sampleRate: format.sampleRate, channels: format.channels, bitsPerSample: format.bitsPerSample, dataBytes, durationMs }
    }
    // Chunks are word-aligned.
    offset = start + size + (size % 2)
  }
  return null
}

/** The clip the gateway may send: mono, 16-bit, 16 or 24 kHz, 100 ms to 60 s. Throws an `HttpError` otherwise. */
export function assertVoiceClip(bytes: Buffer): WavInfo {
  const info = parseWav(bytes)
  if (!info) throw unsupportedAudio()
  if (info.channels !== 1 || info.bitsPerSample !== VOICE_BITS_PER_SAMPLE || !(VOICE_SAMPLE_RATES as readonly number[]).includes(info.sampleRate)) {
    throw unsupportedAudio()
  }
  if (info.dataBytes === 0 || info.durationMs < 100) throw audioEmpty()
  if (info.durationMs > MAX_VOICE_SECONDS * 1000) throw audioTooLong()
  return info
}

/** Builds a PCM WAV file around raw 16-bit samples: the browser's encoder, mirrored for tests and the live smoke. */
export function encodeWav(samples: Int16Array, sampleRate: number, channels = 1): Buffer {
  const dataBytes = samples.length * 2
  const header = Buffer.alloc(44)
  header.write('RIFF', 0, 'latin1')
  header.writeUInt32LE(36 + dataBytes, 4)
  header.write('WAVE', 8, 'latin1')
  header.write('fmt ', 12, 'latin1')
  header.writeUInt32LE(16, 16)
  header.writeUInt16LE(1, 20) // PCM
  header.writeUInt16LE(channels, 22)
  header.writeUInt32LE(sampleRate, 24)
  header.writeUInt32LE(sampleRate * channels * 2, 28)
  header.writeUInt16LE(channels * 2, 32)
  header.writeUInt16LE(16, 34)
  header.write('data', 36, 'latin1')
  header.writeUInt32LE(dataBytes, 40)
  const data = Buffer.alloc(dataBytes)
  for (let i = 0; i < samples.length; i += 1) data.writeInt16LE(samples[i] ?? 0, i * 2)
  return Buffer.concat([header, data])
}

/** A clip of `seconds` of a quiet tone at `sampleRate`, for tests and the live smoke. */
export function toneClip(seconds: number, sampleRate = 16_000, channels = 1): Buffer {
  const samples = new Int16Array(Math.round(seconds * sampleRate) * channels)
  for (let i = 0; i < samples.length; i += 1) samples[i] = Math.round(Math.sin((i / channels / sampleRate) * 2 * Math.PI * 440) * 3000)
  return encodeWav(samples, sampleRate, channels)
}
