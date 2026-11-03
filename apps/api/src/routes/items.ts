import { and, asc, eq } from 'drizzle-orm'
import { Router } from 'express'
import type { GuidelineStep, ItemDetail, ItemSummary } from '@guardian-book/shared'
import { can } from '../access/index.js'
import { recordAudit } from '../audit/record.js'
import { requireActor } from '../auth/session.js'
import type { Db } from '../db/client.js'
import { guidelineSteps, items } from '../db/schema.js'
import { notFound, requestIdOf, uuidParam } from '../lib/http.js'

/**
 * Items (spec 03 §4, §5): approved items for anyone signed in; the guideline steps only
 * when `access.can(item.guideline.read)` says so (a learner after their own attempt; a
 * teacher once a learner in their class attempted it; admin, audited).
 */
export function itemsRouter(db: Db): Router {
  const router = Router()

  router.get('/api/items', async (_req, res, next) => {
    try {
      requireActor(res)
      const rows = await db
        .select({
          id: items.id,
          slug: items.slug,
          topic: items.topic,
          skillTags: items.skillTags,
          maxMarks: items.maxMarks,
          revision: items.revision,
        })
        .from(items)
        .where(eq(items.status, 'approved'))
        .orderBy(asc(items.slug))
      const list: ItemSummary[] = rows
      res.json({ items: list })
    } catch (err) {
      next(err)
    }
  })

  router.get('/api/items/:id', async (req, res, next) => {
    try {
      const actor = requireActor(res)
      const itemId = uuidParam(req, 'id')
      const [row] = await db
        .select()
        .from(items)
        .where(and(eq(items.id, itemId), eq(items.status, 'approved')))
        .limit(1)
      if (!row || !(await can(db, actor, 'item.read', { type: 'item', id: itemId }))) throw notFound()

      const item: ItemDetail = {
        id: row.id,
        slug: row.slug,
        topic: row.topic,
        skillTags: row.skillTags,
        maxMarks: row.maxMarks,
        revision: row.revision,
        promptMd: row.promptMd,
        diagramKey: row.diagramKey,
      }

      if (await can(db, actor, 'item.guideline.read', { type: 'item', id: itemId })) {
        const steps = await db
          .select({
            id: guidelineSteps.id,
            stepNo: guidelineSteps.stepNo,
            stepType: guidelineSteps.stepType,
            criterion: guidelineSteps.criterion,
            marks: guidelineSteps.marks,
            skillTag: guidelineSteps.skillTag,
            notes: guidelineSteps.notes,
          })
          .from(guidelineSteps)
          .where(eq(guidelineSteps.itemId, itemId))
          .orderBy(asc(guidelineSteps.stepNo))
        const list: GuidelineStep[] = steps
        item.guidelineSteps = list
        if (actor.role === 'admin') {
          await recordAudit(db, {
            actorId: actor.userId,
            action: 'access.admin_read',
            subjectType: 'item_guideline',
            subjectId: itemId,
            outcome: 'ok',
            requestId: requestIdOf(req),
          })
        }
      }

      res.setHeader('Cache-Control', 'no-store')
      res.json({ item })
    } catch (err) {
      next(err)
    }
  })

  return router
}
