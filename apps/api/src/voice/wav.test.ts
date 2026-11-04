import { describe, expect, it } from 'vitest'
import { HttpError } from '../lib/http.js'
import { assertVoiceClip, encodeWav, parseWav, toneClip } from './wav.js'

const code = (work: () => unknown): string => {
  try {
    work()
  } catch (err) {
    if (err instanceof HttpError) return `${err.status} ${err.code}`
    throw err
  }
  return 'ok'
}

describe('parseWav', () => {
  it('reads a mono 16 kHz clip', () => {
    expect(parseWav(toneClip(2))).toEqual({ sampleRate: 16_000, channels: 1, bitsPerSample: 16, dataBytes: 64_000, durationMs: 2_000 })
  })
  it('is null for anything that is not a RIFF/WAVE PCM file', () => {
    expect(parseWav(Buffer.from('\x1aE\xdf\xa3webm', 'latin1'))).toBeNull() // webm/opus
    expect(parseWav(Buffer.from('ID3mp3'))).toBeNull()
    expect(parseWav(Buffer.alloc(0))).toBeNull()
    const noData = toneClip(1).subarray(0, 36)
    expect(parseWav(noData)).toBeNull()
  })
  it('clamps a streaming data size to the bytes present', () => {
    const clip = toneClip(1)
    clip.writeUInt32LE(0xffffffff, 40)
    expect(parseWav(clip)?.durationMs).toBe(1_000)
  })
  it('skips unknown chunks before fmt and data', () => {
    const clip = toneClip(1)
    const extra = Buffer.alloc(8 + 6)
    extra.write('LIST', 0, 'latin1')
    extra.writeUInt32LE(5, 4) // odd size: padded to 6
    const spliced = Buffer.concat([clip.subarray(0, 12), extra, clip.subarray(12)])
    spliced.writeUInt32LE(spliced.length - 8, 4)
    expect(parseWav(spliced)?.durationMs).toBe(1_000)
  })
})

describe('assertVoiceClip', () => {
  it('accepts 16 kHz and 24 kHz mono 16-bit up to 60 s', () => {
    expect(code(() => assertVoiceClip(toneClip(3)))).toBe('ok')
    expect(code(() => assertVoiceClip(toneClip(3, 24_000)))).toBe('ok')
    expect(code(() => assertVoiceClip(toneClip(60)))).toBe('ok')
  })
  it('refuses other formats, rates, channels and depths', () => {
    expect(code(() => assertVoiceClip(Buffer.from('\x1aE\xdf\xa3webm-opus', 'latin1')))).toBe('415 unsupported_audio')
    expect(code(() => assertVoiceClip(toneClip(2, 44_100)))).toBe('415 unsupported_audio')
    expect(code(() => assertVoiceClip(toneClip(2, 16_000, 2)))).toBe('415 unsupported_audio')
    const eightBit = toneClip(1)
    eightBit.writeUInt16LE(8, 34)
    expect(code(() => assertVoiceClip(eightBit))).toBe('415 unsupported_audio')
    const float = toneClip(1)
    float.writeUInt16LE(3, 20)
    expect(code(() => assertVoiceClip(float))).toBe('415 unsupported_audio')
  })
  it('refuses a clip over 60 s and an empty one', () => {
    expect(code(() => assertVoiceClip(toneClip(60.5)))).toBe('400 audio_too_long')
    expect(code(() => assertVoiceClip(encodeWav(new Int16Array(0), 16_000)))).toBe('400 audio_empty')
    expect(code(() => assertVoiceClip(toneClip(0.05)))).toBe('400 audio_empty')
  })
})
