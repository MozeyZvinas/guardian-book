import { Router } from 'express'
import type { CalendarResponse } from '@guardian-book/shared'
import { recordAudit } from '../audit/record.js'
import { requireActor, requireRole } from '../auth/session.js'
import type { PracticeDeps } from '../inputs/deps.js'
import { HttpError, requestIdOf, uuidParam } from '../lib/http.js'
import { decideEvent, listCalendar, type CalendarScope } from './service.js'

/** `/api/calendar` (spec 03 §8.3): events per role; confirm or reject a proposed one. */
export function calendarRouter(deps: PracticeDeps): Router {
  const router = Router()

  router.get('/api/calendar', async (req, res, next) => {
    try {
      const actor = requireActor(res)
      const scope = parseScope(req.query['scope'])
      const events = await listCalendar(deps.db, actor, scope)
      if (actor.role === 'admin') {
        await recordAudit(deps.db, { actorId: actor.userId, action: 'access.admin_read', subjectType: 'calendar', subjectId: null, outcome: 'ok', requestId: requestIdOf(req) })
      }
      const payload: CalendarResponse = { events }
      res.setHeader('Cache-Control', 'no-store')
      res.json(payload)
    } catch (err) {
      next(err)
    }
  })

  for (const decision of ['confirm', 'reject'] as const) {
    router.post(`/api/calendar/:id/${decision}`, requireRole('learner', 'teacher'), async (req, res, next) => {
      try {
        const actor = requireActor(res)
        const eventId = uuidParam(req, 'id')
        const payload = await decideEvent(deps.db, actor, eventId, decision === 'confirm' ? 'confirmed' : 'rejected', requestIdOf(req))
        res.setHeader('Cache-Control', 'no-store')
        res.json(payload)
      } catch (err) {
        next(err)
      }
    })
  }

  return router
}

/** `?scope=class:<uuid>` or `?scope=learner:<uuid>`; anything else is a 400. */
function parseScope(raw: unknown): CalendarScope | undefined {
  if (raw === undefined) return undefined
  const match = typeof raw === 'string' ? /^(class|learner):([0-9a-f-]{36})$/i.exec(raw) : null
  if (!match) throw new HttpError(400, 'validation', 'scope must be class:<id> or learner:<id>.')
  return { type: match[1] as 'class' | 'learner', id: (match[2] ?? '').toLowerCase() }
}
