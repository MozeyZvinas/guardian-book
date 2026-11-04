import { OFFLINE_PATH, cacheNames, decide, isStaleCache } from './strategy'

/**
 * The service worker (brief B09 §3; spec 06 §5), written by hand and built by Vite as its
 * own entry (`/sw.js`, no hash, no imports). Policy lives in `strategy.ts`:
 * network-first for pages with an offline page as the fallback, cache-first only for
 * hashed `/assets/*`, never anything under `/api/`. `skipWaiting` + `clients.claim` so a
 * new build takes over at once; the cache names carry the build id, and activating
 * deletes every older cache.
 *
 * The DOM lib has no worker globals, so the few members this file uses are declared here
 * rather than pulling in `lib.webworker` (which conflicts with `dom` in one program).
 */

interface ExtendableEventLike extends Event {
  waitUntil(promise: Promise<unknown>): void
}

interface FetchEventLike extends ExtendableEventLike {
  readonly request: Request
  respondWith(response: Response | Promise<Response>): void
}

interface WorkerGlobal extends EventTarget {
  readonly location: Location
  readonly clients: { claim(): Promise<void> }
  skipWaiting(): Promise<void>
}

const worker = self as unknown as WorkerGlobal
const VERSION = __GB_BUILD_ID__
const CACHE = cacheNames(VERSION)

worker.addEventListener('install', (event) => {
  ;(event as ExtendableEventLike).waitUntil(
    (async () => {
      const shell = await caches.open(CACHE.shell)
      await shell.add(new Request(OFFLINE_PATH, { cache: 'reload' }))
      await worker.skipWaiting()
    })(),
  )
})

worker.addEventListener('activate', (event) => {
  ;(event as ExtendableEventLike).waitUntil(
    (async () => {
      const names = await caches.keys()
      await Promise.all(names.filter((name) => isStaleCache(name, VERSION)).map((name) => caches.delete(name)))
      await worker.clients.claim()
    })(),
  )
})

async function assetCacheFirst(request: Request): Promise<Response> {
  const cache = await caches.open(CACHE.assets)
  const hit = await cache.match(request)
  if (hit) return hit
  const response = await fetch(request)
  if (response.ok) await cache.put(request, response.clone())
  return response
}

async function pageNetworkFirst(request: Request): Promise<Response> {
  try {
    return await fetch(request)
  } catch {
    const shell = await caches.open(CACHE.shell)
    const offline = await shell.match(OFFLINE_PATH)
    return offline ?? new Response('You are offline.', { status: 503, headers: { 'content-type': 'text/plain; charset=utf-8' } })
  }
}

worker.addEventListener('fetch', (event) => {
  const fetchEvent = event as FetchEventLike
  const { request } = fetchEvent
  const strategy = decide({ url: request.url, method: request.method, mode: request.mode, origin: worker.location.origin })
  if (strategy === 'asset-cache-first') fetchEvent.respondWith(assetCacheFirst(request))
  else if (strategy === 'page-network-first') fetchEvent.respondWith(pageNetworkFirst(request))
  // 'bypass': the browser fetches as if no worker were installed.
})
