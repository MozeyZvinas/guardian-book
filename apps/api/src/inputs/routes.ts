import { Router } from 'express'
import { createInputFieldsSchema, patchInputKindBodySchema, type InputResponse } from '@guardian-book/shared'
import { can } from '../access/index.js'
import { recordAudit } from '../audit/record.js'
import { requireActor, requireRole } from '../auth/session.js'
import { notFound, parse, requestIdOf, uuidParam } from '../lib/http.js'
import { PRESIGN_MAX_SECONDS, storageNotConfigured } from '../storage/index.js'
import type { PracticeDeps } from './deps.js'
import { isMultipart, readMultipart } from './multipart.js'
import { createInput, findInput, inputView, listInputs, setInputKind } from './service.js'

/**
 * `/api/inputs` (spec 03 §8.3; brief B04 §2): bring anything, read it back, change what
 * it is, fetch the stored file through a short presigned link.
 */
export function inputsRouter(deps: PracticeDeps): Router {
  const router = Router()

  router.post('/api/inputs', requireRole('learner', 'teacher'), async (req, res, next) => {
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
      const parsed = parse(createInputFieldsSchema, fields)
      const result = await createInput(deps, { actor, fields: parsed, file, requestId: requestIdOf(req) })
      const payload: InputResponse = result
      res.setHeader('Cache-Control', 'no-store')
      res.status(result.replayed ? 200 : 201).json(payload)
    } catch (err) {
      next(err)
    }
  })

  router.get('/api/inputs', requireRole('learner'), async (_req, res, next) => {
    try {
      const actor = requireActor(res)
      res.setHeader('Cache-Control', 'no-store')
      res.json({ inputs: await listInputs(deps, actor) })
    } catch (err) {
      next(err)
    }
  })

  router.get('/api/inputs/:id', async (req, res, next) => {
    try {
      const actor = requireActor(res)
      const inputId = uuidParam(req, 'id')
      if (!(await can(deps.db, actor, 'input.read', { type: 'input', id: inputId }))) throw notFound()
      const row = await findInput(deps, inputId)
      if (!row) throw notFound()
      if (actor.role === 'admin') {
        await recordAudit(deps.db, { actorId: actor.userId, action: 'access.admin_read', subjectType: 'input', subjectId: inputId, outcome: 'ok', requestId: requestIdOf(req) })
      }
      const payload: InputResponse = { input: await inputView(deps, row), replayed: false }
      res.setHeader('Cache-Control', 'no-store')
      res.json(payload)
    } catch (err) {
      next(err)
    }
  })

  router.patch('/api/inputs/:id/kind', requireRole('learner', 'teacher'), async (req, res, next) => {
    try {
      const actor = requireActor(res)
      const inputId = uuidParam(req, 'id')
      const body = parse(patchInputKindBodySchema, req.body)
      const input = await setInputKind(deps, actor, inputId, body, requestIdOf(req))
      const payload: InputResponse = { input, replayed: false }
      res.setHeader('Cache-Control', 'no-store')
      res.json(payload)
    } catch (err) {
      next(err)
    }
  })

  /** 302 to a presigned URL (≤ 5 min); the object itself is never public. */
  router.get('/api/inputs/:id/file', async (req, res, next) => {
    try {
      const actor = requireActor(res)
      const inputId = uuidParam(req, 'id')
      if (!(await can(deps.db, actor, 'input.read', { type: 'input', id: inputId }))) throw notFound()
      const row = await findInput(deps, inputId)
      if (!row || !row.objectKey) throw notFound()
      if (!deps.storage) throw storageNotConfigured()
      res.setHeader('Cache-Control', 'no-store')
      res.redirect(302, await deps.storage.presignGet(row.objectKey, PRESIGN_MAX_SECONDS))
    } catch (err) {
      next(err)
    }
  })

  return router
}
