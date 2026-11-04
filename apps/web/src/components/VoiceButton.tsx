import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from 'react'
import { ApiRequestError } from '../api/client'
import { transcribeVoice } from './VoiceButton.api'
import { MAX_RECORD_SECONDS, startRecording, voiceSupported, type Recording } from './VoiceButton.recorder'

/**
 * VoiceButton (brief B13 §1–2): hold to talk, release to send. The clip (≤ 60 s) is
 * transcribed by Muse Voice Transcribe through the API and the words are handed back for
 * the learner to read and edit; the audio is never kept. Keyboard: Space or Enter toggles.
 * Pink is the action (A1); the state is always written out, never colour alone (A7).
 */

type Phase = { kind: 'idle' } | { kind: 'listening'; since: number } | { kind: 'writing' } | { kind: 'problem'; message: string }

export function VoiceButton({ onTranscript, disabled = false }: { onTranscript: (text: string) => void; disabled?: boolean }) {
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' })
  const [elapsed, setElapsed] = useState(0)
  const [level, setLevel] = useState(0)
  const recording = useRef<Recording | null>(null)
  const supported = voiceSupported()

  // The clock and the hard stop at 60 s.
  useEffect(() => {
    if (phase.kind !== 'listening') return
    const timer = setInterval(() => {
      const seconds = Math.floor((Date.now() - phase.since) / 1000)
      setElapsed(seconds)
      if (seconds >= MAX_RECORD_SECONDS) void finish()
    }, 250)
    return () => clearInterval(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `finish` reads the ref, not state
  }, [phase])

  // Leaving the screen mid-hold drops the clip.
  useEffect(() => () => recording.current?.cancel(), [])

  async function begin() {
    if (disabled || recording.current || phase.kind === 'writing') return
    try {
      const rec = await startRecording(setLevel)
      recording.current = rec
      setElapsed(0)
      setPhase({ kind: 'listening', since: rec.startedAt })
    } catch (err) {
      const denied = err instanceof Error && (err.name === 'NotAllowedError' || err.name === 'SecurityError')
      setPhase({ kind: 'problem', message: denied ? 'Microphone blocked. Allow it in your browser, or type your question.' : 'No microphone found. Type your question instead.' })
    }
  }

  async function finish() {
    const rec = recording.current
    if (!rec) return
    recording.current = null
    setLevel(0)
    if (Date.now() - rec.startedAt < 300) {
      rec.cancel()
      setPhase({ kind: 'problem', message: 'Hold the button while you speak, then let go.' })
      return
    }
    setPhase({ kind: 'writing' })
    try {
      const clip = await rec.stop()
      const result = await transcribeVoice(clip)
      if (!result.transcript.trim()) {
        setPhase({ kind: 'problem', message: 'We did not catch any words. Try again, closer to the phone.' })
        return
      }
      onTranscript(result.transcript.trim())
      setPhase({ kind: 'idle' })
    } catch (err) {
      setPhase({ kind: 'problem', message: err instanceof ApiRequestError ? err.message : 'We could not hear that. Try again, or type your question.' })
    }
  }

  function onPointerDown(event: PointerEvent<HTMLButtonElement>) {
    if (event.button !== 0 && event.pointerType === 'mouse') return
    event.currentTarget.setPointerCapture(event.pointerId)
    void begin()
  }
  function onPointerUp(event: PointerEvent<HTMLButtonElement>) {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
    void finish()
  }
  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key !== ' ' && event.key !== 'Enter') return
    event.preventDefault()
    if (event.repeat) return
    if (recording.current) void finish()
    else void begin()
  }

  if (!supported) {
    return <p className="m-0 text-sm text-fg-muted">Voice needs a microphone. Type your question instead.</p>
  }

  const listening = phase.kind === 'listening'
  const label = listening ? `Listening… ${elapsed}s. Let go to send.` : phase.kind === 'writing' ? 'Writing it down…' : 'Hold to talk'
  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        aria-pressed={listening}
        aria-label={listening ? 'Listening, let go to send' : 'Hold to talk'}
        disabled={disabled || phase.kind === 'writing'}
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onKeyDown={onKeyDown}
        onContextMenu={(event) => event.preventDefault()}
        style={{ touchAction: 'none', WebkitUserSelect: 'none', userSelect: 'none', WebkitTouchCallout: 'none' } as CSSProperties}
        className={[
          'inline-flex min-h-14 w-full items-center justify-center gap-3 rounded-card px-5 font-medium disabled:opacity-60',
          listening ? 'bg-action text-ground ring-4 ring-action/30' : 'border border-fg-muted/50 bg-surface text-fg',
        ].join(' ')}
      >
        <span aria-hidden="true" className="relative inline-flex h-6 w-6 items-center justify-center">
          <span className="text-xl">{listening ? '●' : phase.kind === 'writing' ? '…' : '🎙'}</span>
          {listening ? <span className="absolute inset-0 rounded-full bg-ground/40" style={{ transform: `scale(${1 + level})`, transition: 'transform 120ms' }} /> : null}
        </span>
        <span>{label}</span>
      </button>
      <p className="m-0 text-xs text-fg-muted" aria-live="polite">
        {listening ? `Up to ${MAX_RECORD_SECONDS} seconds. Your words appear below to check before you send.` : phase.kind === 'problem' ? phase.message : 'Say it in your own words. Nothing is recorded; only the words are kept.'}
      </p>
    </div>
  )
}
