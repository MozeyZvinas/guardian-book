import { randomUUID } from 'node:crypto'
import type { RequestHandler } from 'express'
import type { Logger } from '../logger.js'

/** Accept a caller's request ID only when it is plainly safe to echo into logs and headers. */
const REQUEST_ID_PATTERN = /^[A-Za-z0-9._-]{8,128}$/

export function requestIdFrom(header: string | undefined): string {
  return header && REQUEST_ID_PATTERN.test(header) ? header : randomUUID()
}

/**
 * Gives every request an ID (`x-request-id`, generated if missing or unsafe) and writes one
 * JSON log line when the response finishes: route, status and latency. No query strings,
 * no bodies, no headers.
 */
export function requestLog(logger: Logger): RequestHandler {
  return (req, res, next) => {
    const requestId = requestIdFrom(req.header('x-request-id'))
    res.locals['requestId'] = requestId
    res.setHeader('x-request-id', requestId)

    const started = process.hrtime.bigint()
    res.on('finish', () => {
      const durationMs = Number(process.hrtime.bigint() - started) / 1_000_000
      logger.info('request', {
        requestId,
        method: req.method,
        route: req.path,
        status: res.statusCode,
        durationMs: Math.round(durationMs * 100) / 100,
      })
    })

    next()
  }
}
