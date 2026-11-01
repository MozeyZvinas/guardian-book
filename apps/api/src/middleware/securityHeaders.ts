import type { RequestHandler } from 'express'

/**
 * Security headers, set by hand (no dependency). Same-origin app: scripts, styles, fonts
 * and API calls all come from 'self'; images may also be data: URIs.
 */
export const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "img-src 'self' data:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ')

export const PERMISSIONS_POLICY = 'camera=(self), microphone=(), geolocation=(), payment=()'

export function securityHeaders(): RequestHandler {
  return (_req, res, next) => {
    res.setHeader('Content-Security-Policy', CONTENT_SECURITY_POLICY)
    res.setHeader('X-Content-Type-Options', 'nosniff')
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin')
    res.setHeader('Permissions-Policy', PERMISSIONS_POLICY)
    res.setHeader('X-Frame-Options', 'DENY')
    next()
  }
}
