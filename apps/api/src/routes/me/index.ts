import { Router } from 'express'
import type { PracticeDeps } from '../../inputs/deps.js'
import { brainRouter } from './brain.js'
import { checksRouter } from './checks.js'
import { profileRouter } from './profile.js'
import { todayRouter } from './today.js'

/**
 * B05's learner routes: profile cards, Today, check-ins, the Brain (spec 03 §8.3, §9.3).
 * The profile route makes the one model call, through B04's `runModel` (caps, rows).
 * The follow-up check's lead time (`RETENTION_CHECK_DAYS`, B06) reaches Today and checks here.
 */
export function learnerSpaceRouter(deps: PracticeDeps): Router {
  const router = Router()
  const clock = { now: deps.now, retentionDays: deps.loop.retentionCheckDays }
  router.use(profileRouter(deps))
  router.use(todayRouter(deps.db, clock))
  router.use(checksRouter(deps.db, clock))
  router.use(brainRouter(deps.db))
  return router
}
