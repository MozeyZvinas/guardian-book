import { Router } from 'express'
import { createGuideFieldsSchema, type GuideResponse } from '@guardian-book/shared'
import { requireActor, requireRole } from '../auth/session.js'
import type { PracticeDeps } from '../inputs/deps.js'
import { isMultipart, readMultipart } from '../inputs/multipart.js'
import { parse, requestIdOf, uuidParam } from '../lib/http.js'
import { createGuide, readGuideView } from './service.js'

/**
 * `/api/guide` (brief B15 §2): `POST` brings a question (photo, typed text, or an input
 * already brought) and answers 202 while two reads run; `GET /:id` is what the learner
 * polls every 2 s. Learners only; the owner only (access `guide.read`).
 */
export function guideRouter(deps: PracticeDeps): Router {
  const router = Router()

  router.post('/api/guide', requireRole('learner'), async (req, res, next) => {
    try {
      const actor = requireActor(res)
      let fields: unknown
      let file: { bytes: Buffer } | null = null
      if (isMultipart(req)) {
        const body = await readMultipart(req)
        fields = body.fields
        file = body.file ? { bytes: body.file.bytes } : null
      } else {
        fields = req.body
      }
      const parsed = parse(createGuideFieldsSchema, fields)
      const result = await createGuide(deps, { actor, fields: parsed, file, requestId: requestIdOf(req) })
      const payload: GuideResponse = result
      res.setHeader('Cache-Control', 'no-store')
      res.status(result.replayed ? 200 : 202).json(payload)
    } catch (err) {
      next(err)
    }
  })

  router.get('/api/guide/:id', requireRole('learner'), async (req, res, next) => {
    try {
      const actor = requireActor(res)
      const guideId = uuidParam(req, 'id')
      const payload: GuideResponse = { guide: await readGuideView(deps, actor, guideId), replayed: false }
      res.setHeader('Cache-Control', 'no-store')
      res.json(payload)
    } catch (err) {
      next(err)
    }
  })

  return router
}
