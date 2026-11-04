import type { RequestHandler } from 'express'

/**
 * Security headers, set by hand (no dependency). Same-origin app: scripts, styles, fonts
 * and API calls all come from 'self'; images may also be data: URIs. Inline `style`
 * attributes are allowed because KaTeX (D37) lays maths out with them; scripts stay 'self'
 * only, and no route ever renders raw HTML.
 */
export const CONTENT_SECURITY_POLICY = contentSecurityPolicy([])

/** `imageOrigins`: where presigned image links point (the private bucket), so `<img>` may follow the 302. */
export function contentSecurityPolicy(imageOrigins: string[]): string {
  return [
    "default-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    `img-src 'self' data:${imageOrigins.map((origin) => ` ${origin}`).join('')}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join('; ')
}

/** The microphone is for hold-to-talk on the learner's own screens only (B13); nothing else opens. */
export const PERMISSIONS_POLICY = 'camera=(self), microphone=(self), geolocation=(), payment=()'

/**
 * B17 (D40): everything behind sign-in, and every `/api` response, tells crawlers to keep
 * out. The same prefixes `apps/web/public/robots.txt` disallows; the public front door,
 * `/try`, `/evidence` and the account forms stay indexable.
 */
export const PRIVATE_PATH_PREFIXES = ['/api', '/library', '/today', '/brain', '/me', '/bring', '/attempts', '/items', '/calendar', '/guardian', '/teacher'] as const
export const NOINDEX = 'noindex, nofollow, noarchive'

export function isPrivatePath(pathname: string): boolean {
  return PRIVATE_PATH_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))
}

export function securityHeaders(options: { imageOrigins?: string[] } = {}): RequestHandler {
  const policy = contentSecurityPolicy(options.imageOrigins ?? [])
  return (req, res, next) => {
    res.setHeader('Content-Security-Policy', policy)
    res.setHeader('X-Content-Type-Options', 'nosniff')
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin')
    res.setHeader('Permissions-Policy', PERMISSIONS_POLICY)
    res.setHeader('X-Frame-Options', 'DENY')
    if (isPrivatePath(req.path)) res.setHeader('X-Robots-Tag', NOINDEX)
    next()
  }
}
