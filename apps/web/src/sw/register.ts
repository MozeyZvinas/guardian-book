import { captureInstallPrompt, recordVisit } from './installPrompt'

/**
 * Loaded by `index.html` as its own module (brief B09 §3): registers the service worker
 * after the page has loaded, captures Android's install prompt before the app mounts,
 * and keeps `<meta name="theme-color">` on the ground token in both colour schemes.
 * Nothing here is required for the app to work: a browser without workers ignores it.
 */

recordVisit()
captureInstallPrompt()

function syncThemeColor() {
  const meta = document.querySelector('meta[name="theme-color"]')
  if (!meta) return
  const ground = getComputedStyle(document.documentElement).getPropertyValue('--gb-ground').trim()
  if (ground) meta.setAttribute('content', ground)
}
syncThemeColor()
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', syncThemeColor)

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      // A failed registration leaves a plain web app; nothing to tell the learner.
    })
  })
}
