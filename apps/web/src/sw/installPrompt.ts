/**
 * Install-as-an-app state (brief B09 §3; spec 06 §5): Android fires `beforeinstallprompt`
 * early, so `register.ts` captures it at page load and the Today screen's hint reads it
 * from here; iOS Safari has no event, so the hint explains "Add to Home Screen". The hint
 * shows from the second visit, is dismissible, and never on first load.
 */

/** Chrome's event; not in lib.dom. */
export interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

export type InstallHintKind = 'android' | 'ios'

const VISITS_KEY = 'gb:visits'
const DISMISSED_KEY = 'gb:install-hint-dismissed'

let deferred: BeforeInstallPromptEvent | null = null
const listeners = new Set<() => void>()

function notify() {
  for (const listener of listeners) listener()
}

function read(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

function write(key: string, value: string) {
  try {
    localStorage.setItem(key, value)
  } catch {
    // Private mode or storage blocked: the hint simply never shows.
  }
}

/** Once per page load, from `register.ts`. */
export function recordVisit() {
  const visits = Number(read(VISITS_KEY) ?? '0')
  write(VISITS_KEY, String(Number.isFinite(visits) ? visits + 1 : 1))
}

/** Once per page load, from `register.ts`, before the app mounts. */
export function captureInstallPrompt() {
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault()
    deferred = event as BeforeInstallPromptEvent
    notify()
  })
  window.addEventListener('appinstalled', () => {
    deferred = null
    write(DISMISSED_KEY, 'installed')
    notify()
  })
}

export function isStandalone(): boolean {
  const nav = navigator as Navigator & { standalone?: boolean }
  return nav.standalone === true || (typeof matchMedia === 'function' && matchMedia('(display-mode: standalone)').matches)
}

export function isIosSafari(): boolean {
  const ua = navigator.userAgent
  return /iPad|iPhone|iPod/.test(ua) && /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS/.test(ua)
}

/** What the Today hint should show right now, or null for nothing. */
export function installHintState(): InstallHintKind | null {
  if (isStandalone()) return null
  if (read(DISMISSED_KEY)) return null
  if (Number(read(VISITS_KEY) ?? '0') < 2) return null
  if (deferred) return 'android'
  if (isIosSafari()) return 'ios'
  return null
}

export function dismissInstallHint() {
  write(DISMISSED_KEY, 'dismissed')
  notify()
}

export async function promptInstall(): Promise<void> {
  const event = deferred
  if (!event) return
  deferred = null
  await event.prompt()
  await event.userChoice.catch(() => undefined)
  notify()
}

export function subscribeInstallable(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}
