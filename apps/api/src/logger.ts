/**
 * Structured JSON logs, one object per line on stdout.
 * Never log answer text, images, email addresses or passwords (spec 01 § Security plan):
 * every field object passes through `redact()` first.
 */

export const REDACTED_KEYS: readonly string[] = ['answerText', 'email', 'password', 'image']

const redactedLower = new Set(REDACTED_KEYS.map((key) => key.toLowerCase()))
const MAX_DEPTH = 16

/** Returns a copy of `value` with every redacted key dropped, at any depth. */
export function redact(value: unknown, seen = new WeakSet<object>(), depth = 0): unknown {
  if (value === null || typeof value !== 'object') return value
  if (depth > MAX_DEPTH) return '[depth limit]'
  if (seen.has(value)) return '[circular]'
  seen.add(value)

  if (value instanceof Uint8Array) return `[bytes:${value.byteLength}]`
  if (value instanceof Date) return value.toISOString()
  if (value instanceof Error) {
    return { name: value.name, message: value.message, stack: value.stack }
  }
  if (Array.isArray(value)) return value.map((item) => redact(item, seen, depth + 1))

  const out: Record<string, unknown> = {}
  for (const [key, item] of Object.entries(value)) {
    if (redactedLower.has(key.toLowerCase())) continue
    out[key] = redact(item, seen, depth + 1)
  }
  return out
}

export type LogLevel = 'debug' | 'info' | 'warn' | 'error'
export type LogFields = Record<string, unknown>
export type LogSink = (line: string) => void

export interface Logger {
  debug(msg: string, fields?: LogFields): void
  info(msg: string, fields?: LogFields): void
  warn(msg: string, fields?: LogFields): void
  error(msg: string, fields?: LogFields): void
}

const stdoutSink: LogSink = (line) => {
  process.stdout.write(`${line}\n`)
}

export function createLogger(sink: LogSink = stdoutSink): Logger {
  const emit = (level: LogLevel, msg: string, fields?: LogFields): void => {
    const safeFields = fields ? (redact(fields) as Record<string, unknown>) : {}
    const entry = { ...safeFields, time: new Date().toISOString(), level, msg }
    sink(JSON.stringify(entry))
  }
  return {
    debug: (msg, fields) => emit('debug', msg, fields),
    info: (msg, fields) => emit('info', msg, fields),
    warn: (msg, fields) => emit('warn', msg, fields),
    error: (msg, fields) => emit('error', msg, fields),
  }
}

export const logger: Logger = createLogger()

/** For tests. */
export const silentLogger: Logger = createLogger(() => {})
