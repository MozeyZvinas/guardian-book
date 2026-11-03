import type { Request } from 'express'
import type { ZodType } from 'zod'

/** An error the API answers with `{error: {code, message}}` (spec 03 §5). */
export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly issues?: { path: string; message: string }[],
  ) {
    super(message)
    this.name = 'HttpError'
  }
}

export const unauthorized = () => new HttpError(401, 'unauthorized', 'Sign in first.')
export const forbidden = () => new HttpError(403, 'forbidden', 'Not for this role.')
/** Object-level denials and missing rows look the same: the ID is never confirmed. */
export const notFound = () => new HttpError(404, 'not_found', 'Not found.')
export const notConfigured = () =>
  new HttpError(503, 'not_configured', 'The database or auth is not configured on this server.')

/** Parses a request body (or any value) with a Zod schema; a failure is a 400 `validation`. */
export function parse<T>(schema: ZodType<T>, value: unknown, what = 'body'): T {
  const result = schema.safeParse(value)
  if (result.success) return result.data
  const issues = result.error.issues.map((issue) => ({
    path: issue.path.map(String).join('.'),
    message: issue.message,
  }))
  throw new HttpError(400, 'validation', `Invalid ${what}.`, issues)
}

export function requestIdOf(req: Request): string | undefined {
  const value = req.res?.locals['requestId']
  return typeof value === 'string' ? value : undefined
}

/** Express 5 route params are strings; a non-UUID is a 404, not a 400, so IDs are never probed. */
export function uuidParam(req: Request, name: string): string {
  const value = req.params[name]
  if (typeof value !== 'string' || !/^[0-9a-f-]{36}$/i.test(value)) throw notFound()
  return value.toLowerCase()
}
