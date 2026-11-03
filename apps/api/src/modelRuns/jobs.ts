import type { Logger } from '../logger.js'

/**
 * In-process background work (brief B04 §3): a route answers at once and the model calls
 * run after the response; the client polls. One job per key at a time. Nothing here
 * survives a restart; the database rows (`attempts.assessing_started_at`, the boot sweep)
 * carry the durable state.
 */
export class JobRegistry {
  private readonly running = new Map<string, Promise<void>>()

  constructor(private readonly logger: Logger) {}

  isRunning(key: string): boolean {
    return this.running.has(key)
  }

  /** Starts `work` unless a job with this key is already running. Returns whether it started. */
  start(key: string, work: () => Promise<void>): boolean {
    if (this.running.has(key)) return false
    const job = work()
      .catch((err: unknown) => {
        this.logger.error('background job failed', { key, err })
      })
      .finally(() => {
        this.running.delete(key)
      })
    this.running.set(key, job)
    return true
  }

  /** For tests and shutdown: resolves when the job with this key (if any) has ended. */
  async wait(key: string): Promise<void> {
    await this.running.get(key)
  }

  async waitAll(): Promise<void> {
    await Promise.all([...this.running.values()])
  }
}
