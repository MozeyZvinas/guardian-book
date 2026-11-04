import { useState } from 'react'
import { shareText, whatsappShareUrl } from '@guardian-book/shared'

/**
 * Share to WhatsApp (P1-e; brief B12 §5): opens `wa.me` with the message in the parent's
 * chosen language and the learner's nickname, nothing else (no link to a private page, no
 * attempt or answer text). Copy puts the same text on the clipboard for other apps.
 */
export function ShareRow({ nickname, message }: { nickname: string; message: string }) {
  const text = shareText(nickname, message)
  const [copied, setCopied] = useState<'idle' | 'copied' | 'failed'>('idle')

  async function copy() {
    try {
      await navigator.clipboard.writeText(text)
      setCopied('copied')
    } catch {
      setCopied('failed')
    }
  }

  const look = 'inline-flex min-h-11 items-center justify-center rounded-card border border-fg-muted/50 bg-surface px-4 text-sm font-medium text-fg no-underline'
  return (
    <div className="flex flex-wrap items-center gap-2">
      <a href={whatsappShareUrl(text)} target="_blank" rel="noopener noreferrer" className={look}>
        Share to WhatsApp
      </a>
      <button type="button" onClick={() => void copy()} className={look}>
        {copied === 'copied' ? 'Copied' : 'Copy'}
      </button>
      {copied === 'failed' ? (
        <span role="status" className="text-xs text-fg-muted">
          Could not copy here. Press and hold the text instead.
        </span>
      ) : null}
    </div>
  )
}
