import type { Db } from '../db/client.js'
import type { Gateway } from '../gateway/gateway.js'
import type { Logger } from '../logger.js'
import type { CapLimits } from '../modelRuns/caps.js'
import type { JobRegistry } from '../modelRuns/jobs.js'
import type { Storage } from '../storage/index.js'

/** What the inputs, assessment and calendar services need. Built once in `createApp`. */
export interface PracticeDeps {
  db: Db
  gateway: Gateway
  /** Null when `BUCKET_*` is not configured: uploads answer 503, typed inputs still work. */
  storage: Storage | null
  logger: Logger
  limits: CapLimits
  jobs: JobRegistry
  now: () => Date
}
