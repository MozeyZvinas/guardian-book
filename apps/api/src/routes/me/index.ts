import { Router } from 'express'
import type { ModelRunDeps } from '../../modelRuns/index.js'
import { brainRouter } from './brain.js'
import { checksRouter } from './checks.js'
import { profileRouter } from './profile.js'
import { todayRouter } from './today.js'

/**
 * B05's learner routes: profile cards, Today, check-ins, the Brain (spec 03 §8.3, §9.3).
 * The profile route makes the one model call, through B04's `runModel` (caps, rows).
 */
export function learnerSpaceRouter(deps: ModelRunDeps): Router {
  const router = Router()
  router.use(profileRouter(deps))
  router.use(todayRouter(deps.db))
  router.use(checksRouter(deps.db))
  router.use(brainRouter(deps.db))
  return router
}
