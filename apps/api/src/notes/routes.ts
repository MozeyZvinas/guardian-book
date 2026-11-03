import { Router } from 'express'
import { approveNoteBodySchema, createNoteBodySchema, type DraftNotesResponse, type GuardianNotesResponse, type NoteResponse, type NotesResponse } from '@guardian-book/shared'
import { requireActor, requireRole } from '../auth/session.js'
import { HttpError, parse, requestIdOf, uuidParam } from '../lib/http.js'
import type { TeacherDeps } from '../teacher/deps.js'
import { approveNote, createNote, draftNotes, guardianNote, guardianNotes, listNotes, sendNote } from './service.js'

/**
 * Notes home (spec 03 §8.3): the teacher lists, drafts, writes, approves and sends;
 * `GET /api/guardian/notes` serves the guardian only what has been sent to them.
 */
export function notesRouter(deps: TeacherDeps): Router {
  const router = Router()
  const { db } = deps

  router.get('/api/teacher/notes', requireRole('teacher'), async (req, res, next) => {
    try {
      const actor = requireActor(res)
      const classId = req.query['classId']
      if (typeof classId !== 'string' || !/^[0-9a-f-]{36}$/i.test(classId)) throw new HttpError(400, 'validation', 'classId is required.')
      const payload: NotesResponse = await listNotes(db, actor, classId.toLowerCase())
      res.setHeader('Cache-Control', 'no-store')
      res.json(payload)
    } catch (err) {
      next(err)
    }
  })

  router.post('/api/teacher/classes/:id/notes/draft', requireRole('teacher'), async (req, res, next) => {
    try {
      const actor = requireActor(res)
      const payload: DraftNotesResponse = await draftNotes(deps, actor, uuidParam(req, 'id'), requestIdOf(req))
      res.setHeader('Cache-Control', 'no-store')
      res.json(payload)
    } catch (err) {
      next(err)
    }
  })

  router.post('/api/teacher/notes', requireRole('teacher'), async (req, res, next) => {
    try {
      const actor = requireActor(res)
      const body = parse(createNoteBodySchema, req.body)
      const created = await createNote(db, actor, body, requestIdOf(req))
      res.setHeader('Cache-Control', 'no-store')
      res.status(201).json({ notes: created })
    } catch (err) {
      next(err)
    }
  })

  router.post('/api/teacher/notes/:id/approve', requireRole('teacher'), async (req, res, next) => {
    try {
      const actor = requireActor(res)
      const body = parse(approveNoteBodySchema, req.body)
      const payload: NoteResponse = { note: await approveNote(db, actor, uuidParam(req, 'id'), body, requestIdOf(req)) }
      res.setHeader('Cache-Control', 'no-store')
      res.json(payload)
    } catch (err) {
      next(err)
    }
  })

  router.post('/api/teacher/notes/:id/send', requireRole('teacher'), async (req, res, next) => {
    try {
      const actor = requireActor(res)
      const payload: NoteResponse = { note: await sendNote(db, actor, uuidParam(req, 'id'), requestIdOf(req)) }
      res.setHeader('Cache-Control', 'no-store')
      res.json(payload)
    } catch (err) {
      next(err)
    }
  })

  router.get('/api/guardian/notes', requireRole('guardian'), async (_req, res, next) => {
    try {
      const actor = requireActor(res)
      const payload: GuardianNotesResponse = { notes: await guardianNotes(db, actor) }
      res.setHeader('Cache-Control', 'no-store')
      res.json(payload)
    } catch (err) {
      next(err)
    }
  })

  router.get('/api/guardian/notes/:id', requireRole('guardian'), async (req, res, next) => {
    try {
      const actor = requireActor(res)
      res.setHeader('Cache-Control', 'no-store')
      res.json({ note: await guardianNote(db, actor, uuidParam(req, 'id')) })
    } catch (err) {
      next(err)
    }
  })

  return router
}
