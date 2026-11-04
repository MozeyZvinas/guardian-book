import type { Db } from '../db/client.js'
import type { Gateway } from '../gateway/gateway.js'
import type { Logger } from '../logger.js'
import type { CapLimits } from '../modelRuns/caps.js'
import type { JobRegistry } from '../modelRuns/jobs.js'
import type { Storage } from '../storage/index.js'

/** The loop's settings (B06): the Help Plan agent and the follow-up check. */
export interface LoopDeps {
  /** The agent's gateway (`META_MODEL_AGENT`); the work-check gateway when they are the same model. */
  agentGateway: Gateway
  /** At most this many agent steps per plan (`PLAN_AGENT_MAX_STEPS`, default 8). */
  planMaxSteps: number
  /** Days from a correct independent check to the follow-up check (`RETENTION_CHECK_DAYS`, default 2). */
  retentionCheckDays: number
}

/** What the inputs, assessment, calendar, plan and guardian services need. Built once in `createApp`. */
export interface PracticeDeps {
  db: Db
  gateway: Gateway
  /** Null when `BUCKET_*` is not configured: uploads answer 503, typed inputs still work. */
  storage: Storage | null
  logger: Logger
  limits: CapLimits
  jobs: JobRegistry
  now: () => Date
  loop: LoopDeps
}
