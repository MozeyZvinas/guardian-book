import { and, asc, eq, inArray } from 'drizzle-orm'
import type { ApproveGuidelineBody, ApproveGuidelineResponse, GuidelineItemView, GuidelinesResponse } from '@guardian-book/shared'
import { can } from '../access/index.js'
import { recordAudit } from '../audit/record.js'
import type { Actor } from '../auth/session.js'
import type { Db } from '../db/client.js'
import { classes, guidelineApprovals, guidelineSteps, items, profiles } from '../db/schema.js'
import { appendEvent } from '../evidence/append.js'
import { HttpError, notFound } from '../lib/http.js'

/**
 * T7 · Guidelines (spec 03 §9.1 `guideline_approvals`, §9.3; spec 05 §9 T7; brief B07 §1).
 * The items the class may use, each with its M/A/CA steps and the approval state for the
 * class; "Approve for 12A" is per item revision and idempotent. An attempt in the class can
 * be assessed only against an approved revision (B04 enforces it: 409 `guideline_not_approved`).
 */

export const revisionMismatch = () =>
  new HttpError(409, 'revision_mismatch', 'The guideline has changed since you opened it. Reload and approve the current revision.')

async function classRef(db: Db, classId: string): Promise<{ id: string; name: string }> {
  const [cls] = await db.select({ id: classes.id, name: classes.name }).from(classes).where(eq(classes.id, classId)).limit(1)
  if (!cls) throw notFound()
  return cls
}

export async function listGuidelines(db: Db, actor: Actor, classId: string): Promise<GuidelinesResponse> {
  if (!(await can(db, actor, 'guideline.read', { type: 'class', id: classId }))) throw notFound()
  const cls = await classRef(db, classId)
  const rows = await db.select().from(items).where(eq(items.status, 'approved')).orderBy(asc(items.slug))
  if (rows.length === 0) return { class: cls, items: [] }
  const itemIds = rows.map((row) => row.id)
  const steps = await db
    .select({
      id: guidelineSteps.id,
      itemId: guidelineSteps.itemId,
      stepNo: guidelineSteps.stepNo,
      stepType: guidelineSteps.stepType,
      criterion: guidelineSteps.criterion,
      marks: guidelineSteps.marks,
      skillTag: guidelineSteps.skillTag,
      notes: guidelineSteps.notes,
    })
    .from(guidelineSteps)
    .where(inArray(guidelineSteps.itemId, itemIds))
    .orderBy(asc(guidelineSteps.stepNo))
  const approvals = await db
    .select({
      itemId: guidelineApprovals.itemId,
      itemRevision: guidelineApprovals.itemRevision,
      approvedAt: guidelineApprovals.approvedAt,
      approvedById: guidelineApprovals.approvedBy,
      approvedByNickname: profiles.nickname,
    })
    .from(guidelineApprovals)
    .innerJoin(profiles, eq(profiles.userId, guidelineApprovals.approvedBy))
    .where(eq(guidelineApprovals.classId, classId))

  const list: GuidelineItemView[] = rows.map((row) => {
    const approval = approvals.find((a) => a.itemId === row.id && a.itemRevision === row.revision) ?? null
    return {
      id: row.id,
      slug: row.slug,
      topic: row.topic,
      skillTags: row.skillTags,
      maxMarks: row.maxMarks,
      revision: row.revision,
      promptMd: row.promptMd,
      provenance: row.provenance,
      reviewer: row.reviewer,
      aiDrafted: row.provenance === 'model_generated',
      steps: steps.filter((step) => step.itemId === row.id).map(({ itemId: _itemId, ...step }) => step),
      approval: approval
        ? { itemRevision: approval.itemRevision, approvedAt: approval.approvedAt.toISOString(), approvedBy: { id: approval.approvedById, nickname: approval.approvedByNickname } }
        : null,
    }
  })
  return { class: cls, items: list }
}

export async function approveGuideline(db: Db, actor: Actor, classId: string, itemId: string, body: ApproveGuidelineBody, requestId?: string): Promise<ApproveGuidelineResponse> {
  if (!(await can(db, actor, 'guideline.approve', { type: 'class', id: classId }))) throw notFound()
  const [item] = await db
    .select({ id: items.id, revision: items.revision })
    .from(items)
    .where(and(eq(items.id, itemId), eq(items.status, 'approved')))
    .limit(1)
  if (!item) throw notFound()
  if (item.revision !== body.itemRevision) throw revisionMismatch()

  return db.transaction(async (tx) => {
    const inserted = await tx
      .insert(guidelineApprovals)
      .values({ classId, itemId, itemRevision: item.revision, approvedBy: actor.userId })
      .onConflictDoNothing()
      .returning({ approvedAt: guidelineApprovals.approvedAt })
    const fresh = inserted[0]
    if (!fresh) {
      const [existing] = await tx
        .select({ approvedAt: guidelineApprovals.approvedAt })
        .from(guidelineApprovals)
        .where(and(eq(guidelineApprovals.classId, classId), eq(guidelineApprovals.itemId, itemId), eq(guidelineApprovals.itemRevision, item.revision)))
        .limit(1)
      if (!existing) throw notFound()
      return { approval: { classId, itemId, itemRevision: item.revision, approvedAt: existing.approvedAt.toISOString() }, replayed: true }
    }
    // One event per approval, recorded against the teacher (D37's precedent for a teacher's
    // class artefact: `learning_events.learner_id` has no class-level alternative).
    await appendEvent(tx, {
      learnerId: actor.userId,
      kind: 'guideline_approved',
      itemId,
      basis: 'none',
      payload: { class_id: classId, item_id: itemId, item_revision: item.revision },
    })
    await recordAudit(tx, { actorId: actor.userId, action: 'guideline.approved', subjectType: 'guideline_approval', subjectId: `${classId}:${itemId}:${item.revision}`, outcome: 'ok', requestId: requestId ?? null })
    return { approval: { classId, itemId, itemRevision: item.revision, approvedAt: fresh.approvedAt.toISOString() }, replayed: false }
  })
}
