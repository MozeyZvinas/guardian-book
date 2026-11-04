import { and, asc, eq } from 'drizzle-orm'
import { Router } from 'express'
import { sourceRefSchema, type GuidelineStep, type ItemDetail, type ItemSource, type ItemSummary } from '@guardian-book/shared'
import { can } from '../access/index.js'
import { recordAudit } from '../audit/record.js'
import { requireActor } from '../auth/session.js'
import type { Db } from '../db/client.js'
import { classMembers, guidelineApprovals, guidelineSteps, items } from '../db/schema.js'
import { notFound, requestIdOf, uuidParam } from '../lib/http.js'

/**
 * Items (spec 03 §4, §5): approved items for anyone signed in; the guideline steps only
 * when `access.can(item.guideline.read)` says so (a learner after their own attempt; a
 * teacher once a learner in their class attempted it; admin, audited).
 */
export function itemsRouter(db: Db): Router {
  const router = Router()

  // B09: the list carries the question text, and for a learner says which items a class
  // of theirs has approved (those first; the rest stay listed, so the picker never shows a slug).
  router.get('/api/items', async (_req, res, next) => {
    try {
      const actor = requireActor(res)
      const rows = await db
        .select({
          id: items.id,
          slug: items.slug,
          topic: items.topic,
          skillTags: items.skillTags,
          maxMarks: items.maxMarks,
          revision: items.revision,
          promptMd: items.promptMd,
          source: items.source,
          attribution: items.attribution,
          sourceRef: items.sourceRef,
        })
        .from(items)
        // B17 (D31): a held-out question is never offered.
        .where(and(eq(items.status, 'approved'), eq(items.heldOut, false)))
        .orderBy(asc(items.slug))
      let list: ItemSummary[] = rows.map((row) => ({ ...row, ...sourceFields(row) }))
      if (actor.role === 'learner') {
        const approvals = await db
          .select({ itemId: guidelineApprovals.itemId, itemRevision: guidelineApprovals.itemRevision })
          .from(guidelineApprovals)
          .innerJoin(classMembers, and(eq(classMembers.classId, guidelineApprovals.classId), eq(classMembers.learnerId, actor.userId)))
        const approved = new Set(approvals.map((a) => `${a.itemId}@${a.itemRevision}`))
        list = list
          .map((row) => ({ ...row, approvedForYou: approved.has(`${row.id}@${row.revision}`) }))
          .sort((a, b) => Number(b.approvedForYou) - Number(a.approvedForYou) || a.slug.localeCompare(b.slug))
      }
      res.setHeader('Cache-Control', 'no-store')
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
        .where(and(eq(items.id, itemId), eq(items.status, 'approved'), eq(items.heldOut, false)))
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
        ...sourceFields(row),
      }
      // Teachers see where an item came from, so an AI-drafted guideline is labelled
      // "check before approving" (B07) and never mistaken for a reviewed one.
      if (actor.role === 'teacher' || actor.role === 'admin') {
        item.provenance = row.provenance
        item.reviewer = row.reviewer
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

/** B17 (D40): where an item came from and its attribution line, as every item response carries them. */
export function sourceFields(row: { source: string; attribution: string | null; sourceRef: unknown }): Pick<ItemSummary, 'source' | 'attribution' | 'sourceRef'> {
  const ref = sourceRefSchema.safeParse(row.sourceRef)
  return { source: row.source as ItemSource, attribution: row.attribution, sourceRef: ref.success ? ref.data : null }
}
