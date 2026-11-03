import { Router } from 'express'
import type { Db } from '../../db/client.js'
import type { Gateway } from '../../gateway/gateway.js'
import type { Logger } from '../../logger.js'
import { brainRouter } from './brain.js'
import { checksRouter } from './checks.js'
import { profileRouter } from './profile.js'
import { todayRouter } from './today.js'

/** B05's learner routes: profile cards, Today, check-ins, the Brain (spec 03 §8.3, §9.3). */
export function learnerSpaceRouter(db: Db, gateway: Gateway, logger: Logger): Router {
  const router = Router()
  router.use(profileRouter(db, gateway, logger))
  router.use(todayRouter(db))
  router.use(checksRouter(db))
  router.use(brainRouter(db))
  return router
}
