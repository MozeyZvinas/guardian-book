import { describe, expect, it } from 'vitest'
import { cacheNames, decide, isStaleCache, neverCached } from './strategy'

const origin = 'https://guardianbook.app'
const get = (path: string, mode = 'cors') => ({ url: `${origin}${path}`, method: 'GET', mode, origin })

describe('service worker fetch policy (B09)', () => {
  it('never serves /api or /healthz from cache, whatever the mode', () => {
    for (const path of ['/api/me', '/api', '/api/attempts/1/image', '/healthz', '/e2e-bucket/key']) {
      expect(decide(get(path))).toBe('bypass')
      expect(decide(get(path, 'navigate'))).toBe('bypass')
      expect(decide(get(path, 'no-cors'))).toBe('bypass')
      expect(neverCached(new URL(`${origin}${path}`).pathname)).toBe(true)
    }
    // A path that merely starts with the letters is not the API.
    expect(neverCached('/apiary')).toBe(false)
  })

  it('is cache-first only for hashed /assets/* files', () => {
    expect(decide(get('/assets/index-a1b2c3.js'))).toBe('asset-cache-first')
    expect(decide(get('/assets/index-a1b2c3.css'))).toBe('asset-cache-first')
    expect(decide(get('/fonts/outfit-latin.woff2'))).toBe('bypass')
    expect(decide(get('/icons/icon-192.png'))).toBe('bypass')
    expect(decide(get('/manifest.webmanifest'))).toBe('bypass')
    expect(decide(get('/sw.js'))).toBe('bypass')
  })

  it('is network-first for page navigations', () => {
    expect(decide(get('/', 'navigate'))).toBe('page-network-first')
    expect(decide(get('/today', 'navigate'))).toBe('page-network-first')
    expect(decide(get('/attempts/0190-abcd', 'navigate'))).toBe('page-network-first')
  })

  it('bypasses non-GET requests, other origins and unparsable URLs', () => {
    expect(decide({ ...get('/assets/x.js'), method: 'POST' })).toBe('bypass')
    expect(decide({ url: 'https://api.meta.ai/v1/x', method: 'GET', mode: 'cors', origin })).toBe('bypass')
    expect(decide({ url: 'not a url', method: 'GET', mode: 'cors', origin })).toBe('bypass')
  })

  it('names caches by build version and recognises every older one as stale', () => {
    expect(cacheNames('v2')).toEqual({ assets: 'gb-assets-v2', shell: 'gb-shell-v2' })
    expect(isStaleCache('gb-assets-v1', 'v2')).toBe(true)
    expect(isStaleCache('gb-shell-v1', 'v2')).toBe(true)
    expect(isStaleCache('gb-assets-v2', 'v2')).toBe(false)
    expect(isStaleCache('someone-elses-cache', 'v2')).toBe(false)
  })
})
