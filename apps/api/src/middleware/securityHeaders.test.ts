import { describe, expect, it } from 'vitest'
import { NOINDEX, PRIVATE_PATH_PREFIXES, isPrivatePath } from './securityHeaders.js'

/** B17 (D40): the noindex header follows the same list robots.txt disallows. */
describe('private paths', () => {
  it('covers the API and every signed-in space, and leaves the public front door alone', () => {
    for (const path of ['/api/library', '/api', '/library', '/library/mathematics/12/2023/november/p1', '/today', '/teacher/classes/x', '/guardian', '/items/abc', '/attempts/abc']) {
      expect(isPrivatePath(path), path).toBe(true)
    }
    for (const path of ['/', '/try', '/evidence', '/signin', '/signup', '/robots.txt', '/manifest.webmanifest', '/assets/app.js', '/library-of-nothing']) {
      expect(isPrivatePath(path), path).toBe(false)
    }
    expect(NOINDEX).toBe('noindex, nofollow, noarchive')
    expect(PRIVATE_PATH_PREFIXES).toContain('/library')
  })
})
