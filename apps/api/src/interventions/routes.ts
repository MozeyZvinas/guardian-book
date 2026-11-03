import { Router } from 'express'
import { createInterventionBodySchema, patchInterventionBodySchema, type InterventionResponse, type InterventionsResponse } from '@guardian-book/shared'
import { requireActor, requireRole } from '../auth/session.js'
import { parse, requestIdOf, uuidParam } from '../lib/http.js'
import type { TeacherDeps } from '../teacher/deps.js'
import { createIntervention, listInterventions, patchIntervention } from './service.js'

/** `/api/teacher/interventions` and `/api/teacher/classes/:id/interventions` (spec 03 §9.3). */
export function interventionsRouter(deps: TeacherDeps): Router {
  const router = Router()
  const { db } = deps

  router.get('/api/teacher/classes/:id/interventions', requireRole('teacher'), async (req, res, next) => {
    try {
      const actor = requireActor(res)
      const payload: InterventionsResponse = { interventions: await listInterventions(db, actor, uuidParam(req, 'id')) }
      res.setHeader('Cache-Control', 'no-store')
      res.json(payload)
    } catch (err) {
      next(err)
    }
  })

  router.post('/api/teacher/interventions', requireRole('teacher'), async (req, res, next) => {
    try {
      const actor = requireActor(res)
      const body = parse(createInterventionBodySchema, req.body)
      const payload: InterventionResponse = { intervention: await createIntervention(db, actor, body, requestIdOf(req)) }
      res.setHeader('Cache-Control', 'no-store')
      res.status(201).json(payload)
    } catch (err) {
      next(err)
    }
  })

  router.patch('/api/teacher/interventions/:id', requireRole('teacher'), async (req, res, next) => {
    try {
      const actor = requireActor(res)
      const body = parse(patchInterventionBodySchema, req.body)
      const payload: InterventionResponse = { intervention: await patchIntervention(db, actor, uuidParam(req, 'id'), body, requestIdOf(req)) }
      res.setHeader('Cache-Control', 'no-store')
      res.json(payload)
    } catch (err) {
      next(err)
    }
  })

  return router
}
