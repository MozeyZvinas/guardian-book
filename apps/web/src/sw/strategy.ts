/**
 * The service worker's fetch policy (brief B09 §3; spec 06 §5), as a pure function so it
 * has a unit test without a worker:
 *
 * - `/api/*` (and `/healthz`) is NEVER served from or written to a cache;
 * - hashed `/assets/*` files are cache-first (their names change with their content);
 * - a navigation is network-first; when the network fails, the offline page;
 * - everything else (fonts, icons, the manifest, cross-origin) goes straight to the network.
 *
 * No API response is cached and no offline claim is made beyond the one offline page.
 */

export type Strategy = 'bypass' | 'asset-cache-first' | 'page-network-first'

export interface FetchLike {
  url: string
  method: string
  /** `Request.mode`; `navigate` for a page load. */
  mode: string
  /** `self.location.origin`: only same-origin requests are ever considered. */
  origin: string
}

export const OFFLINE_PATH = '/offline.html'

const NEVER_CACHED_PREFIXES = ['/api', '/healthz', '/e2e-bucket']

export function neverCached(pathname: string): boolean {
  return NEVER_CACHED_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))
}

export function decide(request: FetchLike): Strategy {
  if (request.method !== 'GET') return 'bypass'
  let url: URL
  try {
    url = new URL(request.url)
  } catch {
    return 'bypass'
  }
  if (url.origin !== request.origin) return 'bypass'
  if (neverCached(url.pathname)) return 'bypass'
  if (url.pathname.startsWith('/assets/')) return 'asset-cache-first'
  if (request.mode === 'navigate') return 'page-network-first'
  return 'bypass'
}

/** Cache names carry the build version so an activate step can drop every older cache. */
export function cacheNames(version: string): { assets: string; shell: string } {
  return { assets: `gb-assets-${version}`, shell: `gb-shell-${version}` }
}

export function isStaleCache(name: string, version: string): boolean {
  const current = cacheNames(version)
  return name.startsWith('gb-') && name !== current.assets && name !== current.shell
}
