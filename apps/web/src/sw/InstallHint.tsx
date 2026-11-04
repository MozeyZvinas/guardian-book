import { useEffect, useState } from 'react'
import { Button } from '../components/Form'
import { dismissInstallHint, installHintState, promptInstall, subscribeInstallable, type InstallHintKind } from './installPrompt'

/**
 * The "install as an app" hint on Today (brief B09 §3; spec 06 §5): an Install button
 * where the browser offers a prompt (Android Chrome), an Add to Home Screen tip on iOS
 * Safari, nothing when already installed, dismissed, or on a first visit. Never a modal.
 */
export function InstallHint() {
  const [kind, setKind] = useState<InstallHintKind | null>(() => installHintState())

  useEffect(() => subscribeInstallable(() => setKind(installHintState())), [])

  if (!kind) return null

  return (
    <aside aria-label="Install Guardian Book" className="flex flex-col gap-2 rounded-card border border-dashed border-fg-muted/40 p-4 text-sm">
      <p className="m-0 font-medium">Keep Guardian Book on your home screen</p>
      {kind === 'android' ? (
        <>
          <p className="m-0 text-fg-muted">It opens full-screen, like an app, from the same link.</p>
          <div className="flex flex-wrap gap-2 pt-1">
            <Button type="button" onClick={() => void promptInstall()}>
              Install
            </Button>
            <Button type="button" variant="quiet" onClick={dismissInstallHint}>
              Not now
            </Button>
          </div>
        </>
      ) : (
        <>
          <p className="m-0 text-fg-muted">
            In Safari, tap <span className="font-medium text-fg">Share</span>, then <span className="font-medium text-fg">Add to Home Screen</span>.
          </p>
          <div className="pt-1">
            <Button type="button" variant="quiet" onClick={dismissInstallHint}>
              Got it
            </Button>
          </div>
        </>
      )}
    </aside>
  )
}
