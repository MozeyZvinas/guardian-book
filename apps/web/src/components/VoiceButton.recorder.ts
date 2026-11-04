/**
 * Hold-to-talk capture (brief B13 §2). Meta's file endpoint takes one container only, a
 * RIFF/WAVE file of mono 16-bit PCM at 16 kHz or 24 kHz (Meta, "Voice schemas", read
 * 4 Nov 2026), and the brief allows no new dependency, so the browser records raw samples
 * through the Web Audio API and writes the WAV itself: 60 s at 16 kHz is about 1.9 MB.
 *
 * Nothing here persists audio. Samples live in memory until `stop()` hands back one Blob
 * for the upload, and `cancel()` drops them. `MediaRecorder` is not used: it yields
 * webm/opus or mp4/aac, which the endpoint refuses and the server will not decode.
 */

export const RECORD_SAMPLE_RATE = 16_000
export const MAX_RECORD_SECONDS = 60

export interface Recording {
  /** Ends the capture and returns the WAV clip (mono 16-bit PCM, 16 kHz). */
  stop(): Promise<Blob>
  /** Ends the capture and drops the samples. */
  cancel(): void
  readonly startedAt: number
}

export function voiceSupported(): boolean {
  return typeof navigator !== 'undefined' && Boolean(navigator.mediaDevices?.getUserMedia) && typeof AudioContext !== 'undefined'
}

/** Averages input samples into each output sample: good enough for speech, no dependency. */
export function downsample(input: Float32Array, inputRate: number, outputRate: number): Float32Array {
  if (inputRate === outputRate) return input
  const ratio = inputRate / outputRate
  const length = Math.floor(input.length / ratio)
  const output = new Float32Array(length)
  for (let i = 0; i < length; i += 1) {
    const start = Math.floor(i * ratio)
    const end = Math.min(input.length, Math.floor((i + 1) * ratio))
    let sum = 0
    let count = 0
    for (let j = start; j < end; j += 1) {
      sum += input[j] ?? 0
      count += 1
    }
    output[i] = count > 0 ? sum / count : 0
  }
  return output
}

/** A 44-byte PCM WAV header plus 16-bit little-endian samples, mono. */
export function encodeWav(samples: Float32Array, sampleRate: number): Blob {
  const buffer = new ArrayBuffer(44 + samples.length * 2)
  const view = new DataView(buffer)
  const write = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i += 1) view.setUint8(offset + i, text.charCodeAt(i))
  }
  write(0, 'RIFF')
  view.setUint32(4, 36 + samples.length * 2, true)
  write(8, 'WAVE')
  write(12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true) // PCM
  view.setUint16(22, 1, true) // mono
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * 2, true)
  view.setUint16(32, 2, true)
  view.setUint16(34, 16, true)
  write(36, 'data')
  view.setUint32(40, samples.length * 2, true)
  let offset = 44
  for (let i = 0; i < samples.length; i += 1) {
    const s = Math.max(-1, Math.min(1, samples[i] ?? 0))
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true)
    offset += 2
  }
  return new Blob([buffer], { type: 'audio/wav' })
}

function merge(chunks: Float32Array[]): Float32Array {
  const length = chunks.reduce((acc, chunk) => acc + chunk.length, 0)
  const out = new Float32Array(length)
  let offset = 0
  for (const chunk of chunks) {
    out.set(chunk, offset)
    offset += chunk.length
  }
  return out
}

/**
 * Asks for the microphone and starts capturing. Call inside a user gesture (the hold), so
 * iOS lets the AudioContext start. `onLevel` gets a rough loudness (0–1) per buffer for
 * the "listening" indicator.
 */
export async function startRecording(onLevel?: (level: number) => void): Promise<Recording> {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true } })
  const context = new AudioContext()
  await context.resume()
  const source = context.createMediaStreamSource(stream)
  // ScriptProcessorNode is deprecated but runs everywhere this app does (iOS Safari
  // included) and needs no worklet file, which the CSP (`script-src 'self'`) would have to allow.
  const processor = context.createScriptProcessor(4096, 1, 1)
  const silence = context.createGain()
  silence.gain.value = 0 // the processor must reach the destination to run; nothing is played back
  const chunks: Float32Array[] = []
  let live = true
  processor.onaudioprocess = (event) => {
    if (!live) return
    const data = event.inputBuffer.getChannelData(0)
    chunks.push(new Float32Array(data))
    if (onLevel) {
      let sum = 0
      for (let i = 0; i < data.length; i += 1) sum += (data[i] ?? 0) ** 2
      onLevel(Math.min(1, Math.sqrt(sum / data.length) * 4))
    }
  }
  source.connect(processor)
  processor.connect(silence)
  silence.connect(context.destination)
  const startedAt = Date.now()

  const teardown = () => {
    live = false
    processor.onaudioprocess = null
    try {
      source.disconnect()
      processor.disconnect()
      silence.disconnect()
    } catch {
      // already disconnected
    }
    for (const track of stream.getTracks()) track.stop()
    void context.close()
  }

  return {
    startedAt,
    async stop() {
      teardown()
      const samples = downsample(merge(chunks), context.sampleRate, RECORD_SAMPLE_RATE)
      chunks.length = 0
      return encodeWav(samples, RECORD_SAMPLE_RATE)
    },
    cancel() {
      teardown()
      chunks.length = 0
    },
  }
}
