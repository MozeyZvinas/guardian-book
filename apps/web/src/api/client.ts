import type { ZodType } from 'zod'
import { apiErrorSchema } from '@guardian-book/shared'

/**
 * The typed client (spec 06 §2): one function per route, every response parsed with the
 * shared Zod schema before it touches a component. Same-origin cookies; JSON both ways.
 */
export class ApiRequestError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly issues: { path: string; message: string }[] = [],
    readonly requestId?: string,
  ) {
    super(message)
    this.name = 'ApiRequestError'
  }
}

export async function api<T>(
  path: string,
  schema: ZodType<T>,
  init: { method?: 'GET' | 'POST' | 'DELETE' | 'PATCH'; body?: unknown } = {},
): Promise<T> {
  let res: Response
  try {
    res = await fetch(path, {
      method: init.method ?? 'GET',
      credentials: 'same-origin',
      headers: {
        accept: 'application/json',
        ...(init.body !== undefined ? { 'content-type': 'application/json' } : {}),
      },
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
    })
  } catch {
    throw new ApiRequestError(0, 'offline', 'No connection. Check your signal and try again.')
  }

  const requestId = res.headers.get('x-request-id') ?? undefined
  if (res.status === 204) return schema.parse(undefined)

  const json: unknown = await res.json().catch(() => null)

  if (!res.ok) {
    const envelope = apiErrorSchema.safeParse(json)
    if (envelope.success) {
      const { code, message, issues } = envelope.data.error
      throw new ApiRequestError(res.status, code, message, issues ?? [], requestId)
    }
    // Better Auth's own endpoints answer {code, message}.
    const flat = json as { code?: string; message?: string } | null
    throw new ApiRequestError(
      res.status,
      flat?.code ?? 'error',
      flat?.message ?? 'Something went wrong. Try again.',
      [],
      requestId,
    )
  }

  const parsed = schema.safeParse(json)
  if (!parsed.success) {
    throw new ApiRequestError(res.status, 'bad_response', 'The server answered in a shape this app does not understand.', [], requestId)
  }
  return parsed.data
}
