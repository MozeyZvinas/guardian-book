import { Router } from 'express'
import { z } from 'zod'
import {
  MAX_LIBRARY_QUERY_CHARS,
  approvePaperBodySchema,
  createClassPracticeBodySchema,
  paperSessionSchema,
  skillTagSchema,
  type ApprovePaperResponse,
  type ClassPracticeListResponse,
  type ClassPracticeResponse,
  type LibraryPaperResponse,
  type LibraryResponse,
  type LibrarySearchResponse,
  type WhatComesUpResponse,
} from '@guardian-book/shared'
import { can } from '../access/index.js'
import { requireActor, requireRole } from '../auth/session.js'
import type { PracticeDeps } from '../inputs/deps.js'
import { HttpError, notFound, parse, requestIdOf, uuidParam } from '../lib/http.js'
import { DIAGRAM_CACHE_CONTROL, approveSet, createPractice, diagramFor, listPapers, listPractice, paperQuestions, searchQuestions, whatComesUp } from './service.js'

/**
 * The library routes (brief B17 phase B; D40). Every one needs a session (401 without),
 * answers only learners and teachers (a guardian's 404 never confirms a path), and goes
 * out with `X-Robots-Tag: noindex, nofollow, noarchive` (set for every `/api` response by
 * the security headers). No response carries a PDF or a bucket URL: a diagram is proxied
 * by item ID; "Download" is DBE's own page.
 */

const paperParamsSchema = z.object({
  subject: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  grade: z.coerce.number().int().min(10).max(12),
  year: z.coerce.number().int().min(2008).max(2100),
  session: paperSessionSchema,
  paper: z.string().regex(/^p[1-3]$/),
})

/** `POST .../library/approve`: a paper (the brief's one action) or every question on a skill. */
const approveBodySchema = z.union([
  approvePaperBodySchema.transform((paper) => ({ kind: 'paper' as const, paper })),
  z
    .object({ skillTag: skillTagSchema })
    .strict()
    .transform(({ skillTag }) => ({ kind: 'topic' as const, skillTag })),
])

export function libraryRouter(deps: PracticeDeps): Router {
  const router = Router()
  const { db } = deps

  const guard = async (res: Parameters<typeof requireActor>[0]) => {
    const actor = requireActor(res)
    if (!(await can(db, actor, 'library.read', { type: 'library' }))) throw notFound()
    return actor
  }

  router.get('/api/library', async (_req, res, next) => {
    try {
      await guard(res)
      const payload: LibraryResponse = await listPapers(db)
      res.setHeader('Cache-Control', 'no-store')
      res.json(payload)
    } catch (err) {
      next(err)
    }
  })

  router.get('/api/library/search', async (req, res, next) => {
    try {
      const actor = await guard(res)
      const raw = req.query['q']
      const query = typeof raw === 'string' ? raw : ''
      if (query.length > MAX_LIBRARY_QUERY_CHARS) throw new HttpError(400, 'validation', 'That search is too long.')
      const payload: LibrarySearchResponse = await searchQuestions(db, actor, query)
      res.setHeader('Cache-Control', 'no-store')
      res.json(payload)
    } catch (err) {
      next(err)
    }
  })

  router.get('/api/library/comes-up', async (_req, res, next) => {
    try {
      await guard(res)
      const payload: WhatComesUpResponse = await whatComesUp(db)
      res.setHeader('Cache-Control', 'no-store')
      res.json(payload)
    } catch (err) {
      next(err)
    }
  })

  /** The diagram bytes, proxied: the bucket is never named. Private cache for an hour. */
  router.get('/api/library/items/:id/diagram', async (req, res, next) => {
    try {
      await guard(res)
      const object = await diagramFor(db, deps.storage, uuidParam(req, 'id'))
      if (!object) throw notFound()
      res.setHeader('Cache-Control', DIAGRAM_CACHE_CONTROL)
      res.type(object.contentType).send(object.body)
    } catch (err) {
      next(err)
    }
  })

  router.get('/api/library/:subject/:grade/:year/:session/:paper', async (req, res, next) => {
    try {
      const actor = await guard(res)
      const params = paperParamsSchema.safeParse(req.params)
      if (!params.success) throw notFound()
      const { subject, grade, year, session, paper } = params.data
      const payload: LibraryPaperResponse = await paperQuestions(db, actor, { subjectSlug: subject, grade, year, session, paper: Number(paper.slice(1)) })
      res.setHeader('Cache-Control', 'no-store')
      res.json(payload)
    } catch (err) {
      next(err)
    }
  })

  // ── the teacher ───────────────────────────────────────────────────────────────────────

  router.post('/api/teacher/classes/:id/library/approve', requireRole('teacher'), async (req, res, next) => {
    try {
      const body = parse(approveBodySchema, req.body)
      const payload: ApprovePaperResponse = await approveSet(db, requireActor(res), uuidParam(req, 'id'), body, requestIdOf(req))
      res.setHeader('Cache-Control', 'no-store')
      res.status(payload.approved > 0 ? 201 : 200).json(payload)
    } catch (err) {
      next(err)
    }
  })

  router.get('/api/teacher/classes/:id/practice', requireRole('teacher'), async (req, res, next) => {
    try {
      const payload: ClassPracticeListResponse = await listPractice(db, requireActor(res), uuidParam(req, 'id'))
      res.setHeader('Cache-Control', 'no-store')
      res.json(payload)
    } catch (err) {
      next(err)
    }
  })

  router.post('/api/teacher/classes/:id/practice', requireRole('teacher'), async (req, res, next) => {
    try {
      const body = parse(createClassPracticeBodySchema, req.body)
      const payload: ClassPracticeResponse = { practice: await createPractice(db, requireActor(res), uuidParam(req, 'id'), body, requestIdOf(req)) }
      res.setHeader('Cache-Control', 'no-store')
      res.status(201).json(payload)
    } catch (err) {
      next(err)
    }
  })

  return router
}
